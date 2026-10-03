import { supabase } from './supabaseClient.js'
import { renderNavbar } from './nav.js'
renderNavbar()

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const errorEl = document.getElementById('login-error')
  const btn = document.getElementById('login-btn')
  errorEl.classList.add('hidden')
  btn.disabled = true; btn.textContent = 'Signing in...'

  const { error } = await supabase.auth.signInWithPassword({
    email: document.getElementById('email').value,
    password: document.getElementById('password').value
  })

  if (error) {
    errorEl.textContent = error.message
    errorEl.classList.remove('hidden')
    btn.disabled = false; btn.textContent = 'Sign in'
  } else {
    window.location.href = 'dashboard.html'
  }
})

document.getElementById('google-btn').addEventListener('click', async () => {
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/dashboard.html` }
  })
})
