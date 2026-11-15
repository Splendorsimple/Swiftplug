import { supabase } from './supabaseClient.js'
import { renderNavbar } from './nav.js'
import { requireAuth } from './authGuards.js'
import { toggleTheme } from './theme.js'
import { AVATARS, avatarOf, displayName } from './avatars.js'

const ask = (m, o) => (window.spUI ? window.spUI.confirm(m, o) : Promise.resolve(window.confirm(m)))
const tell = (m, kind = 'error') => (window.spUI ? window.spUI.toast(m, kind) : window.alert(m))
const $ = (id) => document.getElementById(id)

renderNavbar()
const session = await requireAuth()
if (session) init(session.user)

function init(user) {
  const meta = user.user_metadata || {}
  let chosen = meta.avatar || ''

  const drawHero = () => {
    const nm = ($('pf-fullname').value || '').trim() || displayName(user)
    const a = avatarOf({ avatar: chosen }, (nm[0] || 'U').toUpperCase())
    const el = $('pf-av'); el.textContent = a.text; el.setAttribute('style', a.style)
    $('pf-name').textContent = nm
  }
  const drawAvs = () => {
    const initial = (displayName(user)[0] || 'U').toUpperCase()
    $('pf-avs').innerHTML = `<button type="button" class="pf-avb${chosen ? '' : ' on'}" data-k="" aria-label="Use my initial"><b>${initial}</b></button>` +
      AVATARS.map(a => `<button type="button" class="pf-avb${chosen === a.k ? ' on' : ''}" data-k="${a.k}" style="background:linear-gradient(145deg,${a.a},${a.b})" aria-label="Picture ${a.k}">${a.e}</button>`).join('')
  }

  $('pf-fullname').value = meta.full_name || ''
  $('pf-phone').value = meta.phone || ''
  $('pf-email').value = user.email || ''
  $('pf-mail').textContent = user.email || ''
  $('pf-joined').textContent = 'Joined ' + new Date(user.created_at).toLocaleDateString('en-NG', { month: 'short', year: 'numeric' })
  const verified = !!user.email_confirmed_at
  $('pf-ver').textContent = verified ? 'Verified' : 'Not verified'
  $('pf-ver').classList.toggle('ok', verified)
  drawAvs(); drawHero()

  $('pf-avs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-k]'); if (!b) return
    chosen = b.dataset.k; drawAvs(); drawHero()
  })
  $('pf-fullname').addEventListener('input', drawHero)

  // tabs (also ?tab=security in the link)
  const show = (t) => {
    document.querySelectorAll('#pf-tabs button').forEach(b => b.classList.toggle('active', b.dataset.t === t))
    ;['profile', 'security', 'account'].forEach(x => $('tab-' + x).classList.toggle('hidden', x !== t))
  }
  $('pf-tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-t]'); if (b) show(b.dataset.t) })
  const want = new URLSearchParams(location.search).get('tab')
  if (['profile', 'security', 'account'].includes(want)) show(want)

  $('pf-save').addEventListener('click', async (e) => {
    const btn = e.currentTarget
    btn.disabled = true; btn.textContent = 'Saving...'
    const { error } = await supabase.auth.updateUser({ data: { full_name: $('pf-fullname').value.trim(), phone: $('pf-phone').value.trim(), avatar: chosen } })
    btn.disabled = false; btn.textContent = 'Save changes'
    if (error) return tell(error.message || 'Could not save. Try again.')
    tell('Saved.', 'success')
    setTimeout(() => location.reload(), 700)
  })

  $('pf-pw-save').addEventListener('click', async (e) => {
    const btn = e.currentTarget, err = $('pf-pw-err')
    const a = $('pf-pw1').value, b = $('pf-pw2').value
    err.classList.add('hidden')
    const bad = (m) => { err.textContent = m; err.classList.remove('hidden') }
    if (a.length < 8) return bad('Use at least 8 characters.')
    if (a !== b) return bad('The two passwords do not match.')
    btn.disabled = true; btn.textContent = 'Updating...'
    const { error } = await supabase.auth.updateUser({ password: a })
    btn.disabled = false; btn.textContent = 'Update password'
    if (error) return bad(error.message || 'Could not update the password.')
    $('pf-pw1').value = ''; $('pf-pw2').value = ''
    tell('Password updated.', 'success')
  })
  document.querySelectorAll('.pw-eye').forEach(b => b.addEventListener('click', () => {
    const i = $(b.dataset.for); i.type = i.type === 'password' ? 'text' : 'password'
  }))

  $('pf-all').addEventListener('click', async () => {
    if (!(await ask('You will be signed out on every phone and computer, including this one.', { title: 'Sign out everywhere?', confirmText: 'Sign out' }))) return
    await supabase.auth.signOut({ scope: 'global' })
    location.href = 'login.html'
  })
  $('pf-out').addEventListener('click', async () => { await supabase.auth.signOut(); location.href = 'index.html' })
  $('pf-help').addEventListener('click', () => document.querySelector('.sp-fab')?.click())
  const th = $('pf-theme')
  const sync = () => th.classList.toggle('on', document.documentElement.classList.contains('light'))
  sync(); th.addEventListener('click', () => { toggleTheme(); sync() })
      }
    
