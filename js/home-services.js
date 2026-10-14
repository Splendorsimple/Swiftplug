// "Popular services" grid on the landing page. Reads services + public catalog prices.
const section = document.getElementById('home-services')
const grid = document.getElementById('home-service-grid')

function skeletons() {
  grid.innerHTML = Array.from({ length: 6 }, () => '<div class="skeleton-card"></div>').join('')
}

async function init() {
  if (!section || !grid) return
  skeletons()
  try {
    const { supabase } = await import('./supabaseClient.js')
    const { fmt } = await import('./currency.js')
    const [{ data: services }, { data: rows }] = await Promise.all([
      supabase.from('services').select('id,name,icon_url').eq('is_active', true),
      supabase.from('catalog').select('service_id,country_id,sell_price').eq('number_type', 'disposable')
    ])
    const list = (services || []).map(s => {
      const r = (rows || []).filter(x => x.service_id === s.id)
      return { ...s, min: r.length ? Math.min(...r.map(x => Number(x.sell_price))) : null, countries: new Set(r.map(x => x.country_id)).size }
    }).filter(s => s.min != null).sort((a, b) => b.countries - a.countries || a.name.localeCompare(b.name)).slice(0, 12)

    if (!list.length) { section.classList.add('hidden'); return }

    grid.innerHTML = ''
    list.forEach(s => {
      const a = document.createElement('a')
      a.className = 'service-card'
      a.href = 'dashboard.html'
      const ic = document.createElement('span')
      ic.className = 'service-icon'
      const letter = (s.name || '?')[0]
      if (s.icon_url) {
        ic.classList.add('has-img')
        const img = document.createElement('img')
        img.alt = ''; img.src = s.icon_url
        img.onerror = () => { ic.classList.remove('has-img'); ic.textContent = letter }
        ic.appendChild(img)
      } else ic.textContent = letter
      const name = document.createElement('span'); name.style.cssText = 'font-weight:700;font-size:.9rem'; name.textContent = s.name
      const price = document.createElement('span'); price.className = 'muted'; price.style.fontSize = '.8rem'; price.textContent = `from ${fmt(s.min)}`
      const c = document.createElement('span'); c.style.cssText = 'font-size:.75rem;color:rgb(var(--highlight))'; c.textContent = `${s.countries} ${s.countries === 1 ? 'country' : 'countries'}`
      a.append(ic, name, price, c)
      grid.appendChild(a)
    })
  } catch (e) {
    section.classList.add('hidden')
  }
}
init()
