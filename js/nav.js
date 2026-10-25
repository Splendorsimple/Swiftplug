import './support.js'
// Fills in the <div id="navbar"></div> placeholder that every page includes.
// Header: menu button, logo, wallet pill, avatar. The menu is a full-height slide-in panel
// with a balance card, grouped links, a support card and a pinned footer.
import { supabase } from './supabaseClient.js'
import { initTheme, toggleTheme } from './theme.js'
import { fmt } from './currency.js'

const I = {
  burger: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  mobile: '<rect x="7" y="2" width="10" height="20" rx="3"/><path d="M11 18h2"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20M6 15h4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  rocket: '<path d="M12 3c3 2 5 5 5 9l-2 3H9l-2-3c0-4 2-7 5-9z"/><circle cx="12" cy="10" r="1.5"/><path d="M9 15l-2 4 3-1M15 15l2 4-3-1"/>',
  send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-5.4A8 8 0 1 1 21 12z"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M3 6h.01M3 12h.01M3 18h.01"/>'
}
const svg = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${I[k]}</svg>`
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))

function isActive(href) {
  const u = new URL(href, location.href)
  if (u.pathname !== location.pathname) return false
  const a = u.searchParams, b = new URLSearchParams(location.search)
  return ['section', 'kind'].every(k => (a.get(k) || '') === (b.get(k) || ''))
}
const item = (href, icon, label) =>
  `<a class="nb-item${isActive(href) ? ' active' : ''}" href="${href}"><span class="nb-ic">${svg(icon)}</span><span>${label}</span></a>`
const soon = (icon, label) =>
  `<div class="nb-item nb-soon"><span class="nb-ic">${svg(icon)}</span><span>${label}</span><em>SOON</em></div>`
const section = (icon, title, body) =>
  `<div class="nb-sec"><div class="nb-sec-title">${svg(icon)}<span>${title}</span></div>${body}</div>`

export async function renderNavbar() {
  initTheme()
  const el = document.getElementById('navbar')
  if (!el) return
  el.classList.add('nb')

  const { data: { session } } = await supabase.auth.getSession()
  let profile = null
  if (session) {
    const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    profile = data
  }
  const isAdmin = profile?.role === 'admin'
  const email = session?.user?.email || ''
  const initial = (email[0] || 'U').toUpperCase()
  el.classList.toggle('nb-in', !!session)

  const body = session ? `
    <div class="nb-hero">
      <div class="nb-who"><span class="nb-av">${esc(initial)}</span><span class="nb-mail">${esc(email)}</span></div>
      <div class="nb-bal-l">Balance</div>
      <div class="nb-bal mono">${esc(fmt(profile?.wallet_balance))}</div>
      <div class="nb-hero-btns">
        <a class="nb-b1" href="dashboard.html?section=wallet">${svg('plus')} Fund</a>
        <a class="nb-b2" href="dashboard.html?section=wallet">${svg('clock')} History</a>
      </div>
    </div>
    ${section('grid', 'DASHBOARD',
      item('index.html', 'home', 'Overview') +
      item('dashboard.html', 'plus', 'Get a number') +
      item('dashboard.html?section=mine', 'mobile', 'My numbers') +
      item('dashboard.html?section=wallet', 'card', 'Wallet'))}
    ${section('shield', 'VERIFICATIONS',
      item('dashboard.html', 'phone', 'One-time numbers') +
      item('dashboard.html?kind=real', 'clock', 'Longer-term numbers'))}
    ${section('rocket', 'COMING SOON', soon('rocket', 'Social Boost') + soon('send', 'Telegram Premium'))}
    ${isAdmin ? section('shield', 'ADMIN', item('admin.html', 'shield', 'Admin dashboard')) : ''}
    <div class="nb-help"><b>Need help?</b><span>Tap below and pick how you want to reach us.</span>
      <button type="button" id="nb-support">${svg('chat')} Contact support</button></div>
  ` : `
    <div class="nb-hero">
      <div class="nb-bal-l">Welcome</div>
      <div class="nb-hello">Virtual numbers, paid in naira.</div>
      <div class="nb-hero-btns">
        <a class="nb-b1" href="signup.html">Get started</a>
        <a class="nb-b2" href="login.html">Sign in</a>
      </div>
    </div>
    ${section('grid', 'EXPLORE', item('index.html', 'home', 'Home'))}
    <div class="nb-help"><b>Need help?</b><span>Tap below and pick how you want to reach us.</span>
      <button type="button" id="nb-support">${svg('chat')} Contact support</button></div>
  `

  el.innerHTML = `
    <button id="nb-toggle" class="nb-btn" aria-label="Open menu" aria-expanded="false">
      <span class="nb-i-open">${svg('burger')}</span><span class="nb-i-close">${svg('x')}</span>
    </button>
    <a href="index.html" class="logo">
      <img src="assets/logo.png" alt="SwiftPlug logo" />
      <span>swift<span class="accent">plug</span></span>
    </a>
    <div class="nb-right">
      ${session
        ? `<a class="nb-wallet" href="dashboard.html?section=wallet">${svg('card')}<span class="mono">${esc(fmt(profile?.wallet_balance))}</span></a>
           <button class="nb-avatar" id="nb-avatar" aria-label="Open menu">${esc(initial)}</button>`
        : `<a class="nb-signin" href="login.html">Sign in</a>`}
    </div>
    <div id="nb-overlay" class="nb-overlay"></div>
    <aside id="nb-panel" class="nb-panel" aria-label="Menu">
      <div class="nb-scroll">${body}</div>
      <div class="nb-foot">
        <button type="button" class="nb-appear" id="nb-theme"><span>Appearance</span><span class="nb-switch"><span class="nb-knob"></span></span></button>
        <div class="nb-foot-row">
          <a href="index.html" class="nb-flink">${svg('back')} Back to home</a>
          ${session ? `<button type="button" class="nb-flink" id="nb-signout">${svg('out')} Sign out</button>` : ''}
        </div>
      </div>
    </aside>
  `

  const panel = document.getElementById('nb-panel')
  const overlay = document.getElementById('nb-overlay')
  const toggleBtn = document.getElementById('nb-toggle')
  const themeBtn = document.getElementById('nb-theme')

  function setOpen(open) {
    panel.classList.toggle('open', open)
    overlay.classList.toggle('open', open)
    toggleBtn.classList.toggle('open', open)
    toggleBtn.setAttribute('aria-expanded', String(open))
    document.body.classList.toggle('nb-lock', open)
  }
  const syncTheme = () => themeBtn.classList.toggle('on', document.documentElement.classList.contains('light'))
  syncTheme()

  toggleBtn.addEventListener('click', () => setOpen(!panel.classList.contains('open')))
  overlay.addEventListener('click', () => setOpen(false))
  document.getElementById('nb-avatar')?.addEventListener('click', () => setOpen(true))
  panel.addEventListener('click', (e) => { if (e.target.closest('a.nb-item, a.nb-b1, a.nb-b2, a.nb-flink')) setOpen(false) })
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false) })
  themeBtn.addEventListener('click', () => { toggleTheme(); syncTheme() })
  document.getElementById('nb-support')?.addEventListener('click', () => {
    setOpen(false)
    document.querySelector('.sp-fab')?.click()
  })
  document.getElementById('nb-signout')?.addEventListener('click', async () => {
    await supabase.auth.signOut()
    window.location.href = 'index.html'
  })
}
  
