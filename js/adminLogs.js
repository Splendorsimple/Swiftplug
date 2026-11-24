// Admin "Accounts" tab (social account logs). Loaded by admin.html; draws into #admin-content when its tab is tapped.
// Flexible markup (percent or fixed naira, default for everything + optional per-product override),
// import from a provider, switch products on/off, and edit prices by hand.
import { supabase } from './supabaseClient.js'
import { SUPABASE_URL } from './config.js'
import { fmt } from './currency.js'

const tell = (m, kind = 'error') => (window.spUI ? window.spUI.toast(m, kind) : window.alert(m))
const nav = document.getElementById('admin-nav')
const content = document.getElementById('admin-content')
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))

nav.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-section]')
  if (b && b.dataset.section === 'logs') render()
})

async function callFn(body) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${SUPABASE_URL}/functions/v1/log-import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body)
  })
  const out = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(out.error || 'Request failed')
  return out
}

async function render() {
  const [{ data: st }, { data: providers }] = await Promise.all([
    supabase.from('log_settings').select('*').eq('id', 1).single(),
    supabase.from('smm_providers').select('id,name,api_url').order('name')
  ])
  const provs = (providers || []).filter(p => /\/api\/v\d+\/?$/i.test(p.api_url || ''))
  const s = st || { markup_type: 'percent', markup_value: 40, round_to: 10, refund_note: '', is_open: true }
  content.innerHTML = `
    <div class="admin-head"><h2>Accounts</h2></div>
    <p class="muted admin-hint">Social account logins you resell. Set your default markup, import products, and fine-tune any single product. Changing the default re-prices every product whose price you have not locked.</p>

    <div class="sb-sec"><h3>Markup and rules</h3></div>
    <div class="card" style="padding:14px">
      <div class="sb-grid">
        <div class="form-row"><label>Markup type</label><select id="lg-type"><option value="percent"${s.markup_type === 'percent' ? ' selected' : ''}>Percent (%)</option><option value="fixed"${s.markup_type === 'fixed' ? ' selected' : ''}>Fixed naira per account</option></select></div>
        <div class="form-row"><label>Markup amount</label><input id="lg-val" type="number" inputmode="decimal" value="${esc(s.markup_value)}" /></div>
        <div class="form-row"><label>Round up to</label><input id="lg-round" type="number" inputmode="numeric" value="${esc(s.round_to)}" /></div>
        <div class="form-row"><label>Accounts page</label><select id="lg-open"><option value="true"${s.is_open ? ' selected' : ''}>Open</option><option value="false"${s.is_open ? '' : ' selected'}>Closed</option></select></div>
      </div>
      <div class="form-row"><label>Refund note customers see</label><textarea id="lg-note" rows="3">${esc(s.refund_note)}</textarea></div>
      <div class="form-actions"><button id="lg-save" class="btn-secondary" style="background:rgb(var(--accent));color:rgb(var(--accentink))">Save</button></div>
      <p class="error-text hidden" id="lg-err"></p>
    </div>

    <details class="card sb-fold" open><summary>Import products from a provider</summary><div class="sb-body">
      ${provs.length ? `
      <p class="muted admin-hint">Uses a provider you added under Social Boost whose API address ends in /api/v1. Tap Preview first, then Apply. Prices, stock and sold-out status refresh each time. Your edits and locked prices are kept.</p>
      <div class="form-row"><label>Provider</label><select id="lg-prov">${provs.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>
      <div class="form-actions">
        <button id="lg-prev" class="btn-secondary" style="background:rgb(var(--accent));color:rgb(var(--accentink))">Preview</button>
        <button id="lg-apply" class="btn-secondary" disabled>Apply import</button>
      </div>
      <p class="error-text hidden" id="lg-ierr"></p><div id="lg-out"></div>` : '<p class="muted">No suitable provider yet. Add one under <b>Social Boost</b> with the API address <span class="mono">https://lifelogservices.com/api/v1</span>.</p>'}
    </div></details>

    <div class="sb-sec"><h3>Your products</h3></div>
    <div class="form-row" style="margin-bottom:10px"><input id="lg-q" placeholder="Search your products..." /></div>
    <div id="lg-list"></div>`

  const $ = (q) => content.querySelector(q)
  const err = (el, msg) => { el.textContent = msg; el.classList.toggle('hidden', !msg) }

  $('#lg-save').addEventListener('click', async () => {
    const row = { markup_type: $('#lg-type').value, markup_value: Number($('#lg-val').value), round_to: Math.max(1, Math.floor(Number($('#lg-round').value) || 10)), refund_note: $('#lg-note').value.trim(), is_open: $('#lg-open').value === 'true' }
    if (!(row.markup_value >= 0)) return err($('#lg-err'), 'Enter a markup of 0 or more.')
    const { error } = await supabase.from('log_settings').update(row).eq('id', 1)
    if (error) return err($('#lg-err'), error.message)
    err($('#lg-err'), ''); tell('Saved. Prices updated.', 'success'); drawList()
  })

  if (provs.length) {
    const applyBtn = $('#lg-apply')
    $('#lg-prev').addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true; b.textContent = 'Checking...'; err($('#lg-ierr'), ''); applyBtn.disabled = true
      try {
        const r = await callFn({ mode: 'preview', provider_id: $('#lg-prov').value })
        $('#lg-out').innerHTML = `<div class="card" style="padding:12px;margin-top:10px"><p><b>${r.in_provider}</b> products at the provider. Categories: ${esc((r.categories || []).join(', ') || 'none')}. Default markup: <b>${esc(r.markup)}</b>.</p>
          ${(r.sample || []).map(x => `<div class="sb-o-meta" style="padding:4px 0"><span>${esc(x.name)} <em class="muted">(${esc(x.category)})</em></span><span class="mono">${fmt(x.cost)} → ${fmt(x.sell)}</span><span>${x.stock} left</span></div>`).join('')}
          ${r.in_provider === 0 ? '<p class="muted">Nothing to import yet. A test key shows no products. Use your live key.</p>' : ''}</div>`
        applyBtn.disabled = r.in_provider === 0
      } catch (e2) { err($('#lg-ierr'), e2.message) }
      b.disabled = false; b.textContent = 'Preview'
    })
    applyBtn.addEventListener('click', async () => {
      applyBtn.disabled = true; applyBtn.textContent = 'Importing...'
      try {
        const r = await callFn({ mode: 'apply', provider_id: $('#lg-prov').value })
        tell(`Done: ${r.created} new, ${r.updated} updated, ${r.soldOut} sold out.`, 'success'); drawList()
      } catch (e2) { err($('#lg-ierr'), e2.message) }
      applyBtn.textContent = 'Apply import'
    })
  }

  let rows = []
  async function drawList() {
    const { data } = await supabase.from('log_products').select('*').order('category').order('name').limit(500)
    rows = data || []; paint()
  }
  function paint() {
    const q = ($('#lg-q').value || '').trim().toLowerCase()
    const list = rows.filter(r => !q || `${r.name} ${r.category}`.toLowerCase().includes(q))
    $('#lg-list').innerHTML = list.length ? list.map(r => `
      <div class="card sb-prov" data-id="${r.id}">
        <div class="sb-prov-top"><div style="min-width:0"><b>${esc(r.name)}</b><div class="sb-url">${esc(r.category)} · cost ${fmt(r.cost)} · ${r.stock} left</div></div>
          <span class="sb-pill ${r.is_active ? 'on' : ''}">${r.is_active ? 'On' : 'Off'}</span></div>
        <div class="sb-o-meta"><span>Your price: <b class="mono">${fmt(r.sell_price)}</b>${r.price_locked ? ' (locked)' : ''}</span>
          <span class="muted">${r.markup_type ? `own markup ${r.markup_value}${r.markup_type === 'fixed' ? ' naira' : '%'}` : 'default markup'}</span></div>
        <div class="sb-acts"><button class="btn-secondary" data-tog="${r.id}">${r.is_active ? 'Turn off' : 'Turn on'}</button><button class="btn-secondary" data-edit="${r.id}">Edit price</button></div>
      </div>`).join('') : '<div class="card" style="padding:14px"><span class="muted">No products yet. Import above.</span></div>'
    content.querySelectorAll('#lg-list [data-tog]').forEach(b => b.addEventListener('click', async () => {
      const r = rows.find(x => x.id === b.dataset.tog)
      await supabase.from('log_products').update({ is_active: !r.is_active }).eq('id', r.id); drawList()
    }))
    content.querySelectorAll('#lg-list [data-edit]').forEach(b => b.addEventListener('click', () => {
      const r = rows.find(x => x.id === b.dataset.edit)
      const card = content.querySelector(`#lg-list [data-id="${r.id}"]`)
      card.innerHTML = `<div class="admin-form" style="margin:0"><b>${esc(r.name)}</b>
        <p class="muted admin-hint">Either give this product its own markup, or type an exact price and lock it. Leave both empty to follow the default.</p>
        <div class="sb-grid">
          <div class="form-row"><label>Own markup type</label><select data-f="mt"><option value="">Use default</option><option value="percent"${r.markup_type === 'percent' ? ' selected' : ''}>Percent (%)</option><option value="fixed"${r.markup_type === 'fixed' ? ' selected' : ''}>Fixed naira</option></select></div>
          <div class="form-row"><label>Own markup amount</label><input data-f="mv" type="number" inputmode="decimal" value="${esc(r.markup_value ?? '')}" /></div>
          <div class="form-row"><label>Exact price (locks it)</label><input data-f="price" type="number" inputmode="decimal" value="${r.price_locked ? esc(r.sell_price) : ''}" placeholder="optional" /></div>
        </div>
        <div class="form-actions"><button class="btn-secondary" data-f="save" style="background:rgb(var(--accent));color:rgb(var(--accentink))">Save</button><button class="btn-secondary" data-f="cancel">Cancel</button></div>
        <p class="error-text hidden" data-f="err"></p></div>`
      const f = (k) => card.querySelector(`[data-f="${k}"]`)
      f('cancel').addEventListener('click', paint)
      f('save').addEventListener('click', async () => {
        const price = f('price').value.trim()
        const mt = f('mt').value
        const row = price ? { price_locked: true, sell_price: Number(price), markup_type: null, markup_value: null }
          : { price_locked: false, markup_type: mt || null, markup_value: mt ? Number(f('mv').value) : null }
        if (price && !(Number(price) > 0)) { f('err').textContent = 'Enter a price above 0.'; f('err').classList.remove('hidden'); return }
        if (mt && !(Number(f('mv').value) >= 0)) { f('err').textContent = 'Enter the markup amount.'; f('err').classList.remove('hidden'); return }
        const { error } = await supabase.from('log_products').update(row).eq('id', r.id)
        if (error) { f('err').textContent = error.message; f('err').classList.remove('hidden'); return }
        drawList()
      })
    }))
  }
  $('#lg-q').addEventListener('input', paint)
  drawList()
}
