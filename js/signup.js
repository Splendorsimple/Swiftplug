import { supabase } from './supabaseClient.js'
import { renderNavbar } from './nav.js'
renderNavbar()

document.getElementById('signup-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const errorEl = document.getElementById('signup-error')
  const btn = document.getElementById('signup-btn')
  errorEl.classList.add('hidden')

  if (!document.getElementById('agree').checked) {
    errorEl.textContent = 'You must accept the Terms of Service to continue.'
    errorEl.classList.remove('hidden')
    return
  }

  btn.disabled = true; btn.textContent = 'Creating account...'
  const email = document.getElementById('email').value

  const { error } = await supabase.auth.signUp({
    email,
    password: document.getElementById('password').value
  })

  if (error) {
    errorEl.textContent = error.message
    errorEl.classList.remove('hidden')
    btn.disabled = false; btn.textContent = 'Create account'
  } else {
    document.getElementById('signup-form-wrap').classList.add('hidden')
    document.getElementById('signup-done').classList.remove('hidden')
    document.getElementById('sent-email').textContent = email
  }
})

document.getElementById('google-btn').addEventListener('click', async () => {
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/dashboard.html` }
  })
})
