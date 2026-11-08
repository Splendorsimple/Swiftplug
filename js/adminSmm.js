// Admin "Social Boost" tab. Loaded by admin.html; draws into #admin-content when its tab is tapped.
// Providers (any standard SMM panel), import with your own markup, and edit your prices by hand.
import { supabase } from './supabaseClient.js'
import { SUPABASE_URL } from './config.js'

// Messages: use the site's toast and confirm sheet (ui.js), or the browser's plain boxes if ui.js is missing.
const ask = (m, o) => (window.spUI ? window.spUI.confirm(m, o) : Promise.resolve(window.confirm(m)))
const tell = (m, kind = 'error') => (window.spUI ? window.spUI.toast(m, kind) : window.alert(m))

const nav = document.getElementById('admin-nav')
const content = document.getElementById('admin-content')
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
const store = {
  get(k, d) { try { return localStorage.getItem('smm_' + k) ?? d } catch (_e) { return d } },
  set(k, v) { try { localStorage.setItem('smm_' + k, v) } catch (_e) { /* ignore */ }}
}

nav.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-section]')
  if (b && b.dataset.section === 'smm') render()
})

async function callFn(body) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${SUPABASE_URL}/functions/v1/smm-import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body)
  })
  const out = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(out.error || 'Request failed')
  return out
}

async function render() {
  const { data: providers } = await supabase.from('smm_providers').select('id,name,api_url,is_active').order('name')
  const provs = providers || []
  content.innerHTML = `
    <div class="admin-head"><h2>Social Boost</h2></div>
    <p class="muted admin-hint">Add any SMM panel that offers the standard API (it gives you an API URL and a key). You can add several and switch whenever you like. Your prices are yours: edit them below and imports will never overwrite them.</p>

    <div class="sb-sec"><h3>Providers</h3></div>
    <div id="smm-provs">${provs.length ? provs.map(p => `
      <div class="card sb-prov" id="prov-${p.id}">
        <div class="sb-prov-top">
          <div style="min-width:0"><b>${esc(p.name)}</b><div class="sb-url">${esc(p.api_url)}</div></div>
          <span class="sb-pill ${p.is_active ? 'on' : ''}">${p.is_active ? 'On' : 'Off'}</span>
        </div>
        <div class="sb-acts">
          <button class="btn-secondary" data-bal="${p.id}">Check balance</button>
          <button class="btn-secondary" data-tog="${p.id}" data-on="${p.is_active}">${p.is_active ? 'Turn off' : 'Turn on'}</button>
          <button class="btn-secondary" data-edit="${p.id}">Edit</button>
          <button class="btn-secondary" data-del="${p.id}" style="color:#e5484d">Delete</button>
        </div>
      </div>`).join('') : '<div class="card" style="padding:14px"><b>No providers yet.</b> <span class="muted">Add one below.</span></div>'}</div>

    <details class="card sb-fold"${provs.length ? '' : ' open'}><summary>Add a provider</summary><div class="sb-body">
      <div class="form-row"><label>Name</label><input id="smm-name" placeholder="e.g. My panel" /></div>
      <div class="form-row"><label>API URL</label><input id="smm-url" placeholder="https://example.com/api/v2" /></div>
      <div class="form-row"><label>API key</label><input id="smm-key" type="password" autocomplete="off" placeholder="Paste the key from the provider" /></div>
      <div class="form-actions"><button id="smm-add" class="btn-secondary" style="background:rgb(var(--accent));color:rgb(var(--accentink))">Add provider</button></div>
      <p class="error-text hidden" id="smm-err"></p>
    </div></details>

    <details class="card sb-fold"><summary>Import services from a provider</summary><div class="sb-body">
      <p class="muted admin-hint">Tip: import one platform at a time. Type a word like "instagram followers" in Filter, tap Preview, then Apply.</p>
      <div class="form-row"><label>Provider</label><select id="imp-p">${provs.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>
      <div class="form-row"><label>Filter</label><input id="imp-f" placeholder="e.g. instagram followers" value="${esc(store.get('f', ''))}" /></div>
      <div class="sb-grid">
        <div class="form-row"><label>Markup %</label><input id="imp-m" type="number" inputmode="decimal" value="${esc(store.get('m', '60'))}" /></div>
        <div class="form-row"><label>Round up to</label><input id="imp-o" type="number" inputmode="numeric" value="${esc(store.get('o', '10'))}" /></div>
        <div class="form-row"><label>Naira per provider unit</label><input id="imp-r" type="number" inputmode="decimal" placeholder="e.g. 1500" value="${esc(store.get('r', ''))}" /></div>
        <div class="form-row"><label>Max to import</label><input id="imp-l" type="number" inputmode="numeric" value="${esc(store.get('l', '40'))}" /></div>
      </div>
      <div class="form-actions">
        <button id="imp-prev" class="btn-secondary" style="background:rgb(var(--accent));color:rgb(var(--accentink))">Preview</button>
        <button id="imp-apply" class="btn-secondary" disabled>Apply import</button>
      </div>
      <p class="error-text hidden" id="imp-err"></p>
      <div id="imp-out"></div>
    </div></details>

    <div class="sb-sec"><h3>Your services and prices</h3></div>
    <div class="form-row" style="margin-bottom:10px"><input id="svc-q" placeholder="Search your services..." /></div>
    <div id="svc-list"></div>`

  const $ = (s) => content.querySelector(s)
  const err = (el, msg) => { el.textContent = msg; el.classList.toggle('hidden', !msg) }

  $('#smm-add').addEventListener('click', async () => {
    const row = { name: $('#smm-name').value.trim(), api_url: $('#smm-url').value.trim(), api_key: $('#smm-key').value.trim() }
    if (!row.name || !/^https:\/\//.test(row.api_url) || !row.api_key) return err($('#smm-err'), 'Enter a name, an https:// API URL and the key.')
    const { error } = await supabase.from('smm_providers').insert(row)
    if (error) return err($('#smm-err'), error.message)
    render()
  })
  content.querySelectorAll('[data-tog]').forEach(b => b.addEventListener('click', async () => {
    await supabase.from('smm_providers').update({ is_active: b.dataset.on !== 'true' }).eq('id', b.dataset.tog); render()
  }))
  content.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
    if (!(await ask('Delete this provider and all services imported from it? Past orders stay.', { title: 'Delete provider', confirmText: 'Delete', danger: true }))) return
    await supabase.from('smm_providers').delete().eq('id', b.dataset.del); render()
  }))
  content.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
    const p = provs.find(x => x.id === b.dataset.edit)
    const card = content.querySelector('#prov-' + p.id)
        card.innerHTML = `
      <div class="admin-form" style="margin:0">
        <div class="form-row"><label>Name</label><input data-f="name" value="${esc(p.name)}" /></div>
        <div class="form-row"><label>API URL</label><input data-f="url" value="${esc(p.api_url)}" /></div>
        <div class="form-row"><label>API key</label><input data-f="key" type="password" autocomplete="off" placeholder="Leave empty to keep the current key" /></div>
        <div class="form-actions">
          <button class="btn-secondary" data-f="save" style="background:rgb(var(--accent));color:rgb(var(--accentink))">Save changes</button>
          <button class="btn-secondary" data-f="cancel">Cancel</button>
        </div>
        <p class="error-text hidden" data-f="err"></p>
      </div>`
    const f = (k) => card.querySelector(`[data-f="${k}"]`)
    f('cancel').addEventListener('click', render)
    f('save').addEventListener('click', async () => {
      const row = { name: f('name').value.trim(), api_url: f('url').value.trim() }
      const key = f('key').value.trim()
      if (key) row.api_key = key
      if (!row.name || !/^https:\/\//.test(row.api_url)) { f('err').textContent = 'Enter a name and an https:// API URL.'; f('err').classList.remove('hidden'); return }
      const { error } = await supabase.from('smm_providers').update(row).eq('id', p.id)
      if (error) { f('err').textContent = error.message; f('err').classList.remove('hidden'); return }
      render()
    })
  }))
  content.querySelectorAll('[data-bal]').forEach(b => b.addEventListener('click', async () => {
    b.disabled = true; b.textContent = 'Checking...'
    try { const out = await callFn({ action: 'balance', provider_id: b.dataset.bal }); tell('Provider says: ' + JSON.stringify(out.raw).slice(0, 200), 'info') }
    catch (e) { tell(e.message) }
    b.disabled = false; b.textContent = 'Check balance'
  }))

  // ---- import ----
  const applyBtn = $('#imp-apply')
  const body = (mode) => ({ mode, provider_id: $('#imp-p').value, filter: $('#imp-f').value, markup_percent: $('#imp-m').value, rate: $('#imp-r').value, round_to: $('#imp-o').value, limit: $('#imp-l').value })
  const remember = () => { store.set('f', $('#imp-f').value); store.set('m', $('#imp-m').value); store.set('r', $('#imp-r').value); store.set('o', $('#imp-o').value); store.set('l', $('#imp-l').value) }
  $('#imp-prev').addEventListener('click', async (e) => {
    const btn = e.currentTarget; err($('#imp-err'), ''); applyBtn.disabled = true; remember()
    btn.disabled = true; btn.textContent = 'Reading provider...'
    try {
      const out = await callFn(body('preview'))
      $('#imp-out').innerHTML = `<div class="card"><p><b>${out.total_in_provider}</b> services at the provider. <b>${out.matched}</b> match your filter. <b>${out.will_import}</b> will be imported.</p>
        ${(out.sample || []).map(s => `<div style="padding:6px 0;border-top:1px solid rgba(var(--line),.08);font-size:.88rem"><b>${esc(s.name)}</b><div class="muted">cost ${s.cost} per 1000 → you sell at ₦${s.sell} per 1000 · min ${s.min}, max ${s.max}</div></div>`).join('')}</div>`
      applyBtn.disabled = !out.will_import
    } catch (ex) { err($('#imp-err'), ex.message) }
    btn.disabled = false; btn.textContent = 'Preview'
  })
  applyBtn.addEventListener('click', async () => {
    applyBtn.disabled = true; applyBtn.textContent = 'Importing...'
    try {
      const out = await callFn(body('apply'))
      $('#imp-out').innerHTML = `<div class="card"><p>Done. <b>${out.created}</b> added, <b>${out.updated}</b> updated, <b>${out.kept_your_price}</b> kept at your own price.</p></div>`
      loadServices()
    } catch (ex) { err($('#imp-err'), ex.message) }
    applyBtn.textContent = 'Apply import'
  })

  // ---- services list ----
  async function loadServices() {
    const q = $('#svc-q').value.trim()
    let query = supabase.from('smm_services').select('id,name,platform,cost_per_1000,sell_per_1000,min_qty,max_qty,is_active,price_locked').order('platform').order('name').limit(80)
    if (q) query = query.ilike('name', `%${q}%`)
    const { data } = await query
    const rows = data || []
    $('#svc-list').innerHTML = rows.length ? rows.map(s => `
      <div class="card sb-svc">
        <div class="sb-svc-top"><b style="font-size:.92rem">${esc(s.name)}</b><span class="sb-plat">${esc(s.platform)}</span></div>
        <div class="sb-meta">Cost ${s.cost_per_1000} per 1000 · min ${s.min_qty}, max ${s.max_qty}${s.price_locked ? ' · your price is locked' : ''}</div>
        <div class="sb-price">
          <div class="pf"><label style="margin:0;font-size:.75rem">Your price per 1000 (₦)</label><input type="number" inputmode="decimal" value="${s.sell_per_1000}" data-sell="${s.id}" /></div>
          <label class="sb-sw"><input type="checkbox" data-act="${s.id}" ${s.is_active ? 'checked' : ''} /> Visible</label>
        </div>
      </div>`).join('') : '<div class="card" style="padding:14px"><b>Nothing here yet.</b> <span class="muted">Import some services above.</span></div>'
    $('#svc-list').querySelectorAll('[data-sell]').forEach(i => i.addEventListener('change', async () => {
      const { error } = await supabase.from('smm_services').update({ sell_per_1000: Number(i.value) }).eq('id', i.dataset.sell)
      i.style.outline = error ? '2px solid #ef4444' : '2px solid #22c55e'
      setTimeout(() => { i.style.outline = '' }, 1200)
    }))
    $('#svc-list').querySelectorAll('[data-act]').forEach(b => b.addEventListener('change', async () => {
      const { error } = await supabase.from('smm_services').update({ is_active: b.checked }).eq('id', b.dataset.act)
      if (error) { b.checked = !b.checked; tell('Could not change that: ' + error.message) }
    }))
  }
  $('#svc-q').addEventListener('input', () => { clearTimeout(window.__smmT); window.__smmT = setTimeout(loadServices, 300) })
  loadServices()
  }
      
