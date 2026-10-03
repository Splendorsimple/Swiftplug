import { supabase } from './supabaseClient.js'

// Call at the top of any page that requires login. Redirects to login.html if not signed in.
export async function requireAuth() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) { window.location.href = 'login.html'; return null }
  return session
}

// Call at the top of admin.html. Role check ONLY — never an email check.
export async function requireAdmin() {
  const session = await requireAuth()
  if (!session) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
  if (profile?.role !== 'admin') { window.location.href = 'dashboard.html'; return null }
  return session
}
