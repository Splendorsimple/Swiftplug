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

// ---------------- Disposable ----------------
let allServices = []
let selectedService = null
let dCountry = null
let dPricing = null
let dQty = 1
let dCatalog = []
let dCountries = []

async function initDisposableFlow() {
  const { data } = await supabase.from('services').select('*').eq('is_active', true)
  const { data: catalogRows } = await supabase.from('catalog').select('*').eq('number_type', 'disposable')
  const { data: countryRows } = await supabase.from('countries').select('id,name,flag_emoji')
  dCatalog = catalogRows || []
  dCountries = countryRows || []
  allServices = (data || []).map(s => {
    const rows = (catalogRows || []).filter(r => r.service_id === s.id)
    const minPrice = rows.length ? Math.min(...rows.map(r => r.sell_price)) : null
    const countryCount = new Set(rows.map(r => r.country_id)).size
    return { ...s, minPrice, countryCount }
  })
  renderServiceGrid(allServices)
  const qp = new URLSearchParams(location.search)
  if (qp.get('kind') === 'real') document.querySelector('#kind-toggle button[data-kind="real"]')?.click()
  const sec = qp.get('section')
  if (sec) document.querySelector(`#dash-nav button[data-section="${CSS.escape(sec)}"]`)?.click()
  const want = qp.get('service')
  if (want) document.querySelector(`#service-grid .service-card[data-id="${CSS.escape(want)}"]`)?.click()

  document.getElementById('service-search').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase()
    renderServiceGrid(allServices.filter(s => s.name.toLowerCase().includes(q)))
  })

  document.getElementById('back-to-services').addEventListener('click', () => {
    document.getElementById('service-catalog').classList.remove('hidden')
    document.getElementById('disposable-purchase-form').classList.add('hidden')
    resetDisposableForm()
  })

  document.getElementById('dcountry-select').addEventListener('change', async (e) => {
    if (!e.target.value) { dCountry = null; dPricing = null; document.getElementById('dqty-wrap').classList.add('hidden'); return }
    dCountry = { id: e.target.value }
    await loadDisposablePricing()
  })

  document.getElementById('dqty-minus').addEventListener('click', () => setDQty(dQty - 1))
  document.getElementById('dqty-plus').addEventListener('click', () => setDQty(dQty + 1))
  document.getElementById('dbuy-btn').addEventListener('click', buyDisposable)
}

function renderServiceGrid(list) {
  const grid = document.getElementById('service-grid')
  grid.innerHTML = ''
  sortServices(list, s => (s.minPrice != null ? 1 : 0)).forEach(s => {
    const btn = document.createElement('button')
    btn.className = 'service-card'
    btn.dataset.id = s.id
    btn.dataset.name = s.name
    const ic = document.createElement('span')
    ic.className = 'service-icon'
    fillIcon(ic, s)
    const name = document.createElement('span'); name.style.cssText = 'font-weight:700;font-size:.9rem'; name.textContent = s.name
    const price = document.createElement('span'); price.className = 'muted'; price.style.fontSize = '.8rem'
    price.textContent = s.minPrice != null ? 'from ' + fmt(s.minPrice) : 'Unavailable'
    const c = document.createElement('span'); c.style.cssText = 'font-size:.75rem;color:rgb(var(--highlight))'
    c.textContent = `Available in ${s.countryCount} countries`
    btn.append(ic, name, price, c)
    btn.addEventListener('click', () => {
      selectedService = { id: s.id, name: s.name }
      document.getElementById('chosen-service-name').textContent = s.name
      document.getElementById('service-catalog').classList.add('hidden')
      document.getElementById('disposable-purchase-form').classList.remove('hidden')
      fillCountrySelect()
    })
    grid.appendChild(btn)
  })
}

function fillCountrySelect() {
  const sel = document.getElementById('dcountry-select')
  const best = {}
  dCatalog.filter(r => r.service_id === selectedService.id).forEach(r => {
    best[r.country_id] = Math.min(best[r.country_id] ?? Infinity, Number(r.sell_price))
  })
  const opts = dCountries.filter(c => best[c.id] != null).sort((a, b) => a.name.localeCompare(b.name))
  sel.innerHTML = opts.length
    ? '<option value="">Select a country</option>' + opts.map(c => `<option value="${c.id}">${c.flag_emoji || ''} ${c.name} - from ${fmt(best[c.id])}</option>`).join('')
    : '<option value="">No countries available yet</option>'
  dCountry = null; dPricing = null
  document.getElementById('dqty-wrap').classList.add('hidden')
    }
function resetDisposableForm() {
  dCountry = null; dPricing = null; dQty = 1
  document.getElementById('dqty-value').textContent = '1'
  document.getElementById('dqty-wrap').classList.add('hidden')
  const cs = document.getElementById('dcountry-select'); if (cs) cs.value = ''
}

let dOptions = []
async function loadDisposablePricing() {
  const { data } = await supabase.from('catalog').select('*')
    .eq('service_id', selectedService.id).eq('country_id', dCountry.id).eq('number_type', 'disposable').order('tier')
  dOptions = data || []
  const box = document.getElementById('dtiers')
  if (!dOptions.length) {
    dPricing = null
    box.classList.add('hidden')
    document.getElementById('dqty-wrap').classList.add('hidden')
    return
  }
  dPricing = dOptions[0]
  box.innerHTML = dOptions.map(o => `
    <button type="button" class="tier-chip${o.id === dPricing.id ? ' active' : ''}" data-id="${o.id}">
      <span>Server ${o.tier || 1}</span><b class="mono">${fmt(o.sell_price)}</b>
    </button>`).join('')
  box.classList.toggle('hidden', dOptions.length < 2)
  box.querySelectorAll('.tier-chip').forEach(btn => btn.addEventListener('click', () => {
    dPricing = dOptions.find(o => o.id === btn.dataset.id)
    box.querySelectorAll('.tier-chip').forEach(b => b.classList.toggle('active', b === btn))
    setDQty(dQty)
    document.getElementById('dmax-note').textContent = `max ${dPricing.max_quantity_per_purchase || 10} per purchase`
  }))
  document.getElementById('dqty-wrap').classList.remove('hidden')
  document.getElementById('dmax-note').textContent = `max ${dPricing.max_quantity_per_purchase || 10} per purchase`
  dQty = 1; document.getElementById('dqty-value').textContent = '1'
  await updateDisposableTotals()
}

function setDQty(v) {
  const max = dPricing?.max_quantity_per_purchase || 10
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

async function buyDisposable() {
  const errorEl = document.getElementById('derror')
  const btn = document.getElementById('dbuy-btn')
  errorEl.classList.add('hidden')
  btn.disabled = true; btn.textContent = 'Finding number...'
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${SUPABASE_URL}/functions/v1/purchase-disposable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ pricing_id: dPricing.id, quantity: dQty })
    })
    const result = await res.json()
    if (!res.ok) throw new Error(result.error || 'Purchase failed')

    await loadSidebarBalance()
    // Show the new number(s) right here, under the Buy button, with timer, OTP, copy and cancel.
    const box = document.getElementById('dresult')
    const label = `${selectedService.name} - ${fmt(dPricing.sell_price)}`
    ;(result.numbers || []).forEach(n => {
      const card = createNumberCard(n, () => setTimeout(() => { card.remove(); loadSidebarBalance() }, 0), { label })
      activeCards.push(card)
      box.prepend(card)
    })
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  } catch (err) {
    errorEl.textContent = err.message
    errorEl.classList.remove('hidden')
  } finally {
    btn.disabled = false; btn.textContent = 'Buy'
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
    if (!res.ok) throw new Error(result.error || 'Purchase failed')
    await loadSidebarBalance()
    document.querySelector('[data-section="mine"]').click()
  } catch (err) {
    errorEl.textContent = err.message
    errorEl.classList.remove('hidden')
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
  const amount = Number(document.getElementById('topup-amount').value || 0)
  const msg = document.getElementById('topup-msg')
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
    msg.textContent = err.message
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
      <div><div>${t.note || t.type}</div><div class="muted" style="font-size:.75rem">${new Date(t.created_at).toLocaleString()}</div></div>
      <span class="mono" style="color:${t.amount >= 0 ? 'rgb(var(--highlight))' : 'rgb(var(--fg))'}">${t.amount >= 0 ? '+' : '-'}${fmt(Math.abs(t.amount))}</span>
    </div>
  `).join('')
}
