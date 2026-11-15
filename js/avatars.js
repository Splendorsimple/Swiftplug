// Profile pictures. Pick one on the Profile page; it is saved on the user's account (no database change needed).
export const AVATARS = [
  { k: 'fox',   e: '\u{1F98A}', a: '#f5a524', b: '#b45309' },
  { k: 'owl',   e: '\u{1F989}', a: '#a78bfa', b: '#5b21b6' },
  { k: 'lion',  e: '\u{1F981}', a: '#fbbf24', b: '#b45309' },
  { k: 'frog',  e: '\u{1F438}', a: '#c6e04b', b: '#1c6b3d' },
  { k: 'panda', e: '\u{1F43C}', a: '#94a3b8', b: '#334155' },
  { k: 'tiger', e: '\u{1F42F}', a: '#fb923c', b: '#9a3412' },
  { k: 'whale', e: '\u{1F433}', a: '#5ec8d6', b: '#155e75' },
  { k: 'bolt',  e: '⚡\uFE0F', a: '#c6e04b', b: '#3f6212' }
]
// Returns what to draw inside an avatar circle: either the emoji + its gradient, or the first letter.
export function avatarOf(meta, initial) {
  const a = AVATARS.find(x => x.k === (meta && meta.avatar))
  return a
    ? { text: a.e, style: `background:linear-gradient(145deg,${a.a},${a.b});color:#fff` }
    : { text: initial || 'U', style: '' }
}
export function displayName(user) {
  const m = (user && user.user_metadata) || {}
  const n = (m.full_name || '').trim()
  if (n) return n
  const raw = ((user && user.email) || 'there').split('@')[0].replace(/[._-]+/g, ' ')
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}
