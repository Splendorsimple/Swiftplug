// Edge Function: poll-sms
// The browser calls this every ~5s for each active DISPOSABLE number. It asks the provider
// for new SMS server-side (so provider keys never reach the browser) and stores them in `messages`;
// the frontend sees them instantly through Supabase Realtime.
import { serve } from 'https://deno.land/std/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return json({ error: 'Missing auth' }, 401)
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'Invalid session' }, 401)

    const { number_id } = await req.json()
    const { data: num } = await admin.from('numbers').select('*, providers(*)').eq('id', number_id).single()
    if (!num || num.user_id !== user.id) return json({ error: 'Not found' }, 404)   // ownership check
    if (num.status !== 'active' || num.number_type !== 'disposable') return json({ ok: true, count: 0 })

    const sms = await fetchSmsFromProvider(num.providers, num.external_id)
    if (sms.length) {
      await admin.from('messages').upsert(
        sms.map((m) => ({ number_id: num.id, from_number: m.from, body: m.text, external_id: m.id })),
        { onConflict: 'number_id,external_id', ignoreDuplicates: true }
      )
    }
    return json({ ok: true, count: sms.length })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})

// TODO: adapt to your provider. Shaped like 5sim's "check order" call; sms-activate etc. differ.
// Must return [{ id, from, text }] with a STABLE id per message (used to avoid duplicates).
async function fetchSmsFromProvider(provider: any, externalId: string) {
  const res = await fetch(`${provider.base_url}/user/check/${externalId}`, {
    headers: { Authorization: `Bearer ${provider.api_key_encrypted}`, Accept: 'application/json' }
  })
  if (!res.ok) throw new Error(`Provider error ${res.status}`)
  const data = await res.json()
  return (data.sms || []).map((m: any) => ({ id: String(m.id), from: m.sender, text: m.text }))
}
