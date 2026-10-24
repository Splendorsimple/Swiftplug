import { supabase } from './supabaseClient.js'
import { renderNavbar } from './nav.js'
import { fmt } from './currency.js'
import { sortServices, fillIcon } from './serviceMeta.js'

renderNavbar()

const grid = document.getElementById('home-service-grid')
const emptyMsg = document.getElementById('home-empty')
let list = []

document.querySelectorAll('#home-kind button[data-go]').forEach(b => b.addEventListener('click', () => { window.location.href = b.dataset.go }))

async function loadBalance() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return
  const { data } = await supabase.from('profiles').select('wallet_balance').eq('id', session.user.id).single()
  document.getElementById('home-balance-amt').textContent = fmt(data?.wallet_balance)
  document.getElementById('home-balance').classList.remove('hidden')
}

function draw(items) {
  grid.innerHTML = ''
  emptyMsg.classList.toggle('hidden', items.length > 0)
  items.forEach(s => {
    const a = document.createElement('a')
    a.className = 'service-card'
    a.href = 'dashboard.html?service=' + encodeURIComponent(s.id)
    const ic = document.createElement('span')
    ic.className = 'service-icon'
    fillIcon(ic, s)
    const name = document.createElement('span'); name.style.cssText = 'font-weight:700;font-size:.9rem'; name.textContent = s.name
    const price = document.createElement('span'); price.className = 'muted'; price.style.fontSize = '.8rem'; price.textContent = `from ${fmt(s.min)}`
    const c = document.createElement('span'); c.style.cssText = 'font-size:.75rem;color:rgb(var(--highlight))'; c.textContent = `${s.countries} ${s.countries === 1 ? 'country' : 'countries'}`
    a.append(ic, name, price, c)
    grid.appendChild(a)
  })
}

async function loadServices() {
  grid.innerHTML = Array.from({ length: 6 }, () => '<div class="skeleton-card"></div>').join('')
  try {
    const [{ data: services }, { data: rows }] = await Promise.all([
      supabase.from('services').select('id,name,icon_url').eq('is_active', true),
      supabase.from('catalog').select('service_id,country_id,sell_price').eq('number_type', 'disposable')
    ])
    list = (services || []).map(s => {
      const r = (rows || []).filter(x => x.service_id === s.id)
      return { ...s, min: r.length ? Math.min(...r.map(x => Number(x.sell_price))) : null, countries: new Set(r.map(x => x.country_id)).size }
    }).filter(s => s.min != null)
    list = sortServices(list, () => 1)
    draw(list)
  } catch (e) {
    grid.innerHTML = ''
    emptyMsg.classList.remove('hidden')
  }
}

document.getElementById('home-search').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase()
  draw(list.filter(s => s.name.toLowerCase().includes(q)))
})

loadBalance()
loadServices()
