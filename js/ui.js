// Site-wide messages: small toast notices and a confirm sheet.
// They replace the browser's plain alert() and confirm() boxes. Loaded by nav.js on every page and
// exposed as window.spUI so other files can use it without importing it (they fall back to the
// browser boxes if this file is ever missing). Styles are injected here, so there is no CSS to paste.
// Also: the floating support button slides away while you scroll down, and comes back when you scroll up.

const CSS = `
.sp-toasts{position:fixed;left:50%;transform:translateX(-50%);top:calc(78px + env(safe-area-inset-top));z-index:400;display:grid;gap:8px;width:min(92vw,420px);pointer-events:none}
.sp-toast{pointer-events:auto;display:flex;align-items:flex-start;gap:12px;padding:13px 14px;border-radius:16px;background:rgb(var(--surface));color:rgb(var(--fg));
  border:1px solid rgba(var(--line),.14);box-shadow:0 14px 34px rgba(0,0,0,.32);font-size:.92rem;line-height:1.4;cursor:pointer;animation:sp-in .22s ease both;overflow-wrap:anywhere}
html:not(.light) .sp-toast{background:rgb(var(--surface2))}
.sp-toast.out{animation:sp-out .2s ease both}
.sp-dot{flex:0 0 auto;width:22px;height:22px;margin-top:1px;border-radius:50%;display:grid;place-items:center;font-size:.8rem;font-weight:800;background:rgba(var(--line),.16);color:rgb(var(--fg))}
.sp-toast.error .sp-dot{background:rgba(239,68,68,.18);color:#ef4444}
.sp-toast.success .sp-dot{background:rgb(var(--accent));color:rgb(var(--accentink))}
.sp-toast.error{border-color:rgba(239,68,68,.45)}
.sp-toast.success{border-color:rgba(var(--accent),.55)}
.sp-ov{position:fixed;inset:0;z-index:500;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center;animation:sp-fade .18s ease both}
.sp-sheet{width:100%;max-width:460px;background:rgb(var(--surface));color:rgb(var(--fg));border:1px solid rgba(var(--line),.14);border-bottom:0;
  border-radius:24px 24px 0 0;padding:22px 20px calc(20px + env(safe-area-inset-bottom));box-shadow:0 -12px 40px rgba(0,0,0,.35);animation:sp-up .24s cubic-bezier(.2,.8,.2,1) both}
html:not(.light) .sp-sheet{background:rgb(var(--surface2))}
.sp-grab{width:42px;height:4px;border-radius:4px;background:rgba(var(--line),.25);margin:-8px auto 16px}
.sp-sheet h3{margin:0 0 8px;font-size:1.15rem}
.sp-sheet p{margin:0 0 20px;color:rgb(var(--muted));font-size:.95rem;line-height:1.5;white-space:pre-line;overflow-wrap:anywhere}
.sp-btns{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.sp-btns button{min-height:50px;border-radius:14px;font:inherit;font-weight:700;font-size:1rem;cursor:pointer;border:1px solid rgba(var(--line),.16);background:transparent;color:rgb(var(--fg))}
.sp-btns .sp-ok{background:rgb(var(--accent));color:rgb(var(--accentink));border-color:transparent}
.sp-btns .sp-ok.danger{background:#ef4444;color:#fff}
.sp-btns button:focus-visible{outline:2px solid rgb(var(--accent));outline-offset:2px}
@media(min-width:600px){.sp-ov{align-items:center}.sp-sheet{border-radius:24px;border-bottom:1px solid rgba(var(--line),.14);animation:sp-in .22s ease both}.sp-grab{display:none}}
.sp-fab{transition:transform .25s ease,opacity .25s ease !important}
body.sp-away .sp-fab{transform:translateY(150px);opacity:0;pointer-events:none}
@keyframes sp-in{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
@keyframes sp-out{to{opacity:0;transform:translateY(-8px)}}
@keyframes sp-fade{from{opacity:0}to{opacity:1}}
@keyframes sp-up{from{transform:translateY(100%)}to{transform:none}}
@media (prefers-reduced-motion:reduce){.sp-toast,.sp-ov,.sp-sheet{animation:none}}
`

function ensureStyle() {
  if (document.getElementById('sp-ui-style')) return
  const st = document.createElement('style'); st.id = 'sp-ui-style'; st.textContent = CSS
  document.head.appendChild(st)
}

let toastBox = null
export function toast(message, kind = 'info', ms) {
  ensureStyle()
  if (!toastBox || !document.body.contains(toastBox)) {
    toastBox = document.createElement('div'); toastBox.className = 'sp-toasts'
    toastBox.setAttribute('role', 'status'); toastBox.setAttribute('aria-live', 'polite')
    document.body.appendChild(toastBox)
  }
  const t = document.createElement('div')
  t.className = 'sp-toast ' + kind
  const dot = document.createElement('span'); dot.className = 'sp-dot'
  dot.textContent = kind === 'error' ? '!' : kind === 'success' ? '✓' : 'i'
  const txt = document.createElement('span'); txt.textContent = String(message ?? '')
  t.append(dot, txt)
  const remove = () => { if (!t.isConnected) return; t.classList.add('out'); setTimeout(() => t.remove(), 200) }
  t.addEventListener('click', remove)
  while (toastBox.children.length >= 3) toastBox.firstChild.remove()
  toastBox.appendChild(t)
  setTimeout(remove, ms || (kind === 'error' ? 6500 : 4200))
}

export function confirmSheet(message, opts = {}) {
  ensureStyle()
  return new Promise((resolve) => {
    const prevFocus = document.activeElement
    const ov = document.createElement('div'); ov.className = 'sp-ov'
    const sheet = document.createElement('div'); sheet.className = 'sp-sheet'
    sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true')
    const grab = document.createElement('div'); grab.className = 'sp-grab'
    const h = document.createElement('h3'); h.id = 'sp-sheet-title'; h.textContent = opts.title || 'Please confirm'
    sheet.setAttribute('aria-labelledby', 'sp-sheet-title')
    const p = document.createElement('p'); p.textContent = String(message ?? '')
    const row = document.createElement('div'); row.className = 'sp-btns'
    const no = document.createElement('button'); no.type = 'button'; no.textContent = opts.cancelText || 'Cancel'
    const ok = document.createElement('button'); ok.type = 'button'; ok.className = 'sp-ok' + (opts.danger ? ' danger' : ''); ok.textContent = opts.confirmText || 'Yes, continue'
    row.append(no, ok); sheet.append(grab, h, p, row); ov.appendChild(sheet)
    document.body.appendChild(ov)
    const prevOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'
    const done = (v) => {
      document.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = prevOverflow
      ov.remove()
      try { prevFocus && prevFocus.focus && prevFocus.focus() } catch (_e) { /* ignore */ }
      resolve(v)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); done(false) }
      else if (e.key === 'Tab') { // keep focus inside the sheet
        const f = [no, ok], i = f.indexOf(document.activeElement)
        e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    ov.addEventListener('click', (e) => { if (e.target === ov) done(false) })
    no.addEventListener('click', () => done(false))
    ok.addEventListener('click', () => done(true))
    ok.focus()
  })
}

window.spUI = { toast, confirm: confirmSheet }

// Support button: slide away while scrolling down, back on scroll up.
ensureStyle()
let lastY = window.scrollY
window.addEventListener('scroll', () => {
  const y = window.scrollY
  if (Math.abs(y - lastY) < 10) return
  document.body.classList.toggle('sp-away', y > lastY && y > 140)
  lastY = y
}, { passive: true })
                               
