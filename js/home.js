import { supabase } from './supabaseClient.js'
import { renderNavbar } from './nav.js'
import { fmt } from './currency.js'
import { sortServices, fillIcon } from './serviceMeta.js'

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
  eyeoff: '<path d="M3 3l18 18M10.6 5.1A9.5 9.5 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.6C3.6 8.5 2 12 2 12s4 7 10 7a9.6 9.6 0 0 0 4-.9"/>'
}
const svg = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${P[k]}</svg>`
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// ---- Quick services (edit labels/links here) ----
const TILES = [
  { t: 'Buy Number', i: 'plus', href: 'dashboard.html', main: true },
  { t: 'Rent Number', i: 'clock', href: 'dashboard.html?kind=real' },
  { t: 'My numbers', i: 'mobile', href: 'dashboard.html?section=mine' },
  { t: 'Wallet', i: 'card', href: 'dashboard.html?section=wallet' },
  { t: 'Social Boost', i: 'rocket', soon: true },
  { t: 'Telegram Premium', i: 'send', soon: true },
  { t: 'Buy Logs', i: 'bag', soon: true },
  { t: 'Support', i: 'chat', support: true }
]
document.getElementById('home-tiles').innerHTML = TILES.map(x => {
  const inner = `<span class="hm-ti">${svg(x.i)}</span><span class="hm-tt">${x.t}</span>${x.soon ? '<em>SOON</em>' : ''}`
  if (x.soon) return `<div class="hm-tile soon">${inner}</div>`
  if (x.support) return `<button type="button" class="hm-tile" data-support>${inner}</button>`
  return `<a class="hm-tile${x.main ? ' main' : ''}" href="${x.href}">${inner}</a>`
}).join('')
document.querySelector('[data-support]')?.addEventListener('click', () => document.querySelector('.sp-fab')?.click())

// ---- Signed-in blocks ----
function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}
async function loadAccount() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return
  const { data } = await supabase.from('profiles').select('wallet_balance').eq('id', session.user.id).single()
  const raw = (session.user.email || 'there').split('@')[0].replace(/[._-]+/g, ' ')
  const name = raw.charAt(0).toUpperCase() + raw.slice(1)
  document.getElementById('home-greet').textContent = greeting()
  document.getElementById('home-name').textContent = 'Hi, ' + name
  const amt = document.getElementById('home-balance-amt'), eye = document.getElementById('home-eye')
  const text = fmt(data?.wallet_balance)
  let hidden = false
  try { hidden = localStorage.getItem('sp-hide-bal') === '1' } catch {}
  const paint = () => {
    amt.textContent = hidden ? '₦ • • • • •' : text
    eye.innerHTML = svg(hidden ? 'eyeoff' : 'eye')
  }
  eye.addEventListener('click', () => { hidden = !hidden; try { localStorage.setItem('sp-hide-bal', hidden ? '1' : '0') } catch {} paint(); window.dispatchEvent(new Event('sp-bal-change')) })
  paint()
  ;['home-hi', 'home-balance', 'home-history'].forEach(id => document.getElementById(id).classList.remove('hidden'))
  document.getElementById('home-rows').innerHTML = [
    ['Transactions', 'Wallet deposits and spends', 'card', 'dashboard.html?section=wallet'],
    ['Numbers', "Numbers you've bought", 'mobile', 'dashboard.html?section=mine']
  ].map(r => `<a class="hm-row" href="${r[3]}"><span class="hm-ri">${svg(r[2])}</span><span class="hm-rt"><b>${r[0]}</b><span>${r[1]}</span></span>${svg('chev')}</a>`).join('')
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
