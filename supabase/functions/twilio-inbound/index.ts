// Edge Function: twilio-inbound
// Twilio calls this when a REAL number receives an SMS or a call.
// Deploy with "Enforce JWT verification" OFF (Twilio has no Supabase login) — it is protected by a secret instead.
// In Twilio, set the number's webhook URL to:
//   https://<project>.supabase.co/functions/v1/twilio-inbound?secret=<INBOUND_WEBHOOK_SECRET>
import { serve } from 'https://deno.land/std/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const twiml = () => new Response('<Response></Response>', { headers: { 'Content-Type': 'text/xml' } })

serve(async (req) => {
  const url = new URL(req.url)
  if (url.searchParams.get('secret') !== Deno.env.get('INBOUND_WEBHOOK_SECRET')) {
    return new Response('Unauthorized', { status: 401 })
  }
  const form = await req.formData()
  const to = String(form.get('To') || '')
  const from = String(form.get('From') || '')

  const { data: num } = await admin.from('numbers').select('id').eq('phone_number', to).eq('status', 'active').maybeSingle()
  if (!num) return twiml()

  if (form.get('Body') !== null) {
    await admin.from('messages').upsert(
      [{ number_id: num.id, from_number: from, body: String(form.get('Body')), external_id: String(form.get('MessageSid') || crypto.randomUUID()) }],
      { onConflict: 'number_id,external_id', ignoreDuplicates: true }
    )
  } else if (form.get('CallSid')) {
    await admin.from('calls').insert({ number_id: num.id, from_number: from, duration_seconds: Number(form.get('CallDuration') || 0) })
  }
  return twiml()
})
