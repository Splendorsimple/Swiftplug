import { supabase } from './supabaseClient.js'
import { renderNavbar } from './nav.js'
renderNavbar()

document.getElementById('reset-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const errorEl = document.getElementById('error')
  const { error } = await supabase.auth.updateUser({ password: document.getElementById('password').value })
  if (error) {
    errorEl.textContent = error.message
    errorEl.classList.remove('hidden')
    return
  }
  document.getElementById('reset-form').classList.add('hidden')
  document.getElementById('done-msg').classList.remove('hidden')
  setTimeout(() => window.location.href = 'dashboard.html', 1500)
})
