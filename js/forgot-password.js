import { supabase } from './supabaseClient.js'
import { renderNavbar } from './nav.js'
renderNavbar()

document.getElementById('forgot-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const email = document.getElementById('email').value
  const errorEl = document.getElementById('error')
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password.html`
  })
  if (error) {
    errorEl.textContent = error.message
    errorEl.classList.remove('hidden')
    return
  }
  document.getElementById('form-wrap').classList.add('hidden')
  const msg = document.getElementById('sent-msg')
  msg.textContent = `If an account exists for ${email}, a reset link has been sent.`
  msg.classList.remove('hidden')
})
