// Admin "Prices & stock" panel. Drawn under the Import prices tab (adminImport.js loads it).
// Shows every one-time price row with the provider's cost, your price, profit and how many numbers are in stock.
// Change a price here and it is saved at once. Prices you change are protected from later imports.
import { supabase } from './supabaseClient.js'
import { SUPABASE_URL } from './config.js'

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
const naira = (n) => '₦' + Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 2 })
const PAGE = 40

function ago(iso) {
  if (!iso) return 'never'
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return m + ' min ago'
  const h = Math.round(m / 60)
  return h < 48 ? h + ' h ago' : Math.round(h / 24) + ' days ago'
}

export async function mountPrices(root) {
  root.innerHTML = `
    <div class="card" style="margin-top:16px">
      <div class="admin-head" style="margin-bottom:6px"><h2 style="font-size:1.1rem">Prices &amp; stock</h2>
        <button id="ps-refresh" class="btn-secondary" style="background:rgb(var(--accent));color:rgb(var(--accentink))">Refresh stock now</button></div>
      <p class="muted admin-hint" id="ps-sync">Loading...</p>
      <div class="form-row"><input id="ps-q" type="search" placeholder="Search country or service..." /></div>
      <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <select id="ps-prov"><option value="">All providers</option></select>
        <select id="ps-view">
          <option value="">All rows</option><option value="out">Out of stock</option><option value="low">Low stock (10 or less)</option>
          <option value="mine">Your own prices</option><option value="loss">Selling below cost</option><option value="off">Switched off</option>
        </select>
      </div>
      <p class="muted" id="ps-count" style="font-size:.85rem"></p>
      <div id="ps-list"></div>
      <button id="ps-more" class="btn-secondary hidden" style="margin-top:10px">Show more</button>
    </div>`
  const $ = (s) => root.querySelector(s)
  let rows = [], providers = [], shown = PAGE
  try { const v = sessionStorage.getItem('ps_view'); if (v) { $('#ps-view').value = v; sessionStorage.removeItem('ps_view') } } catch (_e) { /* ignore */ }

  async function load() {
    const [{ data: provs }, { data: pr, error }] = await Promise.all([
      supabase.from('providers').select('id,name,type,last_sync_at,last_sync_note').eq('type', 'disposable').order('name'),
      supabase.from('pricing').select('id,sell_price,buy_cost,stock,stock_updated_at,tier,is_active,price_locked,is_imported,provider_id,countries(name,flag_emoji),services(name)')
        .eq('number_type', 'disposable').order('id').range(0, 1999)
    ])
    if (error) { $('#ps-sync').textContent = 'Could not load prices: ' + error.message; return }
    providers = provs || []
    rows = (pr || []).sort((a, b) => (a.countries?.name || '').localeCompare(b.countries?.name || '') || (a.services?.name || '').localeCompare(b.services?.name || '') || (a.tier || 1) - (b.tier || 1))
    const sel = $('#ps-prov'), keep = sel.value
    sel.innerHTML = '<option value="">All providers</option>' + providers.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')
    sel.value = keep
    $('#ps-sync').innerHTML = providers.length
      ? providers.map(p => `<b>${esc(p.name)}</b>: stock checked ${esc(ago(p.last_sync_at))}${p.last_sync_note ? ' &middot; ' + esc(p.last_sync_note) : ''}`).join('<br>') + '<br>Stock refreshes by itself every 10 minutes.'
      : 'No one-time provider yet.'
    draw()
  }

  function filtered() {
    const q = $('#ps-q').value.trim().toLowerCase(), pv = $('#ps-prov').value, v = $('#ps-view').value
    return rows.filter(r => {
      if (pv && r.provider_id !== pv) return false
      if (q && !`${r.countries?.name || ''} ${r.services?.name || ''}`.toLowerCase().includes(q)) return false
      if (v === 'out') return r.stock === 0
      if (v === 'low') return r.stock != null && r.stock > 0 && r.stock <= 10
      if (v === 'mine') return r.price_locked
      if (v === 'loss') return r.buy_cost != null && Number(r.sell_price) < Number(r.buy_cost)
      if (v === 'off') return !r.is_active
      return true
    })
  }

  function draw() {
    const list = filtered()
    $('#ps-count').textContent = rows.length ? `${list.length} of ${rows.length} rows` : 'No price rows yet. Use the importer above, or add rows in Countries & Pricing.'
    $('#ps-list').innerHTML = list.slice(0, shown).map(r => {
      const cost = r.buy_cost != null ? Number(r.buy_cost) : null
      const profit = cost != null ? Number(r.sell_price) - cost : null
      const stock = r.stock == null ? '<span class="muted">stock unknown</span>'
        : r.stock === 0 ? '<b style="color:#e5484d">Out of stock</b>'
        : `<b>${r.stock.toLocaleString('en-NG')}</b> in stock`
      return `<div class="card" data-id="${r.id}" style="margin-top:8px;padding:12px;${r.is_active ? '' : 'opacity:.55'}">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:center">
          <b>${esc(r.countries?.flag_emoji || '')} ${esc(r.countries?.name || '?')} &middot; ${esc(r.services?.name || '?')}</b>
          <span class="muted" style="font-size:.8rem;white-space:nowrap">Server ${r.tier || 1}</span></div>
        <div class="muted" style="font-size:.85rem;margin:4px 0">${stock}${cost != null ? ' &middot; cost ' + naira(cost) : ''}${profit != null ? ' &middot; <span style="color:' + (profit < 0 ? '#e5484d' : 'inherit') + '">' + (profit < 0 ? 'loss ' : 'profit ') + naira(Math.abs(profit)) + '</span>' : ''}${r.price_locked ? ' &middot; <span title="Imports will not change this price">your price</span>' : ''}</div>
        <div style="display:flex;gap:8px;align-items:center">
          <input class="ps-price mono" type="number" min="0" step="1" value="${esc(r.sell_price)}" style="flex:1" aria-label="Your price" />
          <button class="ps-save btn-secondary">Save</button>
          <label style="display:flex;gap:4px;align-items:center;font-size:.85rem"><input class="ps-on" type="checkbox" ${r.is_active ? 'checked' : ''} /> On</label>
        </div></div>`
    }).join('')
    $('#ps-more').classList.toggle('hidden', list.length <= shown)
  }

  root.addEventListener('click', async (e) => {
    const save = e.target.closest('.ps-save')
    if (!save) return
    const card = save.closest('[data-id]'), id = card.dataset.id
    const price = Number(card.querySelector('.ps-price').value)
    if (!(price >= 0)) { alert('Enter a price of 0 or more.'); return }
    save.disabled = true; save.textContent = '...'
    const { data, error } = await supabase.from('pricing').update({ sell_price: price }).eq('id', id).select('sell_price,price_locked').single()
    save.disabled = false
    if (error) { save.textContent = 'Save'; alert('Could not save: ' + error.message); return }
    const row = rows.find(r => r.id === id); if (row) Object.assign(row, data)
    save.textContent = 'Saved'; setTimeout(() => { draw() }, 700)
  })
  root.addEventListener('change', async (e) => {
    const on = e.target.closest('.ps-on')
    if (!on) return
    const id = on.closest('[data-id]').dataset.id
    const { error } = await supabase.from('pricing').update({ is_active: on.checked }).eq('id', id)
    if (error) { alert('Could not change: ' + error.message); on.checked = !on.checked; return }
    const row = rows.find(r => r.id === id); if (row) row.is_active = on.checked
    on.closest('[data-id]').style.opacity = on.checked ? '' : '.55'
  })
  ;['#ps-q', '#ps-prov', '#ps-view'].forEach(s => $(s).addEventListener('input', () => { shown = PAGE; draw() }))
  $('#ps-more').addEventListener('click', () => { shown += PAGE; draw() })
  $('#ps-refresh').addEventListener('click', async (e) => {
    const b = e.currentTarget; b.disabled = true; b.textContent = 'Checking...'
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-stock`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: '{}'
      })
      const out = await res.json()
      if (!res.ok) throw new Error(out.error || 'Refresh failed')
    } catch (err) { alert(err.message) }
    b.disabled = false; b.textContent = 'Refresh stock now'
    await load()
  })
  await load()
      }
