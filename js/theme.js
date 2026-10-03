// Dark is default. Adds/removes the "light" class on <html>. Choice is remembered.
export function initTheme() {
  const saved = localStorage.getItem('swiftplug-theme') || 'dark'
  document.documentElement.classList.toggle('light', saved === 'light')
}

export function toggleTheme() {
  const isLight = document.documentElement.classList.toggle('light')
  localStorage.setItem('swiftplug-theme', isLight ? 'light' : 'dark')
  const btn = document.getElementById('theme-toggle-btn')
  if (btn) btn.textContent = isLight ? '🌙' : '☀️'
}

export function themeButtonLabel() {
  return document.documentElement.classList.contains('light') ? '🌙' : '☀️'
}
