import './support.js'
// Fills in the <div id="navbar"></div> placeholder that every page includes.
// Header: menu button, logo, wallet pill, avatar. The menu is a full-height slide-in panel with grouped sections.
// This file also loads css/v5.css (colours + new screens), so every page picks the new look up automatically.
import { supabase } from './supabaseClient.js'
import { initTheme, toggleTheme } from './theme.js'
import { fmt } from './currency.js'
import { avatarOf, displayName } from './avatars.js'

// Load the new stylesheet once (after style.css so it wins).
if (!document.getElementById('sp-v5-css')) {
  const l = document.createElement('link')
  l.id = 'sp-v5-css'; l.rel = 'stylesheet'; l.href = 'css/v5.css'
  document.head.appendChild(l)
}

const I = {
  burger: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  mobile: '<rect x="7" y="2" width="10" height="20" rx="3"/><path d="M11 18h2"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20M6 15h4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  menuic: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  rocket: '<path d="M12 3c3 2 5 5 5 9l-2 3H9l-2-3c0-4 2-7 5-9z"/><circle cx="12" cy="10" r="1.5"/><path d="M9 15l-2 4 3-1M15 15l2 4-3-1"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  bag: '<path d="M6 7h12l1 14H5z"/><path d="M9 7a3 3 0 0 1 6 0"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M3 6h.01M3 12h.01M3 18h.01"/>',
  out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-5.4A8 8 0 1 1 21 12z"/>'
}
const svg = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${I[k]}</svg>`
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))

function isActive(href) {
  const u = new URL(href, location.href)
  if (u.pathname !== location.pathname) return false
  const a = u.searchParams, b = new URLSearchParams(location.search)
  return ['section', 'kind', 'tab'].every(k => (a.get(k) || '') === (b.get(k) || ''))
}
// col = colour role (lime, sky, violet, amber, coral, mint). Defined in css/v5.css.
const item = (href, icon, label, col = 'lime') =>
  `<a class="nb-item${isActive(href) ? ' active' : ''}" href="${href}"><span class="nb-ic c-${col}">${svg(icon)}</span><span>${label}</span></a>`
const soon = (icon, label) =>
  `<div class="nb-item nb-soon"><span class="nb-ic c-amber">${svg(icon)}</span><span>${label}</span><em>SOON</em></div>`
const section = (title, body) =>
  `<div class="nb-sec"><div class="nb-sec-title"><span>${title}</span></div>${body}</div>`

import('./ui.js').catch(() => { /* messages fall back to the browser boxes */ })

export async function renderNavbar() {
  initTheme()
  const el = document.getElementById('navbar')
  if (!el) return
  el.classList.add('nb')

  const { data: { session } } = await supabase.auth.getSession()
  const PENDING = '₦ …'
  const user = session?.user
  const email = user?.email || ''
  const name = user ? displayName(user) : ''
  const av = avatarOf(user?.user_metadata, (name[0] || 'U').toUpperCase())
  el.classList.toggle('nb-in', !!session)

  const body = session ? `
    <div class="nb-hero">
      <a class="nb-who" href="profile.html"><span class="nb-av" style="${av.style}">${esc(av.text)}</span>
        <span class="nb-who-t"><b>${esc(name)}</b><small>${esc(email)}</small></span></a>
      <div class="nb-bal-l">Wallet balance</div>
      <div class="nb-bal mono js-bal" data-v="${PENDING}">${PENDING}</div>
      <div class="nb-hero-btns">
        <a class="nb-b1" href="dashboard.html?section=wallet">${svg('plus')} Add money</a>
        <a class="nb-b2" href="dashboard.html?section=wallet#history">${svg('clock')} History</a>
      </div>
    </div>
    ${section('OUR SERVICES',
      item('index.html', 'home', 'Home', 'lime') +
      item('dashboard.html', 'phone', 'One-time numbers', 'sky') +
      item('dashboard.html?kind=real', 'clock', 'Longer-term numbers', 'mint') +
      item('social.html', 'rocket', 'Social Boost', 'violet') +
      soon('bag', 'Buy accounts') +
      soon('send', 'Telegram Premium'))}
    ${section('WALLET',
      item('dashboard.html?section=wallet', 'card', 'Add money', 'mint') +
      item('dashboard.html?section=wallet#history', 'list', 'Transactions', 'sky'))}
    ${section('MY ACTIVITY',
      item('dashboard.html?section=mine', 'mobile', 'My numbers', 'lime') +
      item('social.html#orders', 'bolt', 'Social orders', 'violet'))}
    ${section('MY ACCOUNT',
      item('profile.html', 'user', 'Profile', 'lime') +
      item('profile.html?tab=security', 'lock', 'Security', 'coral') +
      `<button type="button" class="nb-item nb-btn-item" id="nb-support-item"><span class="nb-ic c-mint">${svg('chat')}</span><span>Help &amp; support</span></button>`)}
  ` : `
    <div class="nb-hero">
      <div class="nb-bal-l">Welcome</div>
      <div class="nb-hello">Virtual numbers, paid in naira.</div>
      <div class="nb-hero-btns">
        <a class="nb-b1" href="signup.html">Get started</a>
        <a class="nb-b2" href="login.html">Sign in</a>
      </div>
    </div>
    ${section('EXPLORE', item('index.html', 'home', 'Home', 'lime') + `<button type="button" class="nb-item nb-btn-item" id="nb-support-item"><span class="nb-ic c-mint">${svg('chat')}</span><span>Help &amp; support</span></button>`)}
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
        ? `<a class="nb-wallet" href="dashboard.html?section=wallet">${svg('card')}<span class="mono js-bal" data-v="${PENDING}">${PENDING}</span></a>
           <a class="nb-avatar" href="profile.html" aria-label="Your profile" style="${av.style}">${esc(av.text)}</a>`
        : `<a class="nb-signin" href="login.html">Sign in</a>`}
    </div>
    <div id="nb-overlay" class="nb-overlay"></div>
    <aside id="nb-panel" class="nb-panel" aria-label="Menu">
      <div class="nb-scroll">${body}</div>
      <div class="nb-foot">
        <button type="button" class="nb-appear" id="nb-theme"><span>Dark / Light mode</span><span class="nb-switch"><span class="nb-knob"></span></span></button>
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
  panel.addEventListener('click', (e) => { if (e.target.closest('a.nb-item, a.nb-b1, a.nb-b2, a.nb-flink, a.nb-who')) setOpen(false) })
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false) })
  themeBtn.addEventListener('click', () => { toggleTheme(); syncTheme() })
  document.getElementById('nb-support-item')?.addEventListener('click', () => {
    setOpen(false)
    document.querySelector('.sp-fab')?.click()
  })
  // Hide balance: one setting (localStorage 'sp-hide-bal') shared by the header, menu, home card and wallet page.
  const paintBal = () => {
    let hide = false
    try { hide = localStorage.getItem('sp-hide-bal') === '1' } catch (_e) { /* ignore */ }
    document.querySelectorAll('.js-bal').forEach(n => { n.textContent = hide ? '₦ • • • • •' : n.dataset.v })
  }
  paintBal()
  window.addEventListener('sp-bal-change', paintBal)
  window.addEventListener('storage', paintBal)

  // ---- Bottom tab bar (signed-in, phones): Home, Social, Buy (big), Wallet, More ----
  document.getElementById('tb-bar')?.remove()
  if (session && !document.querySelector('.admin-layout')) {
    const tabs = [
      ['index.html', 'home', 'Home', 'lime'],
      ['social.html', 'rocket', 'Social', 'violet'],
      ['dashboard.html?section=get', 'plus', 'Buy', 'main'],
      ['dashboard.html?section=wallet', 'card', 'Wallet', 'mint'],
      [null, 'menuic', 'More', 'sky']
    ]
    const bar = document.createElement('nav')
    bar.id = 'tb-bar'; bar.className = 'tb-bar'; bar.setAttribute('aria-label', 'Main')
    const on = (href) => {
      const u = new URL(href, location.href), q = new URLSearchParams(location.search)
      if (u.pathname !== location.pathname) return false
      if (!location.pathname.endsWith('dashboard.html')) return true
      const want = u.searchParams.get('section') || ''
      const have = q.get('section') || 'get'
      return want === have
    }
    const moreActive = location.pathname.endsWith('profile.html')
    bar.innerHTML = tabs.map(t => {
      const act = t[0] ? on(t[0]) : moreActive
      const cls = 'tb-tab c-' + (t[3] === 'main' ? 'lime' : t[3]) + (t[3] === 'main' ? ' tb-main' : '') + (act ? ' active' : '')
      const inner = `<span class="tb-ic">${svg(t[1])}</span><span class="tb-lb">${t[2]}</span>`
      return t[0] ? `<a class="${cls}" href="${t[0]}">${inner}</a>` : `<button type="button" class="${cls}" id="tb-menu">${inner}</button>`
    }).join('')
    document.body.appendChild(bar)
    document.body.classList.add('tb-on')
    document.getElementById('tb-menu').addEventListener('click', () => toggleBtn.click())
  }
  document.getElementById('nb-signout')?.addEventListener('click', async () => {
    await supabase.auth.signOut()
    window.location.href = 'index.html'
  })

  // ---- Profile arrives in the background: balance + admin link ----
  if (session) {
    ;(async () => {
      const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
      if (!data) return
      document.querySelectorAll('.js-bal').forEach(n => { n.dataset.v = fmt(data.wallet_balance) })
      paintBal()
      if (data.role === 'admin' && !panel.querySelector('.nb-admin-sec')) {
        const tmp = document.createElement('div')
        tmp.innerHTML = section('ADMIN', item('admin.html', 'shield', 'Admin dashboard', 'amber'))
        const node = tmp.firstElementChild
        node.classList.add('nb-admin-sec')
        panel.querySelector('.nb-scroll').append(node)
      }
    })().catch(() => { /* keep the placeholder */ })
  }
    }
