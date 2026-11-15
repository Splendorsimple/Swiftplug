import { supabase } from './supabaseClient.js'
import { SUPABASE_URL } from './config.js'
import { renderNavbar } from './nav.js'
import { requireAuth } from './authGuards.js'
import { fmt } from './currency.js'
import { fillIcon } from './serviceMeta.js'

// Messages: use the site's toast and confirm sheet (ui.js), or the browser's plain boxes if ui.js is missing.
const ask = (m, o) => (window.spUI ? window.spUI.confirm(m, o) : Promise.resolve(window.confirm(m)))
const tell = (m, kind = 'error') => (window.spUI ? window.spUI.toast(m, kind) : window.alert(m))

renderNavbar()
const session = await requireAuth()

const $ = (id) => document.getElementById(id)
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
let services = []
let platform = ''   // '' means All platforms
let current = null

async function callFn(name, body) {
  const { data: { session: s } } = await supabase.auth.getSession()
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.access_token}` },
    body: JSON.stringify(body || {})
  })
  const out = await res.json().catch(() => ({}))
  if (!res.ok) { const e = new Error(out.error || 'Something went wrong'); e.status = res.status; throw e }
  return out
}

function say(text, bad, addFunds) {
  const m = $('sb-msg')
  m.textContent = text
  m.className = 'sb-msg' + (bad ? ' bad' : ' good')
  if (addFunds) {
    m.append(' ')
    const a = document.createElement('a')
    a.href = 'dashboard.html?section=wallet'
    a.textContent = 'Add funds'
    a.style.cssText = 'font-weight:700;text-decoration:underline;color:inherit'
    m.appendChild(a)
  }
}

function total() {
  const q = Math.floor(Number($('sb-qty').value) || 0)
  if (!current || q < 1) return 0
  return Math.round(Number(current.sell_per_1000) * q / 1000 * 100) / 100
}
function paintTotal() { $('sb-total').textContent = total() > 0 ? fmt(total()) : '\u2014' }

function visible() {
  const q = $('sb-search').value.trim().toLowerCase()
  return services.filter(s => (!platform || s.platform === platform) && (!q || String(s.name).toLowerCase().includes(q)))
}
function drawServices() {
  const list = visible()
  $('sb-service').innerHTML = '<option value="">Select a service\u2026</option>' + list.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')
  $('sb-count').textContent = list.length ? `${list.length.toLocaleString()} service${list.length === 1 ? '' : 's'} found` : 'No service matches. Try another word or platform.'
  pick()
}
function pick() {
  current = services.find(s => s.id === $('sb-service').value) || null
  if (!current) {
    $('sb-limits').textContent = 'Pick a service to see the minimum and maximum.'
    paintTotal(); return
  }
  $('sb-limits').textContent = `${fmt(current.sell_per_1000)} per 1,000. Minimum ${Number(current.min_qty).toLocaleString()}, maximum ${Number(current.max_qty).toLocaleString()}.`
  const q = Number($('sb-qty').value) || 0
  if (q && q < current.min_qty) $('sb-qty').value = current.min_qty
  $('sb-qty').placeholder = `${Number(current.min_qty).toLocaleString()} to ${Number(current.max_qty).toLocaleString()}`
  paintTotal()
}
function drawPlatforms() {
  const counts = {}
  services.forEach(s => { counts[s.platform] = (counts[s.platform] || 0) + 1 })
  const names = Object.keys(counts).sort((a, b) => counts[b] - counts[a])
  if (platform && !counts[platform]) platform = ''
  const chip = (n, label) => `<button type="button" class="sb-chip${n === platform ? ' active' : ''}" data-p="${esc(n)}"><span class="sb-ci" data-ic="${esc(n)}"></span>${esc(label)}</button>`
  $('sb-platforms').innerHTML = chip('', 'All') + names.map(n => chip(n, n)).join('')
  $('sb-platforms').querySelectorAll('.sb-ci').forEach(el => {
    const n = el.dataset.ic
    if (!n) { el.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h10M4 17h16"/></svg>'; return }
    const holder = document.createElement('span'); holder.className = 'service-icon'
    fillIcon(holder, { name: n })
    el.appendChild(holder)
  })
}

async function loadCatalog() {
  const { data } = await supabase.from('smm_catalog').select('*').order('name')
  services = data || []
  const has = services.length > 0
  $('sb-form-card').classList.toggle('hidden', !has)
  $('sb-empty').classList.toggle('hidden', has)
  if (!has) return
  drawPlatforms(); drawServices()
}

const STATUS = {
  completed: ['Completed', 'ok'], 'in progress': ['In progress', 'run'], processing: ['Processing', 'run'], pending: ['Pending', 'run'],
  partial: ['Partly done, rest refunded', 'warn'], canceled: ['Cancelled, refunded', 'warn'], cancelled: ['Cancelled, refunded', 'warn'],
  refunded: ['Refunded', 'warn'], failed: ['Not placed, refunded', 'bad']
}
async function loadOrders() {
  const { data } = await supabase.from('smm_orders').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false }).limit(20)
  const rows = data || []
  $('sb-orders').innerHTML = rows.length ? rows.map(o => {
    const st = STATUS[String(o.status || '').toLowerCase()] || [o.status, 'run']
    return `<div class="sb-order"><div class="sb-o-top"><b>${esc(o.service_name || 'Order')}</b><span class="sb-pill ${st[1]}">${esc(st[0])}</span></div>
      <div class="sb-o-link">${esc(o.link)}</div>
      <div class="sb-o-meta"><span>${Number(o.quantity).toLocaleString()} units</span><span class="mono">${fmt(o.price)}</span><span>${new Date(o.created_at).toLocaleDateString()}</span></div></div>`
  }).join('') : '<p class="muted" style="margin:0">No orders yet.</p>'
}
async function refreshOrders(btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Refreshing...' }
  try { await callFn('smm-status') } catch (_e) { /* show what we have */ }
  await loadOrders()
  if (btn) { btn.disabled = false; btn.textContent = 'Refresh' }
}

$('sb-platforms').addEventListener('click', (e) => {
  const b = e.target.closest('.sb-chip'); if (!b) return
  platform = b.dataset.p; drawPlatforms(); drawServices()
})
$('sb-service').addEventListener('change', pick)
$('sb-qty').addEventListener('input', paintTotal)
$('sb-search').addEventListener('input', drawServices)
$('sb-info-tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-t]'); if (!b) return
  document.querySelectorAll('#sb-info-tabs button').forEach(x => x.classList.toggle('active', x === b))
  $('sb-how').classList.toggle('hidden', b.dataset.t !== 'how')
  $('sb-tips').classList.toggle('hidden', b.dataset.t !== 'tips')
})
$('sb-refresh').addEventListener('click', (e) => refreshOrders(e.currentTarget))

$('sb-buy').addEventListener('click', async (e) => {
  const btn = e.currentTarget
  const link = $('sb-link').value.trim()
  const qty = Math.floor(Number($('sb-qty').value) || 0)
  if (!current) return say('Choose a service first.', true)
  if (!qty) return say('Enter how many you want.', true)
  if (!link) return say('Paste your link or username.', true)
  if (qty < current.min_qty || qty > current.max_qty) return say(`Quantity must be between ${current.min_qty} and ${current.max_qty}.`, true)
  if (!(await ask(`Order ${qty.toLocaleString()} for ${fmt(total())}?\n\n${current.name}\n${link}`, { title: 'Place this order?', confirmText: 'Place order' }))) return
  btn.disabled = true; btn.textContent = 'Placing order...'
  try {
    await callFn('smm-order', { service_id: current.id, link, quantity: qty })
    say('Order placed. Track it under My orders.', false)
    $('sb-link').value = ''
    await loadOrders(); loadBal()
  } catch (err) {
    say(err.message, true, err.status === 402 || /insufficient/i.test(err.message || ''))
  }
  btn.disabled = false; btn.textContent = 'Place order'
})

async function loadBal() {
  const { data } = await supabase.from('profiles').select('wallet_balance').eq('id', session.user.id).single()
  if (data) { $('sb-bal').dataset.v = fmt(data.wallet_balance); window.dispatchEvent(new Event('sp-bal-change')) }
}
loadBal()
await loadCatalog()
await loadOrders()
refreshOrders()

if (location.hash === '#orders') document.getElementById('orders')?.scrollIntoView()
  
