import { supabase } from './supabaseClient.js'
import { SUPABASE_URL } from './config.js'

// Renders one rented number as a card: countdown timer (disposable) + live inbox.
// Real numbers also show a call log, since Twilio writes incoming calls to the `calls` table.
// Returns the DOM element. Cleans itself up (stops timers/subscriptions) via el._cleanup().
export function createNumberCard(number, onExpired) {
  const el = document.createElement('div')
  el.className = 'card number-card'
  el.innerHTML = `
    <div class="head">
      <span class="mono" style="font-weight:700">${number.phone_number}</span>
      <span class="timer mono" id="timer-${number.id}"></span>
    </div>
    <div class="inbox" id="inbox-${number.id}">
      <p class="muted" style="font-size:.9rem">Waiting for messages...</p>
    </div>
    ${number.number_type === 'real' ? `
      <div>
        <p class="muted" style="font-size:.75rem;margin:8px 0 4px">CALL LOG</p>
        <div class="inbox" id="calls-${number.id}" style="max-height:120px">
          <p class="muted" style="font-size:.85rem">No calls yet.</p>
        </div>
      </div>
    ` : ''}
  `

  const inboxEl = el.querySelector(`#inbox-${number.id}`)
  const timerEl = el.querySelector(`#timer-${number.id}`)
  const callsEl = el.querySelector(`#calls-${number.id}`)
  let messages = []
  let tickInterval = null
  let pollInterval = null

  async function loadMessages() {
    const { data } = await supabase.from('messages').select('*').eq('number_id', number.id).order('received_at', { ascending: true })
    messages = data || []
    renderMessages()
  }

  function renderMessages() {
    if (!messages.length) { inboxEl.innerHTML = '<p class="muted" style="font-size:.9rem">Waiting for messages...</p>'; return }
    inboxEl.innerHTML = messages.map(m => `
      <div class="message-bubble"><div class="from">${m.from_number || ''}</div><div>${m.body || ''}</div></div>
    `).join('')
  }

  // Realtime: new DB rows appear instantly without the browser polling the provider directly.
  const channel = supabase.channel(`messages-${number.id}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `number_id=eq.${number.id}` },
      (payload) => { messages.push(payload.new); renderMessages() })
    .subscribe()

  // Real numbers: load + live-subscribe to the call log too (written by the twilio-inbound function).
  let callsChannel = null
  if (number.number_type === 'real' && callsEl) {
    async function loadCalls() {
      const { data } = await supabase.from('calls').select('*').eq('number_id', number.id).order('received_at', { ascending: false })
      renderCalls(data || [])
    }
    function renderCalls(calls) {
      if (!calls.length) { callsEl.innerHTML = '<p class="muted" style="font-size:.85rem">No calls yet.</p>'; return }
      callsEl.innerHTML = calls.map(c => `
        <div class="message-bubble">
          <div class="from">${c.from_number || 'Unknown'}</div>
          <div>${c.duration_seconds ? c.duration_seconds + 's' : 'Missed/no answer'} — ${new Date(c.received_at).toLocaleString()}</div>
        </div>
      `).join('')
    }
    callsChannel = supabase.channel(`calls-${number.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls', filter: `number_id=eq.${number.id}` },
        () => loadCalls())
      .subscribe()
    loadCalls()
  }

  // Disposable numbers: ask the server (poll-sms Edge Function) to check the provider every 5s.
  if (number.number_type === 'disposable' && number.status === 'active') {
    async function poll() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      fetch(`${SUPABASE_URL}/functions/v1/poll-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ number_id: number.id })
      }).catch(() => {})
    }
    poll()
    pollInterval = setInterval(poll, 5000)
  }

  if (number.expires_at) {
    function tick() {
      const diff = Math.floor((new Date(number.expires_at) - new Date()) / 1000)
      const mm = Math.floor(Math.max(0, diff) / 60)
      const ss = Math.max(0, diff) % 60
      timerEl.textContent = `${mm}:${String(ss).padStart(2, '0')}`
      timerEl.classList.toggle('low', diff < 60)
      if (diff <= 0) { clearInterval(tickInterval); onExpired && onExpired() }
    }
    tick()
    tickInterval = setInterval(tick, 1000)
  }

  loadMessages()

  el._cleanup = () => {
    clearInterval(tickInterval)
    clearInterval(pollInterval)
    supabase.removeChannel(channel)
    if (callsChannel) supabase.removeChannel(callsChannel)
  }

  return el
}
