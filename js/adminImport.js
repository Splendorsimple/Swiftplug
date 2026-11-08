// Admin "Prices" tab. Loaded by admin.html; draws into #admin-content when its tab is tapped.
// Order on the page: Pricing rules, Prices & stock, then the importer (folded away).
import { supabase } from './supabaseClient.js'
import { SUPABASE_URL } from './config.js'

// Messages: use the site's toast and confirm sheet (ui.js), or the browser's plain boxes if ui.js is missing.
const ask = (m, o) => (window.spUI ? window.spUI.confirm(m, o) : Promise.resolve(window.confirm(m)))
const tell = (m, kind = 'error') => (window.spUI ? window.spUI.toast(m, kind) : window.alert(m))

const nav = document.getElementById('admin-nav')
const content = document.getElementById('admin-content')
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
const naira = (n) => '₦' + Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 2 })

nav.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-section]')
  if (b && b.dataset.section === 'import') render()
})

async function render() {
  const { data: providers } = await supabase.from('providers').select('id,name,type,is_active').eq('type', 'disposable').order('name')
  const options = (providers || []).length
    ? providers.map(p => `<option value="${p.id}">${esc(p.name)}${p.is_active ? '' : ' (switched off)'}</option>`).join('')
    : '<option value="">No one-time provider yet. Add one on the Providers page.</option>'
  content.innerHTML = `
    <div class="admin-head"><h2>Prices</h2></div>
    <div id="rules-root"></div>
    <div id="ps-root" style="margin-top:16px"></div>
    <details class="card" style="margin-top:16px;padding:12px"><summary style="cursor:pointer;font-weight:700">Import prices from a provider</summary>
      <p class="muted admin-hint" style="margin-top:8px">Reads the provider's services, converts their prices to naira at the current dollar rate, and creates a price for every server you switched on (cost + your profit). Prices you typed by hand are never overwritten. Always tap Preview first.</p>
      <div class="form-row"><label>Provider</label><select id="imp-provider">${options}</select></div>
      <div class="form-actions">
        <button id="imp-preview" class="btn-secondary" style="background:rgb(var(--accent));color:rgb(var(--accentink))">Preview</button>
        <button id="imp-apply" class="btn-secondary" disabled>Apply import</button>
      </div>
      <p class="error-text hidden" id="imp-err"></p>
      <div id="imp-out"></div>
    </details>`
  const $ = (id) => content.querySelector(id)
  const mountPanel = () => import('./adminPrices.js').then(m => m.mountPrices($('#ps-root'))).catch((e) => console.warn('Prices panel skipped', e))
  const mountRules = () => import('./adminRules.js').then(m => m.mountRules($('#rules-root'), mountPanel)).catch((e) => console.warn('Rules card skipped', e))
  mountRules(); mountPanel()

  const applyBtn = $('#imp-apply')
  let lastKey = ''
  async function call(mode) {
    $('#imp-err').classList.add('hidden')
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${SUPABASE_URL}/functions/v1/import-provider-prices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ mode, provider_id: $('#imp-provider').value })
    })
    const out = await res.json()
    if (!res.ok) throw new Error(out.error || 'Import failed')
    return out
  }
  $('#imp-preview').addEventListener('click', async (e) => {
    const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Reading provider...'
    applyBtn.disabled = true
    try {
      const r = await call('preview')
      lastKey = $('#imp-provider').value
      $('#imp-out').innerHTML = `
        <div class="card" style="margin:12px 0">
          <p><b>${esc(r.provider)}</b> sent ${r.providerCountries} countries, ${r.providerServices} services and ${r.priceRows} price lines.</p>
          <p>Matched to yours: <b>${r.matchedCountries}</b> countries, <b>${r.matchedServices}</b> services.</p>
          <p>${r.currency === 'USD' ? `Dollar rate used: <b>${naira(r.rate)}</b> per $1.` : 'Provider prices are already in naira.'} Servers switched on: <b>${r.servers.join(', ')}</b>.</p>
          <p>Will create <b>${r.toCreate}</b> new prices, refresh <b>${r.toUpdate}</b>, and leave <b>${r.skippedYours}</b> of yours alone.</p>
          ${r.unmatchedServices.length ? `<p class="muted">Not found at this provider: ${r.unmatchedServices.map(esc).join(', ')}</p>` : ''}
        </div>
        <table><thead><tr><th>Country</th><th>Service</th><th>Server</th><th>Cost</th><th>Profit</th><th>Buyer pays</th></tr></thead><tbody>
          ${r.sample.map(s => `<tr><td data-label="Country">${esc(s.country)}</td><td data-label="Service">${esc(s.service)}</td><td data-label="Server">${esc(s.server)}</td><td data-label="Cost">${naira(s.cost)}</td><td data-label="Profit">${naira(s.profit)}</td><td data-label="Buyer pays"><b>${naira(s.sell)}</b></td></tr>`).join('')}
        </tbody></table>
        <details style="margin-top:12px"><summary class="muted">What the provider sent (first 250 characters)</summary>
          <p class="mono muted" style="overflow-wrap:anywhere;font-size:.75rem">${esc(r.raw.countries)}<br><br>${esc(r.raw.services)}<br><br>${esc(r.raw.prices)}</p></details>`
      applyBtn.disabled = r.toCreate + r.toUpdate === 0
    } catch (err) {
      $('#imp-err').textContent = err.message; $('#imp-err').classList.remove('hidden')
    } finally { btn.disabled = false; btn.textContent = 'Preview' }
  })
  applyBtn.addEventListener('click', async () => {
    if ($('#imp-provider').value !== lastKey) { tell('Provider changed. Tap Preview again first.'); return }
    if (!(await ask('Create and update prices now?', { title: 'Import prices', confirmText: 'Import now' }))) return
    applyBtn.disabled = true; applyBtn.textContent = 'Importing...'
    try {
      const r = await call('apply')
      $('#imp-out').innerHTML = `<div class="card" style="margin-top:12px"><p><b>Done.</b> Created ${r.created}, refreshed ${r.updated}, left ${r.skippedYours} of yours alone. They are listed above under Prices &amp; stock.</p></div>`
      mountPanel()
    } catch (err) {
      $('#imp-err').textContent = err.message; $('#imp-err').classList.remove('hidden')
      applyBtn.disabled = false
    } finally { applyBtn.textContent = 'Apply import' }
  })
}
