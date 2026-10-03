// Supabase Edge Function: purchase-disposable
// Provision-on-demand: numbers are only requested from the provider AT THE MOMENT
// of purchase, never pre-stocked. Handles quantity, discounts, and tiered rate limits.

import { serve } from 'https://deno.land/std/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing auth' }, 401)

    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    })
    const {
      data: { user },
      error: userErr
    } = await userClient.auth.getUser()
    if (userErr || !user) return json({ error: 'Invalid session' }, 401)

    const { pricing_id, quantity } = await req.json()
    if (!pricing_id || !quantity || quantity < 1) {
      return json({ error: 'Invalid request' }, 400)
    }

    // --- Check suspension ---
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_suspended, wallet_balance, created_at')
      .eq('id', user.id)
      .single()
    if (profile?.is_suspended) return json({ error: 'Account suspended' }, 403)

    // --- Rate limiting: tiered by account age ---
    const { data: limits } = await supabase.from('rate_limit_settings').select('*').single()
    const accountAgeHours = (Date.now() - new Date(profile.created_at).getTime()) / 3_600_000
    const isNewAccount = accountAgeHours < (limits?.new_account_window_hours ?? 48)
    const hourlyCap = isNewAccount
      ? limits?.new_account_hourly_limit ?? 5
      : limits?.established_account_hourly_limit ?? 20

    const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString()
    const { data: recentPurchases } = await supabase
      .from('purchase_log')
      .select('quantity')
      .eq('user_id', user.id)
      .eq('number_type', 'disposable')
      .gte('created_at', oneHourAgo)
    const purchasedLastHour = (recentPurchases || []).reduce((sum, r) => sum + r.quantity, 0)

    if (purchasedLastHour + quantity > hourlyCap) {
      return json(
        { error: `Rate limit exceeded. You can buy up to ${hourlyCap} disposable numbers per hour.` },
        429
      )
    }

    // --- Load pricing + enforce max quantity per purchase ---
    const { data: pricing } = await supabase.from('pricing').select('*, providers(*)').eq('id', pricing_id).single()
    if (!pricing || !pricing.is_active) return json({ error: 'Pricing not found or inactive' }, 404)
    if (quantity > (pricing.max_quantity_per_purchase || 10)) {
      return json({ error: `Max ${pricing.max_quantity_per_purchase} per purchase.` }, 400)
    }

    // --- Apply bulk discount ---
    const { data: discounts } = await supabase
      .from('discounts')
      .select('*')
      .eq('is_active', true)
      .lte('min_quantity', quantity)
      .or('applies_to.eq.disposable,applies_to.eq.both')
      .order('min_quantity', { ascending: false })
      .limit(1)
    const discount = discounts?.[0]

    let total = pricing.sell_price * quantity
    if (discount) {
      total =
        discount.discount_type === 'percentage'
          ? total * (1 - discount.discount_value / 100)
          : Math.max(0, total - discount.discount_value)
    }

    // --- Deduct wallet BEFORE provisioning (atomic check-and-deduct) ---
    const { data: deducted } = await supabase.rpc('decrement_wallet', { uid: user.id, amt: total, note: 'Disposable number purchase' })
    if (!deducted) return json({ error: 'Insufficient wallet balance' }, 402)

    // --- Provision each number live from the provider ---
    const provisioned = []
    for (let i = 0; i < quantity; i++) {
      try {
        const providerResult = await provisionFromProvider(pricing.providers)
        const { data: numberRow, error: insertErr } = await supabase
          .from('numbers')
          .insert({
            user_id: user.id,
            provider_id: pricing.provider_id,
            pricing_id: pricing.id,
            phone_number: providerResult.phone_number,
            number_type: 'disposable',
            status: 'active',
            expires_at: new Date(Date.now() + 20 * 60 * 1000).toISOString(), // 20 minutes
            external_id: providerResult.external_id
          })
          .select()
          .single()
        if (!insertErr) provisioned.push(numberRow)
      } catch (provErr) {
        console.error('Provisioning failed for one unit:', provErr)
        // Refund for the units that failed to provision
        await supabase.rpc('increment_wallet', { uid: user.id, amt: total / quantity, note: 'Refund: one disposable number could not be provisioned' })
      }
    }

    if (provisioned.length === 0) {
      // Full refund if nothing was provisioned at all
      await supabase.rpc('increment_wallet', { uid: user.id, amt: total, note: 'Refund: disposable purchase failed' })
      return json({ error: 'Provider could not fulfill this request. You have been refunded.' }, 502)
    }

    await supabase.from('purchase_log').insert({
      user_id: user.id,
      number_type: 'disposable',
      quantity: provisioned.length
    })

    return json({ ok: true, numbers: provisioned, charged: total })
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})

// -----------------------------------------------------------------------
// TODO: replace this with a REAL call to your provider's API (5sim, sms-activate, etc.)
// This is a template shaped like 5sim's "buy" endpoint pattern — adjust to whichever
// provider is set active for this pricing row. providerConfig.base_url and
// providerConfig.api_key_encrypted come from the `providers` table you manage in admin.
// -----------------------------------------------------------------------
async function provisionFromProvider(providerConfig: any) {
  const res = await fetch(`${providerConfig.base_url}/user/buy/activation/example-country/example-service`, {
    headers: { Authorization: `Bearer ${providerConfig.api_key_encrypted}` }
  })
  if (!res.ok) throw new Error(`Provider error: ${res.status}`)
  const data = await res.json()
  return {
    phone_number: data.phone, // adjust field name to match actual provider response
    external_id: String(data.id)
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}
