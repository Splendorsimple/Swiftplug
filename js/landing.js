import { supabase } from './supabaseClient.js'
import { renderNavbar } from './nav.js'
import { fmt } from './currency.js'
import { getApplicableDiscount, applyDiscount } from './discounts.js'

renderNavbar()

let kind = 'disposable'
let rows = []          // rows from the public "catalog" view
let countries = []
let services = []
let chosenCountry = null
let chosenRow = null
let qty = 1
let discount = null

const countrySelect = document.getElementById('country-select')
const optionField = document.getElementById('option-field')
const optionLabel = document.getElementById('option-label')
const optionSelect = document.getElementById('option-select')
const qtyValueEl = document.getElementById('qty-value')

async function loadData() {
  const [{ data: catalogRows }, { data: countryRows }, { data: serviceRows }] = await Promise.all([
    supabase.from('catalog').select('*'),
    supabase.from('countries').select('id,name,flag_emoji').order('name'),
    supabase.from('services').select('id,name').eq('is_active', true)
  ])
  rows = catalogRows || []
  countries = countryRows || []
  services = serviceRows || []
  refreshCountryOptions()
}

function refreshCountryOptions() {
  const kindRows = rows.filter(r => r.number_type === kind)
  const ids = new Set(kindRows.map(r => r.country_id))
  const options = countries.filter(c => ids.has(c.id))

  document.getElementById('empty-catalog-msg').classList.toggle('hidden', rows.length === 0 ? false : kindRows.length > 0)
  document.getElementById('catalog-picker').classList.toggle('hidden', rows.length > 0 && kindRows.length === 0)

  countrySelect.innerHTML = '<option value="">Select a country</option>' +
    options.map(c => `<option value="${c.id}">${c.flag_emoji || ''} ${c.name}</option>`).join('')
  chosenCountry = null
  chosenRow = null
  optionField.classList.add('hidden')
  updatePreview()
}

function refreshOptionSelect() {
  const kindRows = rows.filter(r => r.number_type === kind && r.country_id === countrySelect.value)
  optionLabel.textContent = kind === 'disposable' ? 'Service' : 'Plan'
  optionSelect.innerHTML = `<option value="">Select a ${kind === 'disposable' ? 'service' : 'plan'}</option>` +
    kindRows.map(r => {
      const label = kind === 'disposable' ? (services.find(s => s.id === r.service_id)?.name || 'Service') : r.plan_duration
      return `<option value="${r.id}">${label} — ${fmt(r.sell_price)}</option>`
    }).join('')
  optionField.classList.toggle('hidden', kindRows.length === 0)
}

async function updatePreview() {
  const country = countries.find(c => c.id === countrySelect.value)
  document.getElementById('preview-country').textContent = country ? `${country.flag_emoji || ''} ${country.name}` : 'Choose a country'
  document.getElementById('order-tag').textContent = kind === 'disposable' ? 'Disposable' : 'Longer-term'

  if (chosenRow) {
    const label = kind === 'disposable' ? (services.find(s => s.id === chosenRow.service_id)?.name) : chosenRow.plan_duration
    document.getElementById('preview-option').textContent = label
  } else {
    document.getElementById('preview-option').textContent = kind === 'disposable' ? 'Choose a service' : 'Choose a plan'
  }

  const subtotal = chosenRow ? chosenRow.sell_price * qty : 0
  discount = chosenRow ? await getApplicableDiscount(qty, kind) : null
  const total = discount ? applyDiscount(subtotal, discount) : subtotal

  document.getElementById('preview-qty-label').textContent = `${qty} line${qty > 1 ? 's' : ''}`
  document.getElementById('preview-subtotal').textContent = fmt(subtotal)
  document.getElementById('preview-total').textContent = fmt(total)

  const discRow = document.getElementById('preview-discount-row')
  if (discount) {
    discRow.classList.remove('hidden')
    document.getElementById('preview-discount-amt').textContent = `-${fmt(subtotal - total)}`
  } else {
    discRow.classList.add('hidden')
  }
}

document.getElementById('kind-toggle').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-kind]')
  if (!btn) return
  kind = btn.dataset.kind
  document.querySelectorAll('#kind-toggle button').forEach(b => b.classList.toggle('active', b === btn))
  qty = 1; qtyValueEl.textContent = '1'
  refreshCountryOptions()
})

countrySelect.addEventListener('change', () => { chosenRow = null; refreshOptionSelect(); updatePreview() })
optionSelect.addEventListener('change', () => {
  chosenRow = rows.find(r => r.id === optionSelect.value) || null
  updatePreview()
})
document.getElementById('qty-minus').addEventListener('click', () => { qty = Math.max(1, qty - 1); qtyValueEl.textContent = qty; updatePreview() })
document.getElementById('qty-plus').addEventListener('click', () => {
  const max = chosenRow?.max_quantity_per_purchase || 10
  qty = Math.min(max, qty + 1); qtyValueEl.textContent = qty; updatePreview()
})

document.getElementById('get-line-btn').addEventListener('click', async () => {
  const { data: { session } } = await supabase.auth.getSession()
  window.location.href = session ? 'dashboard.html' : 'signup.html'
})

loadData()
