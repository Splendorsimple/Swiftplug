// Sign-in and sign-up extras: show/hide password. Safe to fail: the forms work without it.
document.querySelectorAll('.pw-eye').forEach((b) => {
  const input = document.getElementById(b.dataset.for)
  if (!input) return
  b.addEventListener('click', () => {
    const show = input.type === 'password'
    input.type = show ? 'text' : 'password'
    b.setAttribute('aria-label', show ? 'Hide password' : 'Show password')
    b.classList.toggle('on', show)
  })
})
