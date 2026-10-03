// Supabase Edge Function: purchase-real
// Same provision-on-demand principle as purchase-disposable, but for long-term
// real numbers (e.g. via Twilio), with a monthly plan_duration instead of a 20-min expiry.

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
    if (!pricing_id || !quantity || quantity < 1) return json({ error: 'Invalid request' }, 400)

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_suspended')
      .eq('id', user.id)
      .single()
    if (profile?.is_suspended) return json({ error: 'Account suspended' }, 403)

    const { data: pricing } = await supabase.from('pricing').select('*, providers(*)').eq('id', pricing_id).single()
    if (!pricing || !pricing.is_active) return json({ error: 'Plan not found or inactive' }, 404)
    if (quantity > (pricing.max_quantity_per_purchase || 10)) {
      return json({ error: `Max ${pricing.max_quantity_per_purchase} per purchase.` }, 400)
    }

    const { data: discounts } = await supabase
      .from('discounts')
      .select('*')
      .eq('is_active', true)
      .lte('min_quantity', quantity)
      .or('applies_to.eq.real,applies_to.eq.both')
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

    const { data: deducted } = await supabase.rpc('decrement_wallet', { uid: user.id, amt: total, note: 'Real number purchase' })
    if (!deducted) return json({ error: 'Insufficient wallet balance' }, 402)

    const renewalDate = calculateRenewalDate(pricing.plan_duration)
    const provisioned = []

    for (let i = 0; i < quantity; i++) {
      try {
        const providerResult = await provisionRealNumber(pricing.providers)
        const { data: numberRow, error: insertErr } = await supabase
          .from('numbers')
          .insert({
            user_id: user.id,
            provider_id: pricing.provider_id,
            pricing_id: pricing.id,
            phone_number: providerResult.phone_number,
            number_type: 'real',
            status: 'active',
            expires_at: renewalDate.toISOString(),
            external_id: providerResult.external_id
          })
          .select()
          .single()
        if (!insertErr) provisioned.push(numberRow)
      } catch (provErr) {
        console.error('Real number provisioning failed for one unit:', provErr)
        await supabase.rpc('increment_wallet', { uid: user.id, amt: total / quantity, note: 'Refund: one real number could not be provisioned' })
      }
    }

    if (provisioned.length === 0) {
      await supabase.rpc('increment_wallet', { uid: user.id, amt: total, note: 'Refund: real purchase failed' })
      return json({ error: 'Provider could not fulfill this request. You have been refunded.' }, 502)
    }

    await supabase.from('purchase_log').insert({
      user_id: user.id,
      number_type: 'real',
      quantity: provisioned.length
    })

    return json({ ok: true, numbers: provisioned, charged: total })
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})

function calculateRenewalDate(planDuration: string): Date {
  const now = new Date()
  const months = planDuration?.includes('3month') ? 3 : planDuration?.includes('1month') ? 1 : 1
  now.setMonth(now.getMonth() + months)
  return now
}

// -----------------------------------------------------------------------
// TODO: replace with a REAL call to Twilio's "buy available number" API.
// Twilio requires: 1) search available numbers for the country, 2) purchase one,
// 3) attach a messaging/voice webhook pointing at your paystack-webhook-style
// Edge Function URL so incoming SMS/calls get written to `messages`/`calls`.
// See: https://www.twilio.com/docs/phone-numbers/api/availablephonenumber-resource
// -----------------------------------------------------------------------
async function provisionRealNumber(providerConfig: any) {
  const res = await fetch(`${providerConfig.base_url}/IncomingPhoneNumbers.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(providerConfig.api_key_encrypted)}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'PhoneNumber=+1XXXXXXXXXX' // replace with a real search result from Twilio
  })
  if (!res.ok) throw new Error(`Provider error: ${res.status}`)
  const data = await res.json()
  return {
    phone_number: data.phone_number,
    external_id: data.sid
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}
