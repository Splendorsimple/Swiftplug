// Floating "Support" button + sheet. Links come from the support_links table (Admin -> Support).
// If there are no active links, nothing is shown. Safe to load on every page.
import './icons.js'

const SVG = {
  chat: '<path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  whatsapp: '<path d="M3 21l1.7-5A8.5 8.5 0 1 1 8 19.3z"/><path d="M9 9c0 3 3 6 6 6l1-2-2-1-1 .8c-1-.5-1.8-1.3-2.3-2.3L11 10l-1-2z"/>',
  telegram: '<path d="M21 4L3 11l6 2 2 6 3-4 5 4z"/><path d="M9 13l8-6"/>',
  email: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 8l9 6 9-6"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>'
}
const icon = (k) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${SVG[k] || SVG.link}</svg>`

// Turns what the admin typed into a safe link. Only https/http/mailto/tel are ever allowed.
function toHref(kind, raw) {
  const v = String(raw || '').trim()
  if (!v) return null
  if (/^(https?:|mailto:|tel:)/i.test(v)) return v
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return null
  if (kind === 'whatsapp') { const d = v.replace(/\D/g, ''); return d ? `https://wa.me/${d}` : null }
  if (kind === 'telegram') { const u = v.replace(/^https?:\/\//i, '').replace(/^t\.me\//i, '').replace(/^@/, ''); return u ? `https://t.me/${u}` : null }
  if (kind === 'email') return v.includes('@') ? `mailto:${v}` : null
  if (kind === 'phone') { const d = v.replace(/[^\d+]/g, ''); return d ? `tel:${d}` : null }
  return /^[\w-]+(\.[\w-]+)+/.test(v) ? `https://${v}` : null
}

const style = document.createElement('style')
style.textContent = `
.sp-fab{position:fixed;right:16px;bottom:18px;z-index:25;display:flex;align-items:center;gap:8px;padding:12px 18px;border:none;border-radius:999px;cursor:pointer;
  background:rgb(var(--accent));color:rgb(var(--accentink));font:700 .9rem 'Space Grotesk',sans-serif;box-shadow:0 10px 28px rgba(0,0,0,.35)}
.sp-fab:active{transform:scale(.97)}
.sp-overlay{position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center;opacity:0;pointer-events:none;transition:opacity .2s}
.sp-overlay.open{opacity:1;pointer-events:auto}
.sp-sheet{width:100%;max-width:480px;background:rgb(var(--surface));color:rgb(var(--fg));border:1px solid rgba(var(--line),.1);border-radius:26px 26px 0 0;
  padding:20px 16px calc(20px + env(safe-area-inset-bottom));transform:translateY(24px);transition:transform .2s;max-height:85vh;overflow-y:auto}
.sp-overlay.open .sp-sheet{transform:none}
.sp-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px}
.sp-head h2{margin:0;font-size:1.25rem}
.sp-head p{margin:4px 0 0;font-size:.85rem;color:rgb(var(--muted))}
.sp-close{background:rgb(var(--surface2));border:none;border-radius:50%;width:38px;height:38px;color:rgb(var(--fg));cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.sp-list{display:grid;gap:10px}
.sp-item{display:flex;align-items:center;gap:14px;padding:14px;border-radius:18px;background:rgb(var(--bg));border:1px solid rgba(var(--line),.08);text-decoration:none;color:inherit}
.sp-item:hover,.sp-item:focus-visible{border-color:rgb(var(--accent))}
.sp-ic{width:44px;height:44px;border-radius:14px;background:rgba(var(--accent),.16);color:rgb(var(--highlight));display:flex;align-items:center;justify-content:center;flex-shrink:0}
html:not(.light) .sp-ic{color:rgb(var(--accent))}
.sp-label{font-weight:700;font-size:.95rem}
.sp-note{font-size:.8rem;color:rgb(var(--muted));margin-top:2px}
@media (prefers-reduced-motion:reduce){.sp-overlay,.sp-sheet{transition:none}}`
document.head.appendChild(style)

async function init() {
  let rows = []
  try {
    const { supabase } = await import('./supabaseClient.js')
    const { data, error } = await supabase.from('support_links')
      .select('label,kind,url,note,sort_order').eq('is_active', true).order('sort_order', { ascending: true })
    if (error) return
    rows = data || []
  } catch (e) { return }

  const items = rows.map(r => ({ ...r, href: toHref(r.kind, r.url) })).filter(r => r.href && r.label)
  if (!items.length) return

  const fab = document.createElement('button')
  fab.className = 'sp-fab'
  fab.type = 'button'
  fab.setAttribute('aria-haspopup', 'dialog')
  fab.innerHTML = `${icon('chat')}<span>Support</span>`

  const overlay = document.createElement('div')
  overlay.className = 'sp-overlay'
  overlay.innerHTML = `
    <div class="sp-sheet" role="dialog" aria-modal="true" aria-label="Customer support">
      <div class="sp-head">
        <div><h2>How can we help?</h2><p>Choose how you'd like to reach us.</p></div>
        <button class="sp-close" type="button" aria-label="Close">${icon('x')}</button>
      </div>
      <div class="sp-list"></div>
    </div>`
  const list = overlay.querySelector('.sp-list')
  items.forEach(it => {
    const a = document.createElement('a')
    a.className = 'sp-item'
    a.href = it.href
    if (/^https?:/i.test(it.href)) { a.target = '_blank'; a.rel = 'noopener noreferrer' }
    const ic = document.createElement('span'); ic.className = 'sp-ic'; ic.innerHTML = icon(it.kind)
    const box = document.createElement('div')
    const l = document.createElement('div'); l.className = 'sp-label'; l.textContent = it.label
    box.appendChild(l)
    if (it.note) { const n = document.createElement('div'); n.className = 'sp-note'; n.textContent = it.note; box.appendChild(n) }
    a.append(ic, box)
    list.appendChild(a)
  })

  const open = () => { overlay.classList.add('open'); overlay.querySelector('.sp-close').focus() }
  const close = () => { overlay.classList.remove('open'); fab.focus() }
  fab.addEventListener('click', open)
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close() })
  overlay.querySelector('.sp-close').addEventListener('click', close)
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close() })

  document.body.append(fab, overlay)
}
init()
