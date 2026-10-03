// Supabase Edge Function: verify-payment
// Called by the frontend right after a Paystack popup reports success.
// Re-verifies with Paystack directly (server-side) before crediting the wallet,
// so a faked "success" in the browser can never credit money that wasn't paid.

import { serve } from 'https://deno.land/std/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PAYSTACK_SECRET = Deno.env.get('PAYSTACK_SECRET_KEY')
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! // service_role bypasses RLS — required for wallet writes
)

serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ ok: false, error: 'Missing auth' }, 401)

    // Identify the calling user from their JWT (never trust a user_id sent in the body)
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    })
    const {
      data: { user },
      error: userErr
    } = await userClient.auth.getUser()
    if (userErr || !user) return json({ ok: false, error: 'Invalid session' }, 401)

    const { reference } = await req.json()
    if (!reference) return json({ ok: false, error: 'Missing reference' }, 400)

    const paystackRes = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` }
    })
    const data = await paystackRes.json()

    if (!data.status || data.data?.status !== 'success') {
      return json({ ok: false, error: 'Payment not successful' }, 400)
    }

    // Confirm the payment was actually made by this same user's email, not spoofed.
    if (data.data.customer?.email !== user.email) {
      return json({ ok: false, error: 'Payment email mismatch' }, 400)
    }

    const amountNaira = data.data.amount / 100 // Paystack amounts are in kobo

    // Idempotent: credits only the first time this Paystack reference is seen
    // (the webhook may also try to credit the same payment).
    const { error: creditErr } = await supabase.rpc('credit_wallet_once', {
      uid: user.id,
      amt: amountNaira,
      ref: reference
    })
    if (creditErr) return json({ ok: false, error: creditErr.message }, 500)

    return json({ ok: true, credited: amountNaira })
  } catch (err) {
    return json({ ok: false, error: err.message }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}
