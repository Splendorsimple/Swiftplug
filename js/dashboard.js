import { supabase } from './supabaseClient.js'
import { requireAuth } from './authGuards.js'
import { renderNavbar } from './nav.js'
import { fmt, CURRENCY_CODE } from './currency.js'
import { attachCountryAutocomplete } from './countryAutocomplete.js'
import { getApplicableDiscount, applyDiscount } from './discounts.js'
import { createNumberCard } from './numberCard.js'
import { SUPABASE_URL, PAYSTACK_PUBLIC_KEY } from './config.js'
import { sortServices, fillIcon } from './serviceMeta.js'

const session = await requireAuth()
if (session) {
  renderNavbar()
  initSectionNav()
  initGetANumber()
  initMyNumbers()
  initWallet()
  loadSidebarBalance()
}

// ---------------- Section switching ----------------
function initSectionNav() {
  document.getElementById('dash-nav').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-section]')
    if (!btn) return
    document.querySelectorAll('#dash-nav button').forEach(b => b.classList.toggle('active', b === btn))
    ;['get', 'mine', 'wallet'].forEach(s => document.getElementById(`section-${s}`).classList.toggle('hidden', s !== btn.dataset.section))
    document.getElementById('wallet-summary-card').style.display = 'block'
    if (btn.dataset.section === 'mine') loadMyNumbers()
    if (btn.dataset.section === 'wallet') loadHistory()
  })
  document.getElementById('add-funds-link').addEventListener('click', () => document.querySelector('[data-section="wallet"]').click())
}

async function loadSidebarBalance() {
  const { data: profile } = await supabase.from('profiles').select('wallet_balance').eq('id', session.user.id).single()
  document.getElementById('sidebar-balance').textContent = fmt(profile?.wallet_balance)
}

// ================================================================
// GET A NUMBER
// ================================================================
function initGetANumber() {
  let kind = 'disposable'
  document.getElementById('kind-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-kind]')
    if (!btn) return
    kind = btn.dataset.kind
    document.querySelectorAll('#kind-toggle button').forEach(b => b.classList.toggle('active', b === btn))
    document.getElementById('disposable-flow').classList.toggle('hidden', kind !== 'disposable')
    document.getElementById('real-flow').classList.toggle('hidden', kind !== 'real')
  })

  initDisposableFlow()
  initRealFlow()
}

// ---------------- Disposable: "Buy a number" ----------------
// 1 country -> 2 service -> 3 server (drops down once both are chosen) -> quantity -> Buy.
let svcById = new Map()
let dCatalog = []
let dCountries = []
let bnCountry = null
let bnService = null
let dPricing = null
let dQty = 1
let dOptions = []
let pendingService = null
let orderCards = []
let pickers = {}

const CHEV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>'
const MAGNIFIER = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>'
const hide = (id, yes = true) => document.getElementById(id)?.classList.toggle('hidden', yes)

// A searchable drop-down that opens inline under its button.
function createPicker(root, cfg) {
  root.innerHTML = `
    <button type="button" class="bn-trigger" aria-haspopup="listbox" aria-expanded="false">
      <span class="bn-t-ic"></span><span class="bn-t-label"></span><span class="bn-t-right mono"></span><span class="bn-chev">${CHEV}</span>
    </button>
    <div class="bn-panel hidden">
      ${cfg.search === false ? '' : `<div class="bn-search">${MAGNIFIER}<input type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${cfg.searchPlaceholder || 'Search...'}" /></div>`}
      <div class="bn-list" role="listbox"></div>
    </div>`
  const trigger = root.querySelector('.bn-trigger'), panel = root.querySelector('.bn-panel'), list = root.querySelector('.bn-list')
  const input = root.querySelector('.bn-search input')
  const tIc = root.querySelector('.bn-t-ic'), tLabel = root.querySelector('.bn-t-label'), tRight = root.querySelector('.bn-t-right')
  let items = [], selected = null

  const fillLead = (box, it) => {
    box.textContent = ''
    if (it.service) { const ic = document.createElement('span'); ic.className = 'service-icon'; fillIcon(ic, it.service); box.appendChild(ic) }
    else if (it.lead) box.textContent = it.lead
  }
  function paintTrigger() {
    trigger.classList.toggle('has-value', !!selected)
    if (selected) { fillLead(tIc, selected); tLabel.textContent = selected.label; tRight.textContent = selected.right || '' }
    else { tIc.textContent = ''; const ph = cfg.icon; if (ph) tIc.innerHTML = ph; tLabel.textContent = cfg.placeholder; tRight.textContent = '' }
  }
  function paintList() {
    const q = (input?.value || '').trim().toLowerCase()
    const shown = items.filter(it => !q || it.name.toLowerCase().includes(q))
    list.textContent = ''
    if (!shown.length) { const e = document.createElement('div'); e.className = 'bn-empty'; e.textContent = q ? 'Nothing matches that.' : (cfg.empty || 'Nothing available.'); list.appendChild(e); return }
    shown.forEach(it => {
      const row = document.createElement('button')
      row.type = 'button'; row.className = 'bn-row' + (selected && selected.id === it.id ? ' sel' : ''); row.setAttribute('role', 'option')
      const lead = document.createElement('span'); lead.className = 'bn-lead'; fillLead(lead, it)
      const main = document.createElement('span'); main.className = 'bn-main'
      const b = document.createElement('b'); b.textContent = it.label; main.appendChild(b)
      if (it.sub) { const sm = document.createElement('small'); sm.textContent = it.sub; main.appendChild(sm) }
      const right = document.createElement('span'); right.className = 'bn-right mono'; right.textContent = it.right || ''
      row.append(lead, main, right)
      row.addEventListener('click', () => { selected = it; paintTrigger(); close(); cfg.onPick(it) })
      list.appendChild(row)
    })
  }
  function open(focus) {
    if (trigger.disabled) return
    Object.values(pickers).forEach(p => p !== api && p.close())
    panel.classList.remove('hidden'); trigger.setAttribute('aria-expanded', 'true')
    if (input) input.value = ''
    paintList()
    if (focus && input) input.focus()
  }
  function close() { panel.classList.add('hidden'); trigger.setAttribute('aria-expanded', 'false') }
  trigger.addEventListener('click', () => (panel.classList.contains('hidden') ? open(true) : close()))
  input?.addEventListener('input', paintList)
  const api = {
    setItems(v) { items = v; if (selected && !items.find(i => i.id === selected.id)) selected = null; paintTrigger(); if (!panel.classList.contains('hidden')) paintList() },
    select(it) { selected = it; paintTrigger() },
    clear() { selected = null; paintTrigger(); close() },
    disable(v) { trigger.disabled = !!v; if (v) close() },
    open, close, get selected() { return selected }
  }
  paintTrigger()
  return api
}

function countryItems() {
  const has = new Set(), stockBy = {}
  dCatalog.forEach(r => {
    if (pendingService && r.service_id !== pendingService) return
    has.add(r.country_id)
    if (r.stock != null) { const m = (stockBy[r.country_id] ||= {}); m[r.service_id] = Math.max(m[r.service_id] ?? 0, r.stock) }
  })
  return dCountries.filter(c => has.has(c.id)).sort((a, b) => a.name.localeCompare(b.name)).map(c => {
    const m = stockBy[c.id], total = m ? Object.values(m).reduce((a, b) => a + b, 0) : null
    return { id: c.id, name: c.name, label: c.name, lead: c.flag_emoji || '', right: total != null ? total.toLocaleString('en-NG') : '', country: c }
  })
}

function serviceItems() {
  const per = new Map()
  dCatalog.filter(r => r.country_id === bnCountry.id).forEach(r => {
    const e = per.get(r.service_id) || { min: Infinity, n: 0, stock: null }
    e.min = Math.min(e.min, Number(r.sell_price)); e.n++
    if (r.stock != null) e.stock = Math.max(e.stock ?? 0, r.stock)
    per.set(r.service_id, e)
  })
  const list = []
  per.forEach((e, id) => {
    const s = svcById.get(id); if (!s) return
    list.push({ id, name: s.name, label: s.name, service: s, sub: e.stock != null ? `${e.stock.toLocaleString('en-NG')} available` : '', right: (e.n > 1 ? 'from ' : '') + fmt(e.min) })
  })
  return sortServices(list, () => 1)
}

function serverItems() {
  return dOptions.map(o => ({
    id: o.id, row: o, name: o.server_name || `Server ${o.tier || 1}`, label: o.server_name || `Server ${o.tier || 1}`,
    lead: '☰', sub: o.stock != null ? `${o.stock.toLocaleString('en-NG')} in stock` : '', right: fmt(o.sell_price)
  }))
}

function resetServer() {
  dPricing = null; dOptions = []; dQty = 1
  document.getElementById('dqty-value').textContent = '1'
  pickers.server?.clear(); pickers.server?.setItems([])
  hide('bn-server-wrap'); hide('bn-none'); hide('dqty-wrap'); hide('bn-another')
  document.getElementById('derror')?.classList.add('hidden')
}
function resetService() {
  bnService = null
  pickers.service?.clear(); hide('bn-clear-service')
  resetServer()
}
function resetAll() {
  bnCountry = null
  pickers.country?.clear(); hide('bn-clear-country')
  pickers.service?.setItems([]); pickers.service?.disable(true)
  resetService()
}
function updatePending() {
  const el = document.getElementById('bn-pending')
  if (!pendingService || !svcById.get(pendingService)) { pendingService = null; el.classList.add('hidden'); return }
  el.innerHTML = ''
  el.append(`Showing countries that have ${svcById.get(pendingService).name}. `)
  const b = document.createElement('button'); b.type = 'button'; b.className = 'link'; b.textContent = 'Show all'
  b.style.cssText = 'background:none;border:none;padding:0;font:inherit;font-weight:700'
  b.addEventListener('click', () => { pendingService = null; updatePending(); pickers.country.setItems(countryItems()) })
  el.appendChild(b); el.classList.remove('hidden')
}

async function onCountryPick(it) {
  bnCountry = { id: it.id, name: it.label, flag: it.lead }
  resetService(); hide('bn-clear-country', false)
  pickers.service.setItems(serviceItems()); pickers.service.disable(false)
  const pre = pendingService && pickers.service && serviceItems().find(s => s.id === pendingService)
  if (pre) { pickers.service.select(pre); await onServicePick(pre) }
  else pickers.service.open(false)
}

async function onServicePick(it) {
  bnService = { id: it.id, name: it.label }
  pendingService = null; updatePending()
  hide('bn-clear-service', false); resetServerOnly()
  // fresh prices and stock for this country + service
  const { data } = await supabase.from('catalog').select('*')
    .eq('service_id', bnService.id).eq('country_id', bnCountry.id).eq('number_type', 'disposable').order('tier')
  dOptions = (data || []).filter(o => o.stock == null || o.stock > 0)
  if (!dOptions.length) { hide('bn-none', false); return }
  hide('bn-server-wrap', false)
  pickers.server.setItems(serverItems())
  hide('bn-another', dOptions.length < 2)
  if (dOptions.length === 1) { const only = serverItems()[0]; pickers.server.select(only); await onServerPick(only) }
  else pickers.server.open(false)   // the servers drop down for the buyer to choose
}
function resetServerOnly() { dPricing = null; dOptions = []; pickers.server?.clear(); hide('bn-server-wrap'); hide('bn-none'); hide('dqty-wrap'); hide('bn-another') }

async function onServerPick(it) {
  dPricing = it.row
  dQty = 1; document.getElementById('dqty-value').textContent = '1'
  document.getElementById('dmax-note').textContent = `max ${maxQtyFor(dPricing)} per purchase`
  hide('dqty-wrap', false)
  await updateDisposableTotals()
}

async function initDisposableFlow() {
  const { data } = await supabase.from('services').select('*').eq('is_active', true)
  const { data: catalogRows } = await supabase.from('catalog').select('*').eq('number_type', 'disposable')
  const { data: countryRows } = await supabase.from('countries').select('id,name,flag_emoji')
  // Rows the provider has run out of (stock 0) are hidden. Unknown stock (null) still shows.
  dCatalog = (catalogRows || []).filter(r => r.stock == null || r.stock > 0)
  dCountries = countryRows || []
  svcById = new Map((data || []).map(s => [s.id, s]))

  pickers.country = createPicker(document.getElementById('bn-country'), {
    placeholder: 'Choose a country', searchPlaceholder: 'Search countries...', empty: 'No countries available yet.',
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true" class="bn-ph"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
    onPick: onCountryPick
  })
  pickers.service = createPicker(document.getElementById('bn-service'), {
    placeholder: 'Select a service', searchPlaceholder: 'Search services...', empty: 'No services for this country yet.',
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true" class="bn-ph"><rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/></svg>',
    onPick: onServicePick
  })
  pickers.server = createPicker(document.getElementById('bn-server'), {
    placeholder: 'Choose a server', search: false, empty: 'No servers available.',
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true" class="bn-ph"><rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 7h.01M7 17h.01"/></svg>',
    onPick: onServerPick
  })
  pickers.country.setItems(countryItems())
  pickers.service.disable(true)

  const qp = new URLSearchParams(location.search)
  if (qp.get('kind') === 'real') document.querySelector('#kind-toggle button[data-kind="real"]')?.click()
  const sec = qp.get('section')
  if (sec) document.querySelector(`#dash-nav button[data-section="${CSS.escape(sec)}"]`)?.click()
  const want = qp.get('service')
  if (want && svcById.has(want)) { pendingService = want; updatePending(); pickers.country.setItems(countryItems()) }

  document.getElementById('bn-clear-country').addEventListener('click', resetAll)
  document.getElementById('bn-clear-service').addEventListener('click', () => { resetService(); pickers.service.open(false) })
  document.getElementById('bn-reset').addEventListener('click', () => { pendingService = null; updatePending(); resetAll(); pickers.country.setItems(countryItems()) })
  document.getElementById('bn-another').addEventListener('click', () => { pickers.server.open(false); document.getElementById('bn-server').scrollIntoView({ behavior: 'smooth', block: 'center' }) })
  document.getElementById('dqty-minus').addEventListener('click', () => setDQty(dQty - 1))
  document.getElementById('dqty-plus').addEventListener('click', () => setDQty(dQty + 1))
  document.getElementById('dbuy-btn').addEventListener('click', buyDisposable)
  document.getElementById('orders-refresh').addEventListener('click', loadOrders)
  document.getElementById('to-history').addEventListener('click', () => document.querySelector('[data-section="wallet"]').click())
  loadOrders()
}

// Active orders: your live one-time numbers, with timer, code, copy and cancel.
async function loadOrders() {
  orderCards.forEach(c => c._cleanup && c._cleanup()); orderCards = []
  const list = document.getElementById('orders-list')
  let { data, error } = await supabase.from('numbers').select('*, pricing(services(name), countries(name))')
    .eq('status', 'active').eq('number_type', 'disposable').order('created_at', { ascending: false })
  if (error) ({ data } = await supabase.from('numbers').select('*').eq('status', 'active').eq('number_type', 'disposable').order('created_at', { ascending: false }))
  list.textContent = ''
  hide('orders-empty', !!(data && data.length))
  ;(data || []).forEach(n => {
    const nm = n.pricing?.services?.name, cn = n.pricing?.countries?.name
    const label = [nm, cn, n.price_paid != null ? fmt(n.price_paid) : ''].filter(Boolean).join(' · ')
    const card = createNumberCard(n, () => setTimeout(() => { loadOrders(); loadSidebarBalance() }, 0), { label })
    orderCards.push(card); list.appendChild(card)
  })
}

function maxQtyFor(p) {
  const cap = p?.max_quantity_per_purchase || 10
  return p?.stock != null ? Math.max(1, Math.min(cap, p.stock)) : cap
}

function setDQty(v) {
  const max = maxQtyFor(dPricing)
  dQty = Math.min(max, Math.max(1, v))
  document.getElementById('dqty-value').textContent = dQty
  updateDisposableTotals()
}

async function updateDisposableTotals() {
  if (!dPricing) return
  const subtotal = dPricing.sell_price * dQty
  const discount = await getApplicableDiscount(dQty, 'disposable')
  const total = discount ? applyDiscount(subtotal, discount) : subtotal
  document.getElementById('dsubtotal').textContent = fmt(subtotal)
  document.getElementById('dtotal').textContent = fmt(total)
  const row = document.getElementById('ddiscount-row')
  if (discount) { row.classList.remove('hidden'); document.getElementById('ddiscount-amt').textContent = `-${fmt(subtotal - total)}` }
  else row.classList.add('hidden')
}

// Shows a purchase error. When the problem is a low balance, adds an "Add funds" button that jumps to the wallet.
function showBuyError(errorEl, err) {
  errorEl.textContent = err.message || 'Purchase failed'
  if (err.status === 402 || /insufficient/i.test(err.message || '')) {
    errorEl.append(' ')
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = 'Add funds'
    b.style.cssText = 'background:none;border:none;padding:0;font:inherit;font-weight:700;text-decoration:underline;cursor:pointer;color:inherit'
    b.addEventListener('click', () => document.querySelector('[data-section="wallet"]').click())
    errorEl.appendChild(b)
  }
  errorEl.classList.remove('hidden')
}

async function buyDisposable() {
  const errorEl = document.getElementById('derror')
  const btn = document.getElementById('dbuy-btn')
  errorEl.classList.add('hidden')
  if (!dPricing) { errorEl.textContent = 'Choose a server first.'; errorEl.classList.remove('hidden'); return }
  btn.disabled = true; btn.textContent = 'Reserving number...'
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${SUPABASE_URL}/functions/v1/purchase-disposable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ pricing_id: dPricing.id, quantity: dQty })
    })
    const result = await res.json()
    if (!res.ok) { const e = new Error(result.error || 'Purchase failed'); e.status = res.status; throw e }

    await loadSidebarBalance()
    // The new number(s) appear under "Active orders" with timer, code, copy and cancel.
    const list = document.getElementById('orders-list')
    const label = [bnService?.name, bnCountry?.name, fmt(dPricing.sell_price)].filter(Boolean).join(' · ')
    ;(result.numbers || []).forEach(n => {
      const card = createNumberCard(n, () => setTimeout(() => { loadOrders(); loadSidebarBalance() }, 0), { label })
      orderCards.push(card)
      list.prepend(card)
    })
    hide('orders-empty')
    document.getElementById('orders-card').scrollIntoView({ behavior: 'smooth', block: 'start' })
  } catch (err) {
    showBuyError(errorEl, err)
  } finally {
    btn.disabled = false; btn.textContent = 'Buy number'
  }
}

// ---------------- Real numbers ----------------
let rCountry = null
let rPlans = []
let rSelectedPlan = null
let rQty = 1

function initRealFlow() {
  attachCountryAutocomplete(
    document.getElementById('rcountry-input'),
    document.getElementById('rcountry-results'),
    async (country) => { rCountry = country; await loadRealPlans() }
  )
  document.getElementById('rqty-minus').addEventListener('click', () => setRQty(rQty - 1))
  document.getElementById('rqty-plus').addEventListener('click', () => setRQty(rQty + 1))
  document.getElementById('rbuy-btn').addEventListener('click', buyReal)
}

async function loadRealPlans() {
  const { data } = await supabase.from('catalog').select('*').eq('country_id', rCountry.id).eq('number_type', 'real')
  rPlans = data || []
  rSelectedPlan = null
  document.getElementById('rqty-wrap').classList.add('hidden')
  const wrap = document.getElementById('rplans')
  wrap.innerHTML = rPlans.map(p => `
    <button class="card" data-id="${p.id}" style="text-align:left;cursor:pointer;border:1px solid rgba(var(--line),.08);background:rgb(var(--surface))">
      <div style="font-weight:700">${p.plan_duration}</div>
      <div class="muted mono">${fmt(p.sell_price)}</div>
    </button>
  `).join('')
  wrap.querySelectorAll('button[data-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      rSelectedPlan = rPlans.find(p => p.id === btn.dataset.id)
      rQty = 1; document.getElementById('rqty-value').textContent = '1'
      document.getElementById('rqty-wrap').classList.remove('hidden')
      updateRealTotals()
    })
  })
}

function setRQty(v) {
  const max = rSelectedPlan?.max_quantity_per_purchase || 10
  rQty = Math.min(max, Math.max(1, v))
  document.getElementById('rqty-value').textContent = rQty
  updateRealTotals()
}

async function updateRealTotals() {
  if (!rSelectedPlan) return
  const subtotal = rSelectedPlan.sell_price * rQty
  const discount = await getApplicableDiscount(rQty, 'real')
  const total = discount ? applyDiscount(subtotal, discount) : subtotal
  document.getElementById('rsubtotal').textContent = fmt(subtotal)
  document.getElementById('rtotal').textContent = fmt(total)
  const row = document.getElementById('rdiscount-row')
  if (discount) { row.classList.remove('hidden'); document.getElementById('rdiscount-amt').textContent = `-${fmt(subtotal - total)}` }
  else row.classList.add('hidden')
}

async function buyReal() {
  const errorEl = document.getElementById('rerror')
  const btn = document.getElementById('rbuy-btn')
  errorEl.classList.add('hidden')
  btn.disabled = true; btn.textContent = 'Provisioning...'
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${SUPABASE_URL}/functions/v1/purchase-real`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ pricing_id: rSelectedPlan.id, quantity: rQty })
    })
    const result = await res.json()
    if (!res.ok) { const e = new Error(result.error || 'Purchase failed'); e.status = res.status; throw e }
    await loadSidebarBalance()
    document.querySelector('[data-section="mine"]').click()
  } catch (err) {
    showBuyError(errorEl, err)
  } finally {
    btn.disabled = false; btn.textContent = 'Buy'
  }
}

// ================================================================
// MY NUMBERS
// ================================================================
let activeCards = []
function initMyNumbers() {}

async function loadMyNumbers() {
  activeCards.forEach(el => el._cleanup && el._cleanup())
  activeCards = []
  const { data } = await supabase.from('numbers').select('*').eq('status', 'active').order('created_at', { ascending: false })
  const list = document.getElementById('my-numbers-list')
  const emptyMsg = document.getElementById('no-numbers-msg')
  list.innerHTML = ''
  if (!data || !data.length) { emptyMsg.classList.remove('hidden'); return }
  emptyMsg.classList.add('hidden')
  data.forEach(n => {
    const card = createNumberCard(n, loadMyNumbers)
    activeCards.push(card)
    list.appendChild(card)
  })
}

// ================================================================
// WALLET
// ================================================================
function initWallet() {
  const presets = [500, 1000, 5000, 10000]
  document.getElementById('amount-presets').innerHTML = presets.map(v => `<button class="btn-secondary" data-v="${v}">${fmt(v)}</button>`).join('')
  document.getElementById('amount-presets').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-v]')
    if (!btn) return
    document.getElementById('topup-amount').value = btn.dataset.v
    updatePayBtnLabel()
  })
  document.getElementById('topup-amount').addEventListener('input', updatePayBtnLabel)
  document.getElementById('pay-btn').addEventListener('click', payWithPaystack)
}

function updatePayBtnLabel() {
  const amt = Number(document.getElementById('topup-amount').value || 0)
  document.getElementById('pay-btn').textContent = `Pay ${fmt(amt)}`
}

function payWithPaystack() {
  const amount = Math.round(Number(document.getElementById('topup-amount').value || 0))
  const msg = document.getElementById('topup-msg')
  if (!Number.isFinite(amount) || amount < 100) { msg.textContent = 'Enter an amount of at least ' + fmt(100) + '.'; return }
  if (amount > 1000000) { msg.textContent = 'That amount is too large for one top-up.'; return }
  msg.textContent = ''
  if (!window.PaystackPop) { msg.textContent = 'Payment system still loading, try again in a moment.'; return }

  const handler = window.PaystackPop.setup({
    key: PAYSTACK_PUBLIC_KEY,
    email: session.user.email,
    amount: amount * 100,
    currency: CURRENCY_CODE,
    callback: (response) => verifyPayment(response.reference),
    onClose: () => {}
  })
  handler.openIframe()
}

async function verifyPayment(reference) {
  const msg = document.getElementById('topup-msg')
  msg.textContent = 'Verifying payment...'
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ reference })
    })
    const result = await res.json()
    if (!res.ok || !result.ok) throw new Error(result.error || 'Verification failed')
    await loadSidebarBalance()
    await loadHistory()
    msg.textContent = `Wallet topped up with ${fmt(result.credited)}!`
  } catch (err) {
    msg.textContent = (err.message || 'Verification failed') + ' If you were charged, your wallet will update shortly. If it does not, contact Support with your payment receipt.'
  }
}

async function loadHistory() {
  const { data } = await supabase.from('wallet_transactions').select('*').order('created_at', { ascending: false }).limit(30)
  const box = document.getElementById('wallet-history')
  const emptyMsg = document.getElementById('no-tx-msg')
  if (!data || !data.length) { box.innerHTML = ''; emptyMsg.classList.remove('hidden'); return }
  emptyMsg.classList.add('hidden')
  box.innerHTML = data.map(t => `
    <div style="display:flex;justify-content:space-between;padding:12px 16px;border-bottom:1px solid rgba(var(--line),.06)">
      <div><div>${String(t.note || t.type || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))}</div><div class="muted" style="font-size:.75rem">${new Date(t.created_at).toLocaleString()}</div></div>
      <span class="mono" style="color:${t.amount >= 0 ? 'rgb(var(--highlight))' : 'rgb(var(--fg))'}">${t.amount >= 0 ? '+' : '-'}${fmt(Math.abs(t.amount))}</span>
    </div>
  `).join('')
}
