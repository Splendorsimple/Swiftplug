import { supabase } from './supabaseClient.js'
import { renderNavbar } from './nav.js'
import { fmt } from './currency.js'
import { sortServices, fillIcon } from './serviceMeta.js'
import { displayName } from './avatars.js'

renderNavbar()

const grid = document.getElementById('home-service-grid')
const emptyMsg = document.getElementById('home-empty')
let list = []

const P = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  mobile: '<rect x="7" y="2" width="10" height="20" rx="3"/><path d="M11 18h2"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20M6 15h4"/>',
  rocket: '<path d="M12 3c3 2 5 5 5 9l-2 3H9l-2-3c0-4 2-7 5-9z"/><circle cx="12" cy="10" r="1.5"/><path d="M9 15l-2 4 3-1M15 15l2 4-3-1"/>',
  send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
  bag: '<path d="M6 7h12l1 14H5z"/><path d="M9 7a3 3 0 0 1 6 0"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-5.4A8 8 0 1 1 21 12z"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  down: '<path d="M12 4v12M6 11l6 6 6-6"/><path d="M5 20h14"/>',
  out: '<rect x="7" y="2" width="10" height="20" rx="3"/><path d="M11 18h2"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  zap: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  eyeoff: '<path d="M3 3l18 18M10.6 5.1A9.5 9.5 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.6C3.6 8.5 2 12 2 12s4 7 10 7a9.6 9.6 0 0 0 4-.9"/>'
}
const svg = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${P[k]}</svg>`
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// ---- Quick actions (edit labels/links/colours here). c = colour role from css/v5.css ----
const TILES = [
  { t: 'Buy number', i: 'plus', href: 'dashboard.html', main: true, c: 'lime' },
  { t: 'Rent number', i: 'clock', href: 'dashboard.html?kind=real', c: 'sky' },
  { t: 'My numbers', i: 'mobile', href: 'dashboard.html?section=mine', c: 'mint' },
  { t: 'Social Boost', i: 'rocket', href: 'social.html', c: 'violet' },
  { t: 'Wallet', i: 'card', href: 'dashboard.html?section=wallet', c: 'mint' },
  { t: 'Buy accounts', i: 'bag', href: 'accounts.html', c: 'amber' },
  { t: 'Telegram Premium', i: 'send', soon: true, c: 'amber' },
  { t: 'Support', i: 'chat', support: true, c: 'coral' }
]
document.getElementById('home-tiles').innerHTML = TILES.map(x => {
  const inner = `<span class="hm-ti">${svg(x.i)}</span><span class="hm-tt">${x.t}</span>${x.soon ? '<em>SOON</em>' : ''}`
  if (x.soon) return `<div class="hm-tile soon c-${x.c}">${inner}</div>`
  if (x.support) return `<button type="button" class="hm-tile c-${x.c}" data-support>${inner}</button>`
  return `<a class="hm-tile c-${x.c}${x.main ? ' main' : ''}" href="${x.href}">${inner}</a>`
}).join('')
document.querySelector('[data-support]')?.addEventListener('click', () => document.querySelector('.sp-fab')?.click())

// ---- Signed-in blocks ----
function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}
const rel = (d) => {
  const s = Math.max(0, (Date.now() - new Date(d)) / 1000)
  if (s < 60) return 'Just now'
  if (s < 3600) return Math.floor(s / 60) + ' min ago'
  if (s < 86400) return Math.floor(s / 3600) + ' hr ago'
  return new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
}
async function loadAccount() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return
  const uid = session.user.id
  const name = displayName(session.user).split(' ')[0]
  document.getElementById('home-greet').textContent = greeting()
  document.getElementById('home-name').textContent = 'Hello, ' + name + ' \u{1F44B}'
  const amt = document.getElementById('home-balance-amt'), eye = document.getElementById('home-eye')
  let text = fmt(0)
  let hidden = false
  try { hidden = localStorage.getItem('sp-hide-bal') === '1' } catch {}
  const paint = () => {
    amt.textContent = hidden ? '\u20A6 \u2022 \u2022 \u2022 \u2022 \u2022' : text
    eye.innerHTML = svg(hidden ? 'eyeoff' : 'eye')
  }
  eye.addEventListener('click', () => { hidden = !hidden; try { localStorage.setItem('sp-hide-bal', hidden ? '1' : '0') } catch {} paint(); window.dispatchEvent(new Event('sp-bal-change')) })
  paint()
  ;['home-hi', 'home-balance', 'home-stats', 'home-activity'].forEach(id => document.getElementById(id).classList.remove('hidden'))

  // Everything below is best-effort: if a lookup fails the card shows a dash and the page still works.
  const [prof, tx, nums, smm] = await Promise.all([
    supabase.from('profiles').select('wallet_balance').eq('id', uid).single(),
    supabase.from('wallet_transactions').select('amount,type,note,created_at').order('created_at', { ascending: false }).limit(500),
    supabase.from('numbers').select('id', { count: 'exact', head: true }).eq('user_id', uid),
    supabase.from('smm_orders').select('id', { count: 'exact', head: true }).eq('user_id', uid)
  ].map(p => Promise.resolve(p).catch(() => ({ error: true }))))
  if (prof.data) { text = fmt(prof.data.wallet_balance); paint() }
  const rows = tx.data || []
  const deposited = rows.filter(t => t.type === 'topup' && Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0)
  const spent = rows.filter(t => t.type === 'purchase' || t.type === 'renewal').reduce((s, t) => s + Number(t.amount), 0)
  const net = Math.abs(Math.min(0, spent))
  const ok = (r) => !r.error
  const STAT = [
    ['Numbers bought', ok(nums) ? Number(nums.count || 0).toLocaleString() : '\u2014', 'mobile', 'sky'],
    ['Social orders', ok(smm) ? Number(smm.count || 0).toLocaleString() : '\u2014', 'rocket', 'violet'],
    ['Total added', ok(tx) ? fmt(deposited) : '\u2014', 'down', 'mint'],
    ['Total spent', ok(tx) ? fmt(net) : '\u2014', 'out', 'coral']
  ]
  document.getElementById('home-stats').innerHTML = STAT.map(s => `<div class="v5-stat c-${s[3]}"><span class="v5-sic">${svg(s[2])}</span><small>${s[0]}</small><b class="mono">${s[1]}</b></div>`).join('')

  const kind = (t) => /refund|cancel/i.test(`${t.type} ${t.note}`) ? 'undo' : Number(t.amount) >= 0 ? 'down' : 'out'
  const col = { down: 'mint', out: 'coral', undo: 'sky' }
  const recent = rows.slice(0, 5)
  document.getElementById('home-rows').innerHTML = recent.length ? recent.map(t => {
    const k = kind(t), pos = Number(t.amount) >= 0
    return `<div class="v5-act"><span class="v5-aic c-${col[k]}">${svg(k)}</span>
      <div class="v5-amain"><b>${esc(t.note || t.type || 'Transaction')}</b><small>${esc(rel(t.created_at))}</small></div>
      <span class="v5-aamt mono ${pos ? 'in' : 'neg'}">${pos ? '+' : '\u2212'}${fmt(Math.abs(t.amount))}</span></div>`
  }).join('') : '<p class="muted" style="margin:0">Nothing yet. Add money to get started.</p>'
}

// ---- "Why SwiftPlug" cards (edit the words here) ----
const PROMOS = [
  { i: 'zap', c: 'lime', t: 'Pick. Buy. Copy.', d: 'Choose a country and service, buy, and your code shows up on your screen.' },
  { i: 'undo', c: 'sky', t: 'Refunded if it fails', d: 'If a number does not work out, the money goes back to your wallet.' },
  { i: 'card', c: 'mint', t: 'Pay in naira', d: 'Top up your wallet with Paystack and spend it on anything on the site.' }
]
{
  let p = 0
  const draw = () => {
    const x = PROMOS[p]
    const ic = document.getElementById('promo-ic')
    ic.className = 'v5-promo-ic c-' + x.c; ic.innerHTML = svg(x.i)
    document.getElementById('promo-t').textContent = x.t
    document.getElementById('promo-d').textContent = x.d
    document.getElementById('promo-dots').innerHTML = PROMOS.map((_, i) => `<i class="${i === p ? 'on' : ''}"></i>`).join('')
  }
  const go = (n) => { p = (p + n + PROMOS.length) % PROMOS.length; draw() }
  document.getElementById('promo-prev').addEventListener('click', () => go(-1))
  document.getElementById('promo-next').addEventListener('click', () => go(1))
  draw()
}

// ---- Services grid ----
function draw(items) {
  grid.innerHTML = ''
  emptyMsg.classList.toggle('hidden', items.length > 0)
  items.forEach(s => {
    const a = document.createElement('a')
    a.className = 'service-card'
    a.href = 'dashboard.html?service=' + encodeURIComponent(s.id)
    const ic = document.createElement('span')
    ic.className = 'service-icon'
    fillIcon(ic, s)
    const name = document.createElement('span'); name.style.cssText = 'font-weight:700;font-size:.9rem'; name.textContent = s.name
    const price = document.createElement('span'); price.className = 'muted'; price.style.fontSize = '.8rem'; price.textContent = `from ${fmt(s.min)}`
    const c = document.createElement('span'); c.style.cssText = 'font-size:.75rem;color:rgb(var(--highlight))'; c.textContent = `${s.countries} ${s.countries === 1 ? 'country' : 'countries'}`
    a.append(ic, name, price, c)
    grid.appendChild(a)
  })
}

async function loadServices() {
  grid.innerHTML = Array.from({ length: 6 }, () => '<div class="skeleton-card"></div>').join('')
  try {
    const [{ data: services }, { data: rows }] = await Promise.all([
      supabase.from('services').select('id,name,icon_url').eq('is_active', true),
      supabase.from('catalog').select('service_id,country_id,sell_price').eq('number_type', 'disposable')
    ])
    list = (services || []).map(s => {
      const r = (rows || []).filter(x => x.service_id === s.id)
      return { ...s, min: r.length ? Math.min(...r.map(x => Number(x.sell_price))) : null, countries: new Set(r.map(x => x.country_id)).size }
    }).filter(s => s.min != null)
    list = sortServices(list, () => 1)
    draw(list)
  } catch (e) {
    grid.innerHTML = ''
    emptyMsg.classList.remove('hidden')
  }
}

document.getElementById('home-search').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase()
  draw(list.filter(s => s.name.toLowerCase().includes(q)))
})

loadAccount()
loadServices()
