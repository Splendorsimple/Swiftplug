// Fills in the <div id="navbar"></div> placeholder that every page includes.
// This is the one bit of "shared code" in an otherwise traditional multi-page site —
// instead of pasting the same navbar HTML into 9 files by hand (and forgetting to
// update one later), each page just has an empty div and this script fills it in.
import { supabase } from './supabaseClient.js'
import { initTheme, toggleTheme, themeButtonLabel } from './theme.js'
import { fmt } from './currency.js'

export async function renderNavbar() {
  initTheme()
  const el = document.getElementById('navbar')
  if (!el) return

  const { data: { session } } = await supabase.auth.getSession()
  let profile = null
  if (session) {
    const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    profile = data
  }

  const isAdmin = profile?.role === 'admin'

  el.innerHTML = `
    <a href="index.html" class="logo">
      <img src="assets/logo.png" alt="SwiftPlug logo" />
      <span>swift<span class="accent">plug</span></span>
    </a>
    <div class="nav-right">
      ${session ? `<span class="wallet-chip">${fmt(profile?.wallet_balance)}</span>` : ''}
      <button id="theme-toggle-btn" class="theme-toggle">${themeButtonLabel()}</button>
      ${
        session
          ? `
            ${isAdmin ? '<a href="admin.html" style="color:rgb(var(--highlight))">Admin</a>' : ''}
            <a href="dashboard.html">Workspace</a>
            <button id="nav-signout">Sign out</button>
          `
          : `
            <a href="login.html">Sign in</a>
            <a href="signup.html" class="pill-btn" style="text-decoration:none;display:inline-block">Get started</a>
          `
      }
    </div>
  `

  document.getElementById('theme-toggle-btn').addEventListener('click', toggleTheme)

  const signOutBtn = document.getElementById('nav-signout')
  if (signOutBtn) {
    signOutBtn.addEventListener('click', async () => {
      await supabase.auth.signOut()
      window.location.href = 'index.html'
    })
  }
}
