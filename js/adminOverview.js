// Admin "Overview": the first screen. Today's numbers and a short list of things that need you.
import { supabase } from './supabaseClient.js'
import { requireAdmin } from './authGuards.js'
import { fmt } from './currency.js'

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
const nav = document.getElementById('admin-nav')
const content = document.getElementById('admin-content')

function go(section, view) {
  try { if (view) sessionStorage.setItem('ps_view', view) } catch (_e) { /* ignore */ }
  nav.querySelector(`button[data-section="${section}"]`)?.click()
}

async function render() {
  content.innerHTML = '<div class="admin-head"><h2>Overview</h2></div><p class="muted">Loading...</p>'
  const today = new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const [nums, smm, newUsers, wallets, prices, provs, suspended, failedSmm] = await Promise.all([
    supabase.from('numbers').select('price_paid, status, pricing(sell_price, buy_cost)').gte('created_at', today),
    supabase.from('smm_orders').select('price, refunded').gte('created_at', today),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', today),
    supabase.from('profiles').select('wallet_balance'),
    supabase.from('pricing').select('sell_price, buy_cost, stock, is_active').eq('number_type', 'disposable').range(0, 4999),
    supabase.from('providers').select('name, type, is_active, last_sync_at, last_sync_note').eq('type', 'disposable'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_suspended', true),
    supabase.from('smm_orders').select('*', { count: 'exact', head: true }).eq('status', 'Failed').gte('created_at', weekAgo)
  ])

  let sold = 0, revenue = 0, profit = 0
  for (const r of nums.data || []) {
    if (['cancelled', 'released'].includes(r.status)) continue
    const paid = Number(r.price_paid ?? r.pricing?.sell_price ?? 0)
    sold++; revenue += paid
    if (r.pricing?.buy_cost != null) profit += paid - Number(r.pricing.buy_cost)
  }
  const smmToday = (smm.data || []).reduce((s, o) => s + Math.max(0, Number(o.price || 0) - Number(o.refunded || 0)), 0)
  const held = (wallets.data || []).reduce((s, r) => s + Number(r.wallet_balance || 0), 0)

  const pr = (prices.data || []).filter(p => p.is_active)
  const out = pr.filter(p => p.stock === 0).length
  const low = pr.filter(p => p.stock != null && p.stock > 0 && p.stock <= 10).length
  const nocost = pr.filter(p => p.buy_cost == null).length
  const loss = pr.filter(p => p.buy_cost != null && Number(p.sell_price) < Number(p.buy_cost)).length

  const todo = []
  for (const p of provs.data || []) {
    if (!p.is_active) todo.push({ text: `${p.name} is switched off`, go: 'providers', btn: 'Providers' })
    else if (p.last_sync_note && !/^Checked/.test(p.last_sync_note)) todo.push({ text: `${p.name}: ${p.last_sync_note}`, go: 'providers', btn: 'Providers' })
  }
  if (out) todo.push({ text: `${out} price row${out === 1 ? ' is' : 's are'} out of stock and hidden from buyers`, go: 'import', view: 'out', btn: 'See them' })
  if (low) todo.push({ text: `${low} row${low === 1 ? ' has' : 's have'} 10 numbers or fewer left`, go: 'import', view: 'low', btn: 'See them' })
  if (nocost) todo.push({ text: `${nocost} price row${nocost === 1 ? ' has' : 's have'} no cost from the provider, so the profit rule can't price ${nocost === 1 ? 'it' : 'them'}. Set your own price`, go: 'import', view: 'nocost', btn: 'Set prices' })
  if (loss) todo.push({ text: `${loss} row${loss === 1 ? ' sells' : 's sell'} below your cost`, go: 'import', view: 'loss', btn: 'Fix prices' })
  if (failedSmm.count) todo.push({ text: `${failedSmm.count} Social Boost order${failedSmm.count === 1 ? '' : 's'} failed this week (refunded)`, go: 'smm', btn: 'Open' })
  if (suspended.count) todo.push({ text: `${suspended.count} suspended user${suspended.count === 1 ? '' : 's'}`, go: 'users', btn: 'Users' })

  const card = (label, value) => `<div class="card stat-card"><div class="value">${value}</div><div class="label">${label}</div></div>`
  content.innerHTML = `
    <div class="admin-head"><h2>Overview</h2></div>
    <h3 style="margin:4px 0 8px;font-size:1rem">Today</h3>
    <div class="stat-grid">
      ${card('Numbers sold', sold)}
      ${card('Numbers revenue', fmt(revenue))}
      ${card('Social Boost revenue', fmt(smmToday))}
      ${card('Estimated profit (numbers)', fmt(profit))}
      ${card('New users', newUsers.count ?? 0)}
      ${card('Wallet money held', fmt(held))}
    </div>
    <h3 style="margin:18px 0 8px;font-size:1rem">Needs your attention</h3>
    ${todo.length ? todo.map((t, i) => `<div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px;margin-bottom:8px">
        <span>${esc(t.text)}</span><button class="btn-secondary" data-todo="${i}" style="white-space:nowrap">${esc(t.btn)}</button></div>`).join('')
      : '<div class="card" style="padding:14px"><b>All clear.</b> <span class="muted">Nothing needs you right now.</span></div>'}
    <p class="muted" style="margin-top:14px;font-size:.85rem">Money held in wallets is what you owe your users, so keep enough in your provider and bank to cover it.</p>`
  content.querySelectorAll('[data-todo]').forEach(b => b.addEventListener('click', () => { const t = todo[b.dataset.todo]; go(t.go, t.view) }))
}

const session = await requireAdmin()
if (session) {
  nav.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-section]')
    if (b && b.dataset.section === 'overview') render()
  })
  if (nav.querySelector('button.active')?.dataset.section === 'overview') render()
}
