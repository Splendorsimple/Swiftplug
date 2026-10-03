import { supabase } from './supabaseClient.js'

// Attaches a searchable country picker to a text input. Matches by name OR phone code.
// onSelect(country) fires when the user picks a result.
export function attachCountryAutocomplete(inputEl, resultsBoxEl, onSelect) {
  let selected = null
  let debounceTimer = null

  inputEl.addEventListener('input', () => {
    selected = null
    const q = inputEl.value.trim()
    clearTimeout(debounceTimer)
    if (!q) { resultsBoxEl.innerHTML = ''; resultsBoxEl.classList.add('hidden'); return }
    debounceTimer = setTimeout(async () => {
      const { data } = await supabase
        .from('countries')
        .select('id, name, iso_code, phone_code, flag_emoji')
        .or(`name.ilike.%${q}%,phone_code.ilike.%${q}%`)
        .order('name')
        .limit(8)
      renderResults(data || [])
    }, 200)
  })

  function renderResults(list) {
    if (!list.length) { resultsBoxEl.innerHTML = ''; resultsBoxEl.classList.add('hidden'); return }
    resultsBoxEl.classList.remove('hidden')
    resultsBoxEl.innerHTML = list.map(c => `
      <button type="button" class="country-result" data-id="${c.id}" data-name="${c.name}"
        data-flag="${c.flag_emoji || ''}" data-phone="${c.phone_code}"
        style="display:flex;width:100%;align-items:center;gap:8px;padding:10px 12px;background:none;border:none;cursor:pointer;color:rgb(var(--fg));text-align:left">
        <span>${c.flag_emoji || ''}</span><span>${c.name}</span>
        <span class="muted" style="margin-left:auto">${c.phone_code}</span>
      </button>
    `).join('')

    resultsBoxEl.querySelectorAll('.country-result').forEach(btn => {
      btn.addEventListener('click', () => {
        selected = {
          id: btn.dataset.id,
          name: btn.dataset.name,
          flag_emoji: btn.dataset.flag,
          phone_code: btn.dataset.phone
        }
        inputEl.value = `${selected.flag_emoji} ${selected.name} (${selected.phone_code})`
        resultsBoxEl.innerHTML = ''
        resultsBoxEl.classList.add('hidden')
        onSelect(selected)
      })
    })
  }

  document.addEventListener('click', (e) => {
    if (!inputEl.contains(e.target) && !resultsBoxEl.contains(e.target)) {
      resultsBoxEl.classList.add('hidden')
    }
  })

  return {
    reset() { selected = null; inputEl.value = ''; resultsBoxEl.innerHTML = '' },
    getSelected: () => selected
  }
}
