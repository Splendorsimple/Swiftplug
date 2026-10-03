// Supabase Edge Function: paystack-webhook
// Backup safety net — Paystack calls this directly on payment events, independent of
// whether the user's browser stayed open. Set this URL in Paystack Dashboard →
// Settings → API Keys & Webhooks → Webhook URL.

import { serve } from 'https://deno.land/std/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { crypto } from 'https://deno.land/std/crypto/mod.ts'

const PAYSTACK_SECRET = Deno.env.get('PAYSTACK_SECRET_KEY')!
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

serve(async (req) => {
  const bodyText = await req.text()
  const signature = req.headers.get('x-paystack-signature')

  // Verify the request genuinely came from Paystack using HMAC SHA512 of the raw body.
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(PAYSTACK_SECRET),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  )
  const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(bodyText))
  const computedSig = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  if (computedSig !== signature) {
    return new Response('Invalid signature', { status: 401 })
  }

  const event = JSON.parse(bodyText)

  if (event.event === 'charge.success') {
    const email = event.data.customer.email
    const amountNaira = event.data.amount / 100

    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single()

    if (profile) {
      // credit_wallet_once ignores a reference it has already credited, so the browser
      // verify call and this webhook can both fire without double-crediting.
      await supabase.rpc('credit_wallet_once', {
        uid: profile.id,
        amt: amountNaira,
        ref: event.data.reference
      })
    }
  }

  return new Response('OK', { status: 200 })
})
