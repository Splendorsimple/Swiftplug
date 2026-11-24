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
let products = []
let category = ''   // '' means All categories
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

const maxBuy = () => (current ? Math.max(1, Math.min(Number(current.max_qty) || 10, 10, Number(current.stock) || 1)) : 1)
function total() {
  const q = Math.floor(Number($('sb-qty').value) || 0)
  if (!current || q < 1) return 0
  return Math.round(Number(current.sell_price) * q * 100) / 100
}
function paintTotal() { $('sb-total').textContent = total() > 0 ? fmt(total()) : '—' }

function visible() {
  const q = $('sb-search').value.trim().toLowerCase()
  return products.filter(p => (!category || p.category === category) && (!q || String(p.name).toLowerCase().includes(q)))
}
function drawProducts() {
  const list = visible()
  $('sb-service').innerHTML = '<option value="">Select an account…</option>' + list.map(p => `<option value="${esc(p.id)}">${esc(p.name)} — ${esc(fmt(p.sell_price))}</option>`).join('')
  $('sb-count').textContent = list.length ? `${list.length.toLocaleString()} account${list.length === 1 ? '' : 's'} found` : 'No account matches. Try another word or category.'
  pick()
}
function pick() {
  current = products.find(p => p.id === $('sb-service').value) || null
  if (!current) { $('sb-limits').textContent = 'Pick an account to see the price and what is left.'; paintTotal(); return }
  $('sb-limits').textContent = `${fmt(current.sell_price)} each. ${Number(current.stock).toLocaleString()} left. You can buy ${current.min_qty} to ${maxBuy()} at a time.`
  const q = Number($('sb-qty').value) || 0
  if (q < current.min_qty) $('sb-qty').value = current.min_qty
  if (q > maxBuy()) $('sb-qty').value = maxBuy()
  paintTotal()
}
function drawCategories() {
  const counts = {}
  products.forEach(p => { counts[p.category] = (counts[p.category] || 0) + 1 })
  const names = Object.keys(counts).sort((a, b) => counts[b] - counts[a])
  if (category && !counts[category]) category = ''
  const chip = (n, label) => `<button type="button" class="sb-chip${n === category ? ' active' : ''}" data-p="${esc(n)}"><span class="sb-ci" data-ic="${esc(n)}"></span>${esc(label)}</button>`
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
  const { data } = await supabase.from('log_catalog').select('*').order('name')
  products = data || []
  const has = products.length > 0
  $('sb-form-card').classList.toggle('hidden', !has)
  $('sb-empty').classList.toggle('hidden', has)
  const { data: info } = await supabase.from('log_info').select('refund_note').maybeSingle()
  if (info?.refund_note) $('sb-refund-note').textContent = info.refund_note
  if (!has) return
  drawCategories(); drawProducts()
}

const STATUS = {
  completed: ['Delivered', 'ok'], processing: ['Getting your details…', 'run'], pending: ['Pending', 'run'],
  failed: ['Not completed, refunded', 'bad']
}
async function loadOrders() {
  const { data } = await supabase.from('log_orders').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false }).limit(30)
  const rows = data || []
  $('sb-orders').innerHTML = rows.length ? rows.map(o => {
    const st = STATUS[String(o.status || '').toLowerCase()] || [o.status, 'run']
    const lines = Array.isArray(o.delivery) ? o.delivery : []
    const secret = lines.length ? `<div class="sb-o-link"><button type="button" class="pill-btn" data-show="${esc(o.id)}">Show login details</button>
      <div class="hidden" id="lg-${esc(o.id)}" style="margin-top:10px">
        <pre class="mono" style="white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 8px;font-size:.85rem">${esc(lines.join('\n'))}</pre>
        <button type="button" class="pill-btn" data-copy="${esc(o.id)}">Copy</button></div></div>` : ''
    return `<div class="sb-order" data-id="${esc(o.id)}"><div class="sb-o-top"><b>${esc(o.product_name || 'Order')}</b><span class="sb-pill ${st[1]}">${esc(st[0])}</span></div>
      ${secret}
      <div class="sb-o-meta"><span>${Number(o.quantity).toLocaleString()} account${o.quantity === 1 ? '' : 's'}</span><span class="mono">${fmt(o.price)}</span><span>${new Date(o.created_at).toLocaleDateString()}</span></div></div>`
  }).join('') : '<p class="muted" style="margin:0">No accounts yet.</p>'
  window.__logLines = Object.fromEntries(rows.map(o => [o.id, Array.isArray(o.delivery) ? o.delivery.join('\n') : '']))
}
async function refreshOrders(btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Refreshing...' }
  try { await callFn('log-status') } catch (_e) { /* show what we have */ }
  await loadOrders()
  if (btn) { btn.disabled = false; btn.textContent = 'Refresh' }
}

$('sb-platforms').addEventListener('click', (e) => {
  const b = e.target.closest('.sb-chip'); if (!b) return
  category = b.dataset.p; drawCategories(); drawProducts()
})
$('sb-service').addEventListener('change', pick)
$('sb-qty').addEventListener('input', paintTotal)
$('sb-search').addEventListener('input', drawProducts)
$('sb-info-tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-t]'); if (!b) return
  document.querySelectorAll('#sb-info-tabs button').forEach(x => x.classList.toggle('active', x === b))
  $('sb-how').classList.toggle('hidden', b.dataset.t !== 'how')
  $('sb-tips').classList.toggle('hidden', b.dataset.t !== 'tips')
})
$('sb-refresh').addEventListener('click', (e) => refreshOrders(e.currentTarget))
$('sb-orders').addEventListener('click', async (e) => {
  const show = e.target.closest('[data-show]')
  if (show) { document.getElementById('lg-' + show.dataset.show)?.classList.toggle('hidden'); return }
  const cp = e.target.closest('[data-copy]')
  if (cp) {
    const text = (window.__logLines || {})[cp.dataset.copy] || ''
    try { await navigator.clipboard.writeText(text); tell('Copied', 'success') } catch (_e) { tell('Could not copy. Press and hold the text to copy it.') }
  }
})

$('sb-buy').addEventListener('click', async (e) => {
  const btn = e.currentTarget
  const qty = Math.floor(Number($('sb-qty').value) || 0)
  if (!current) return say('Choose an account first.', true)
  if (!qty) return say('Enter how many you want.', true)
  if (qty < current.min_qty || qty > maxBuy()) return say(`You can buy ${current.min_qty} to ${maxBuy()} at a time.`, true)
  if (!(await ask(`Buy ${qty} for ${fmt(total())}?\n\n${current.name}`, { title: 'Confirm purchase', confirmText: 'Buy now' }))) return
  btn.disabled = true; btn.textContent = 'Buying...'
  try {
    const out = await callFn('log-order', { product_id: current.id, quantity: qty })
    say(out.delivered ? 'Done. Your login details are under My accounts below.' : 'Order placed. Your details will appear under My accounts shortly.', false)
    await loadOrders(); loadBal(); loadCatalog()
    document.getElementById('orders')?.scrollIntoView({ behavior: 'smooth' })
  } catch (err) {
    say(err.message, true, err.status === 402 || /insufficient/i.test(err.message || ''))
  }
  btn.disabled = false; btn.textContent = 'Buy now'
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
