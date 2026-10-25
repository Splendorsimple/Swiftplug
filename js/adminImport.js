// Admin "Import prices" tab. Loaded by admin.html; draws into #admin-content when its tab is tapped.
import { supabase } from './supabaseClient.js'
import { SUPABASE_URL } from './config.js'

const nav = document.getElementById('admin-nav')
const content = document.getElementById('admin-content')
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
const store = {
  get(k, d) { try { return localStorage.getItem('imp_' + k) ?? d } catch (_e) { return d } },
  set(k, v) { try { localStorage.setItem('imp_' + k, v) } catch (_e) { /* ignore */ } }
}

nav.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-section]')
  if (b && b.dataset.section === 'import') render()
})

async function render() {
  const { data: providers } = await supabase.from('providers').select('id,name,is_active').order('name')
  content.innerHTML = `
    <div class="admin-head"><h2>Import prices</h2></div>
    <p class="muted admin-hint">Pulls a provider's price list and creates your price rows for the services you have. Prices you edit by hand are never overwritten. Always tap Preview first.</p>
    <div class="card admin-form">
      <div class="form-row"><label>Provider</label>
        <select id="imp-provider">${(providers || []).map(p => `<option value="${p.id}">${esc(p.name)}${p.is_active ? '' : ' (inactive)'}</option>`).join('')}</select></div>
      <div class="form-row"><label>Server option</label>
        <select id="imp-tier"><option value="1">Server 1</option><option value="2">Server 2</option><option value="3">Server 3</option></select></div>
      <div class="form-row"><label>Markup % over cost</label><input id="imp-markup" type="number" value="${esc(store.get('markup', '40'))}" /></div>
      <div class="form-row"><label>Naira per 1 provider unit (e.g. per $1)</label><input id="imp-rate" type="number" placeholder="e.g. 1500" value="${esc(store.get('rate', ''))}" /></div>
      <div class="form-row"><label>Round prices up to nearest</label><input id="imp-round" type="number" value="${esc(store.get('round', '10'))}" /></div>
      <div class="form-actions">
        <button id="imp-preview" class="btn-secondary" style="background:rgb(var(--accent));color:rgb(var(--accentink))">Preview</button>
        <button id="imp-apply" class="btn-secondary" disabled>Apply import</button>
      </div>
      <p class="error-text hidden" id="imp-err"></p>
    </div>
    <div id="imp-out"></div>`
  const $ = (id) => content.querySelector(id)
  const applyBtn = $('#imp-apply')
  let lastKey = ''
  const payload = (mode) => ({
    mode, provider_id: $('#imp-provider').value, tier: $('#imp-tier').value,
    markup_percent: $('#imp-markup').value, rate: $('#imp-rate').value, round_to: $('#imp-round').value
  })
  async function call(mode) {
    $('#imp-err').classList.add('hidden')
    store.set('markup', $('#imp-markup').value); store.set('rate', $('#imp-rate').value); store.set('round', $('#imp-round').value)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${SUPABASE_URL}/functions/v1/import-provider-prices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(payload(mode))
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
      lastKey = JSON.stringify(payload('x'))
      $('#imp-out').innerHTML = `
        <div class="card" style="margin-bottom:12px">
          <p><b>${esc(r.provider)}</b> sent ${r.providerCountries} countries, ${r.providerServices} services and ${r.priceRows} price lines.</p>
          <p>Matched to yours: <b>${r.matchedCountries}</b> countries, <b>${r.matchedServices}</b> services.</p>
          <p>Will create <b>${r.toCreate}</b> new rows, refresh <b>${r.toUpdate}</b>, and leave <b>${r.skippedYours}</b> of yours alone.</p>
          ${r.unmatchedServices.length ? `<p class="muted">Not found at this provider: ${r.unmatchedServices.map(esc).join(', ')}</p>` : ''}
        </div>
        <div class="card" style="margin-bottom:12px"><p><b>Check these matches look right</b> (your service, provider's service):</p>
          <p class="muted">${r.serviceMatches.map(m => esc(m.ours) + ' = ' + esc(m.provider)).join('<br>') || 'none'}</p></div>
        <table><thead><tr><th>Country</th><th>Service</th><th>Cost</th><th>Sell</th><th>Action</th></tr></thead><tbody>
          ${r.sample.map(s => `<tr><td data-label="Country">${esc(s.country)}</td><td data-label="Service">${esc(s.service)}</td><td data-label="Cost">${esc(s.cost)}</td><td data-label="Sell">₦${esc(s.sell)}</td><td data-label="Action">${esc(s.action)}</td></tr>`).join('')}
        </tbody></table>
        <details style="margin-top:12px"><summary class="muted">What the provider sent (first 250 characters)</summary>
          <p class="mono muted" style="word-break:break-all;font-size:.75rem">${esc(r.raw.countries)}<br><br>${esc(r.raw.services)}<br><br>${esc(r.raw.prices)}</p></details>`
      applyBtn.disabled = r.toCreate + r.toUpdate === 0
    } catch (err) {
      $('#imp-err').textContent = err.message; $('#imp-err').classList.remove('hidden')
    } finally { btn.disabled = false; btn.textContent = 'Preview' }
  })
  applyBtn.addEventListener('click', async () => {
    if (JSON.stringify(payload('x')) !== lastKey) { alert('Settings changed. Tap Preview again first.'); return }
    if (!confirm('Create and update price rows now?')) return
    applyBtn.disabled = true; applyBtn.textContent = 'Importing...'
    try {
      const r = await call('apply')
      $('#imp-out').innerHTML = `<div class="card"><p><b>Done.</b> Created ${r.created}, refreshed ${r.updated}, left ${r.skippedYours} of yours alone. Check them in Countries & Pricing.</p></div>`
    } catch (err) {
      $('#imp-err').textContent = err.message; $('#imp-err').classList.remove('hidden')
      applyBtn.disabled = false
    } finally { applyBtn.textContent = 'Apply import' }
  })
                                                                                                                                                                                                       }
