// Admin "Servers": add as many servers as you like. Every server carries every service you have imported.
// Each server has its own profit; buyer price on that server = provider cost in naira + that profit.
// Buyers pick a service and a country, then choose between the servers that are switched on.
import { supabase } from './supabaseClient.js'
import { requireAdmin } from './authGuards.js'

const nav = document.getElementById('admin-nav')
const content = document.getElementById('admin-content')
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
const naira = (n) => '₦' + Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 2 })

function openPrices(serverId) {
  try { sessionStorage.setItem('ps_server', String(serverId)) } catch (_e) { /* ignore */ }
  nav.querySelector('button[data-section="import"]')?.click()
}

async function render(note) {
  content.innerHTML = '<div class="admin-head"><h2>Servers</h2></div><p class="muted">Loading...</p>'
  const [{ data: servers, error }, { data: st }] = await Promise.all([
    supabase.from('servers').select('*').order('id'),
    supabase.from('price_settings').select('round_to').eq('id', 1).single()
  ])
  if (error) { content.innerHTML = `<div class="admin-head"><h2>Servers</h2></div><p class="error-text">Could not load servers: ${esc(error.message)}</p>`; return }
  const roundTo = Math.max(1, Number(st?.round_to) || 10)
  const counts = await Promise.all((servers || []).map(s =>
    supabase.from('pricing').select('*', { count: 'exact', head: true }).eq('number_type', 'disposable').eq('tier', s.id).then(r => r.count ?? 0)))

  content.innerHTML = `
    <div class="admin-head"><h2>Servers</h2><button id="sv-add" class="btn-secondary" style="background:rgb(var(--accent));color:rgb(var(--accentink))">+ Add server</button></div>
    <p class="muted admin-hint">Every server carries every service you have imported. Buyers choose a service and a country, then pick from the servers that are switched on. On each server, buyer price = provider cost in naira + that server's profit. Leave the profit empty to keep a server without prices.</p>
    <div id="sv-new"></div>
    <div id="sv-list">${(servers || []).map((s, i) => `
      <div class="card" data-id="${s.id}" style="margin-top:12px;padding:14px;${s.is_active ? '' : 'opacity:.7'}">
        <div class="form-row"><label>Server name (buyers see this)</label><input class="sv-name" value="${esc(s.name)}" maxlength="30" /></div>
        <div class="form-row"><label>Your profit (naira, added to the cost)</label>
          <input class="sv-profit" type="number" min="0" step="any" inputmode="decimal" placeholder="empty = no prices yet" value="${esc(s.profit ?? '')}" />
          <p class="muted sv-eg" style="font-size:.85rem;margin-top:4px"></p></div>
        <label style="display:flex;gap:8px;align-items:center;margin:6px 0"><input class="sv-on" type="checkbox" ${s.is_active ? 'checked' : ''} /> Show this server to buyers</label>
        <p class="muted" style="font-size:.85rem;margin:6px 0">${counts[i] ? counts[i].toLocaleString('en-NG') + ' prices on this server' : 'No prices on this server yet'}</p>
        <div class="form-actions">
          <button class="sv-save btn-secondary" style="background:rgb(var(--accent));color:rgb(var(--accentink))">Save</button>
          <button class="sv-prices btn-secondary">Edit prices</button>
          <button class="sv-del btn-secondary" style="color:#e5484d">Delete</button>
        </div>
        <p class="sv-msg" style="margin-top:6px;font-size:.9rem"></p>
      </div>`).join('') || '<div class="card" style="margin-top:12px;padding:14px"><b>No servers yet.</b> <span class="muted">Tap + Add server.</span></div>'}</div>
    <p id="sv-note" style="margin-top:14px">${esc(note || '')}</p>
    <p class="muted" style="margin-top:8px;font-size:.85rem">Prices come from what is already on SwiftPlug (the provider's cost in naira at the dollar rate in Prices &rarr; Pricing rules). A price you type by hand on one server stays as you set it while the others follow the profit.</p>`

  const $ = (q) => content.querySelector(q)
  const egFor = (card) => {
    const raw = card.querySelector('.sv-profit').value
    card.querySelector('.sv-eg').textContent = raw === '' ? '' : `Example: a number that costs you ${naira(600)} sells for ${naira(Math.max(roundTo, Math.ceil((600 + Number(raw)) / roundTo) * roundTo))}.`
  }
  content.querySelectorAll('#sv-list .card').forEach(card => { egFor(card); card.querySelector('.sv-profit').addEventListener('input', () => egFor(card)) })

  async function apply() {
    const { data, error: e } = await supabase.rpc('servers_apply')
    if (e) throw new Error(e.message)
    return Number(data) || 0
  }
  const profitOf = (raw) => (raw === '' ? null : Number(raw))
  const bad = (n, p) => !n.trim() ? 'Give the server a name.' : (p !== null && !(p >= 0)) ? 'Profit must be 0 or more, or empty.' : ''

  $('#sv-add').addEventListener('click', () => {
    $('#sv-new').innerHTML = `<div class="card" style="margin-top:12px;padding:14px">
      <div class="form-row"><label>New server name</label><input id="sv-n-name" maxlength="30" placeholder="e.g. Server 4, Fast, Cheap" /></div>
      <div class="form-row"><label>Your profit (naira)</label><input id="sv-n-profit" type="number" min="0" step="any" inputmode="decimal" placeholder="e.g. 500" /></div>
      <div class="form-actions"><button id="sv-n-save" class="btn-secondary" style="background:rgb(var(--accent));color:rgb(var(--accentink))">Create server</button><button id="sv-n-cancel" class="btn-secondary">Cancel</button></div>
      <p class="error-text hidden" id="sv-n-err"></p></div>`
    $('#sv-n-cancel').addEventListener('click', () => { $('#sv-new').innerHTML = '' })
    $('#sv-n-save').addEventListener('click', async (e) => {
      const name = $('#sv-n-name').value, profit = profitOf($('#sv-n-profit').value), m = bad(name, profit)
      if (m) { $('#sv-n-err').textContent = m; $('#sv-n-err').classList.remove('hidden'); return }
      const b = e.currentTarget; b.disabled = true; b.textContent = 'Creating...'
      try {
        const { error: ie } = await supabase.from('servers').insert({ name: name.trim(), profit })
        if (ie) throw new Error(ie.message)
        const made = profit === null ? 0 : await apply()
        await render(`Server created.${profit === null ? '' : ` ${made.toLocaleString('en-NG')} prices added.`}`)
      } catch (err) { $('#sv-n-err').textContent = err.message; $('#sv-n-err').classList.remove('hidden'); b.disabled = false; b.textContent = 'Create server' }
    })
    $('#sv-n-name').focus()
  })

  content.querySelectorAll('#sv-list .card').forEach(card => {
    const id = card.dataset.id, msg = card.querySelector('.sv-msg')
    card.querySelector('.sv-prices').addEventListener('click', () => openPrices(id))
    card.querySelector('.sv-save').addEventListener('click', async (e) => {
      const name = card.querySelector('.sv-name').value, profit = profitOf(card.querySelector('.sv-profit').value), m = bad(name, profit)
      if (m) { msg.textContent = m; msg.style.color = '#e5484d'; return }
      const b = e.currentTarget; b.disabled = true; b.textContent = 'Saving...'
      try {
        const { error: ue } = await supabase.from('servers').update({ name: name.trim(), profit, is_active: card.querySelector('.sv-on').checked }).eq('id', id)
        if (ue) throw new Error(ue.message)
        const made = await apply()
        await render(`Saved. ${made ? made.toLocaleString('en-NG') + ' new prices added and all prices updated.' : 'All prices updated.'}`)
      } catch (err) { msg.textContent = err.message; msg.style.color = '#e5484d'; b.disabled = false; b.textContent = 'Save' }
    })
    card.querySelector('.sv-del').addEventListener('click', async (e) => {
      if (!confirm('Delete this server? Buyers will stop seeing it. Its prices are hidden, and past orders are not affected.')) return
      const b = e.currentTarget; b.disabled = true
      const { error: de } = await supabase.from('servers').delete().eq('id', id)
      if (de) { msg.textContent = 'Could not delete: ' + de.message; msg.style.color = '#e5484d'; b.disabled = false; return }
      await render('Server deleted.')
    })
  })
}

const session = await requireAdmin()
if (session) {
  nav.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-section]')
    if (b && b.dataset.section === 'servers') render()
  })
}
