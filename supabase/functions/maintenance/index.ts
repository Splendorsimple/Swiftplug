// Edge Function: maintenance — run every 5 minutes by pg_cron (see guide, "Schedule the maintenance job").
// 1) Expires disposable numbers past their 20 minutes.
// 2) Renews real numbers that are due (charging the wallet); releases them if the wallet can't cover it.
// Deploy with "Enforce JWT verification" OFF; it is protected by the x-cron-secret header.
import { serve } from 'https://deno.land/std/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) return new Response('Unauthorized', { status: 401 })
  const nowIso = new Date().toISOString()
  const out = { expired: 0, renewed: 0, released: 0 }

  // 1) expire disposable
  const { data: dead } = await admin.from('numbers').select('id, external_id, providers(*)')
    .eq('number_type', 'disposable').eq('status', 'active').lt('expires_at', nowIso)
  for (const n of dead || []) {
    try { await finishWithProvider((n as any).providers, n.external_id) } catch (e) { console.error(e) }
    await admin.from('numbers').update({ status: 'expired' }).eq('id', n.id)
    out.expired++
  }

  // 2) renew or release real numbers that are due
  const { data: due } = await admin.from('numbers').select('id, user_id, external_id, pricing(sell_price, plan_duration), providers(*)')
    .eq('number_type', 'real').eq('status', 'active').lt('expires_at', nowIso)
  for (const n of (due || []) as any[]) {
    const price = n.pricing?.sell_price ?? 0
    const { data: ok } = await admin.rpc('decrement_wallet', { uid: n.user_id, amt: price, note: 'Number renewal', tx_type: 'renewal' })
    if (ok) {
      const next = new Date(); next.setMonth(next.getMonth() + (String(n.pricing?.plan_duration).includes('3month') ? 3 : 1))
      await admin.from('numbers').update({ expires_at: next.toISOString() }).eq('id', n.id)
      out.renewed++
    } else {
      try { await releaseWithProvider(n.providers, n.external_id) } catch (e) { console.error(e) }
      await admin.from('numbers').update({ status: 'released' }).eq('id', n.id)
      out.released++
    }
  }
  return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } })
})

// TODO: adapt both to your providers (cancel/finish a 5sim order; release a Twilio number).
async function finishWithProvider(_provider: any, _externalId: string) { /* e.g. GET {base}/user/finish/{id} */ }
async function releaseWithProvider(_provider: any, _externalId: string) { /* e.g. DELETE {base}/IncomingPhoneNumbers/{sid}.json */ }
