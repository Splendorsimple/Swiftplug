// Fills in the <div id="navbar"></div> placeholder that every page includes.
// Classic hamburger-style navbar: just the logo + a 3-line toggle button are
// always visible; everything else (wallet, theme, links, sign out) lives in a
// scrollable dropdown panel so the top bar stays compact on small screens.
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
                                                  <button id="menu-toggle-btn" class="menu-toggle" aria-label="Open menu" aria-expanded="false">☰</button>

                                                      <div id="nav-overlay" class="nav-overlay hidden"></div>
                                                          <div id="nav-menu" class="nav-menu hidden">
                                                                <div class="nav-menu-scroll">
                                                                        ${session ? `
                                                                                  <div class="nav-menu-wallet">
                                                                                              <span class="muted" style="font-size:.8rem">Wallet balance</span>
                                                                                                          <span class="wallet-chip mono">${fmt(profile?.wallet_balance)}</span>
                                                                                                                    </div>
                                                                                                                            ` : ''}
                                                                                                                                    <button id="theme-toggle-btn" class="nav-menu-item">
                                                                                                                                              <span>${themeButtonLabel()}</span> <span>Toggle theme</span>
                                                                                                                                                      </button>
                                                                                                                                                              ${session ? `
                                                                                                                                                                        ${isAdmin ? '<a href="admin.html" class="nav-menu-item" style="color:rgb(var(--highlight))">Admin</a>' : ''}
                                                                                                                                                                                  <a href="dashboard.html" class="nav-menu-item">Workspace</a>
                                                                                                                                                                                            <button id="nav-signout" class="nav-menu-item">Sign out</button>
                                                                                                                                                                                                    ` : `
                                                                                                                                                                                                              <a href="login.html" class="nav-menu-item">Sign in</a>
                                                                                                                                                                                                                        <a href="signup.html" class="nav-menu-item" style="color:rgb(var(--highlight));font-weight:700">Get started</a>
                                                                                                                                                                                                                                `}
                                                                                                                                                                                                                                      </div>
                                                                                                                                                                                                                                          </div>
                                                                                                                                                                                                                                            `

                                                                                                                                                                                                                                              const menu = document.getElementById('nav-menu')
                                                                                                                                                                                                                                                const overlay = document.getElementById('nav-overlay')
                                                                                                                                                                                                                                                  const toggleBtn = document.getElementById('menu-toggle-btn')

                                                                                                                                                                                                                                                    function openMenu() {
                                                                                                                                                                                                                                                        menu.classList.remove('hidden')
                                                                                                                                                                                                                                                            overlay.classList.remove('hidden')
                                                                                                                                                                                                                                                                toggleBtn.setAttribute('aria-expanded', 'true')
                                                                                                                                                                                                                                                                  }
                                                                                                                                                                                                                                                                    function closeMenu() {
                                                                                                                                                                                                                                                                        menu.classList.add('hidden')
                                                                                                                                                                                                                                                                            overlay.classList.add('hidden')
                                                                                                                                                                                                                                                                                toggleBtn.setAttribute('aria-expanded', 'false')
                                                                                                                                                                                                                                                                                  }

                                                                                                                                                                                                                                                                                    toggleBtn.addEventListener('click', () => {
                                                                                                                                                                                                                                                                                        menu.classList.contains('hidden') ? openMenu() : closeMenu()
                                                                                                                                                                                                                                                                                          })
                                                                                                                                                                                                                                                                                            overlay.addEventListener('click', closeMenu)

                                                                                                                                                                                                                                                                                              document.getElementById('theme-toggle-btn').addEventListener('click', () => {
                                                                                                                                                                                                                                                                                                  toggleTheme()
                                                                                                                                                                                                                                                                                                      document.getElementById('theme-toggle-btn').innerHTML = `<span>${themeButtonLabel()}</span> <span>Toggle theme</span>`
                                                                                                                                                                                                                                                                                                        })

                                                                                                                                                                                                                                                                                                          const signOutBtn = document.getElementById('nav-signout')
                                                                                                                                                                                                                                                                                                            if (signOutBtn) {
                                                                                                                                                                                                                                                                                                                signOutBtn.addEventListener('click', async () => {
                                                                                                                                                                                                                                                                                                                      await supabase.auth.signOut()
                                                                                                                                                                                                                                                                                                                            window.location.href = 'index.html'
                                                                                                                                                                                                                                                                                                                                })
                                                                                                                                                                                                                                                                                                                                  }
                                                                                                                                                                                                                                                                                                                                  }