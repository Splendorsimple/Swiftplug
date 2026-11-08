// Admin "Pricing rules" card (top of the Prices tab).
// One profit amount per server, added to the provider's cost (converted to naira) for EVERY service and country.
// Buyer price = cost in naira + your profit for that server, rounded up. Prices you set by hand are left alone.
import { supabase } from './supabaseClient.js'
import { SUPABASE_URL } from './config.js'

// Messages: use the site's toast and confirm sheet (ui.js), or the browser's plain boxes if ui.js is missing.
const ask = (m, o) => (window.spUI ? window.spUI.confirm(m, o) : Promise.resolve(window.confirm(m)))
const tell = (m, kind = 'error') => (window.spUI ? window.spUI.toast(m, kind) : window.alert(m))

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
const naira = (n) => '₦' + Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 2 })

function ago(iso) {
  if (!iso) return 'never'
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return m + ' min ago'
  const h = Math.round(m / 60)
  return h < 48 ? h + ' h ago' : Math.round(h / 24) + ' days ago'
}

export async function mountRules(root, onChange, note) {
  root.innerHTML = '<div class="card" style="margin-top:12px"><p class="muted">Loading pricing rules...</p></div>'
  const { data: s, error } = await supabase.from('price_settings').select('*').eq('id', 1).single()
  if (error || !s) { root.innerHTML = `<div class="card"><p class="error-text">Could not load pricing rules: ${esc(error?.message || 'not found')}</p></div>`; return }
  const rate = s.rate_mode === 'manual' ? s.manual_rate : s.auto_rate
  const val = (v) => (v === null || v === undefined ? '' : v)

  root.innerHTML = `
    <div class="card" style="margin-top:12px">
      <h2 style="font-size:1.1rem;margin-bottom:4px">Pricing rules</h2>
      <p class="muted admin-hint">Buyer price = provider cost in naira + that server's profit. It applies to every service and country at once, and updates by itself when the provider's cost or the dollar rate changes.</p>

      <div class="form-row"><label>Dollar rate (naira per $1)</label>
        <p id="pr-rate" style="margin:2px 0"><b>${rate ? naira(rate) : 'not set yet'}</b> <span class="muted">${s.rate_mode === 'manual' ? '(your own rate)' : '(automatic, checked ' + esc(ago(s.rate_updated_at)) + ')'}</span></p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <select id="pr-mode"><option value="auto" ${s.rate_mode === 'auto' ? 'selected' : ''}>Automatic</option><option value="manual" ${s.rate_mode === 'manual' ? 'selected' : ''}>My own</option></select>
          <input id="pr-manual" type="number" min="1" step="any" inputmode="decimal" placeholder="e.g. 1500" value="${esc(val(s.manual_rate))}" />
        </div>
        <button id="pr-refresh" class="btn-secondary" style="margin-top:8px">Refresh rate now</button>
      </div>

      <p class="muted admin-hint">Your profit for each server is set in the <b>Servers</b> tab.</p>

      <div class="form-row"><label>Round buyer prices up to the nearest</label>
        <input id="pr-round" type="number" min="1" step="1" inputmode="numeric" value="${esc(s.round_to)}" /></div>

      <label style="display:flex;gap:8px;align-items:center;margin:8px 0"><input id="pr-locked" type="checkbox" /> Also change prices I typed by hand</label>
      <button id="pr-save" class="btn-secondary" style="background:rgb(var(--accent));color:rgb(var(--accentink));width:100%">Save and update all prices</button>
      <p id="pr-msg" style="margin-top:8px"></p>
    </div>`

  const $ = (q) => root.querySelector(q)
  if (note) $('#pr-msg').textContent = note
  async function call(body) {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${SUPABASE_URL}/functions/v1/set-pricing`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body)
    })
    const out = await res.json()
    if (!res.ok) throw new Error(out.error || 'Could not save')
    return out
  }
  const say = (t, bad) => { const m = $('#pr-msg'); m.textContent = t; m.style.color = bad ? '#e5484d' : 'inherit' }

  $('#pr-refresh').addEventListener('click', async (e) => {
    const b = e.currentTarget; b.disabled = true; b.textContent = 'Checking...'
    try { const r = await call({ refresh_rate: true }); await mountRules(root, onChange, `Rate is now ${naira(r.rate)} per $1. Updated ${r.repriced} prices.`); onChange?.() }
    catch (err) { say(err.message, true); b.disabled = false; b.textContent = 'Refresh rate now' }
  })
  $('#pr-save').addEventListener('click', async (e) => {
    const b = e.currentTarget
    const body = { rate_mode: $('#pr-mode').value, manual_rate: $('#pr-manual').value, round_to: $('#pr-round').value, include_locked: $('#pr-locked').checked }
    if (body.include_locked && !(await ask('This will replace the prices you typed by hand with cost + profit. Continue?', { title: 'Replace your own prices?', confirmText: 'Replace them', danger: true }))) return
    b.disabled = true; b.textContent = 'Updating...'
    try {
      const r = await call(body)
      await mountRules(root, onChange, `Saved. Updated ${r.repriced} prices.${r.your_own_prices && !body.include_locked ? ` ${r.your_own_prices} of your hand-set prices were left alone.` : ''}`); onChange?.()
    } catch (err) { say(err.message, true); b.disabled = false; b.textContent = 'Save and update all prices' }
  })
}
