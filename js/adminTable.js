import { supabase } from './supabaseClient.js'

// Messages: use the site's toast and confirm sheet (ui.js), or the browser's plain boxes if ui.js is missing.
const ask = (m, o) => (window.spUI ? window.spUI.confirm(m, o) : Promise.resolve(window.confirm(m)))
const tell = (m, kind = 'error') => (window.spUI ? window.spUI.toast(m, kind) : window.alert(m))

// Generic CRUD renderer for simple admin tables (providers, services, discounts, support links).
// This is what makes "customize everything from admin" possible without a bespoke
// page per data type. containerEl gets fully replaced with a form + table.
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))

export function renderAdminTable(containerEl, { table, title, columns, hint }) {
  let rows = []
  let editingId = null
  let adding = false
  let form = {}
  let loadError = ''

  async function load() {
    const { data, error } = await supabase.from(table).select('*').order('id', { ascending: false })
    if (error) { loadError = error.message; rows = [] } else { loadError = ''; rows = data || [] }
    draw()
  }

  function startAdd() {
    form = {}
    columns.forEach(c => form[c.key] = c.type === 'boolean' ? true : '')
    adding = true; editingId = null
    draw()
  }
  function startEdit(row) { form = { ...row }; editingId = row.id; adding = false; draw() }
  function cancel() { adding = false; editingId = null; draw() }

  async function save() {
    const payload = { ...form }
    delete payload.id; delete payload.created_at
    const { error } = adding ? await supabase.from(table).insert(payload) : await supabase.from(table).update(payload).eq('id', editingId)
    if (error) { tell(error.message); return }
    adding = false; editingId = null
    load()
  }

  async function remove(id) {
    if (!(await ask('Delete this row?', { title: 'Delete', confirmText: 'Delete', danger: true }))) return
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) tell(error.message); else load()
  }

  function fieldHtml(col) {
    const val = form[col.key]
    if (col.type === 'boolean') return `<input type="checkbox" data-key="${col.key}" ${val ? 'checked' : ''} />`
    if (col.type === 'select') {
      return `<select data-key="${col.key}"><option value="">--</option>${col.options.map(o => `<option value="${esc(o)}" ${val === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`
    }
    return `<input type="${col.type === 'number' ? 'number' : 'text'}" data-key="${col.key}" value="${esc(val)}" />`
  }

  function cellHtml(col, row) {
    const v = row[col.key]
    if (col.type === 'boolean') return `<input type="checkbox" data-live="${esc(col.key)}" data-rid="${esc(row.id)}" aria-label="${esc(col.label)}" ${v ? 'checked' : ''} />`
    if (col.mask && v) return '<span class="mono">\u2022\u2022\u2022\u2022\u2022\u2022 ' + esc(String(v).slice(-4)) + '</span>'
    return esc(v)
  }

  function draw() {
    containerEl.innerHTML = `
      <div class="admin-head">
        <h2>${esc(title)}</h2>
        <button class="pill-btn" id="add-btn">+ Add</button>
      </div>
      ${hint ? `<p class="muted admin-hint">${esc(hint)}</p>` : ''}
      ${loadError ? `<p class="error-text">Could not load this list: ${esc(loadError)}</p>` : ''}
      ${(adding || editingId) ? `
        <div class="card admin-form" id="form-card">
          ${columns.map(c => `<div class="form-row"><label>${esc(c.label)}</label>${fieldHtml(c)}</div>`).join('')}
          <div class="form-actions"><button class="btn-secondary" id="save-btn" style="background:rgb(var(--accent));color:rgb(var(--accentink))">Save</button><button class="btn-secondary" id="cancel-btn">Cancel</button></div>
        </div>
      ` : ''}
      ${rows.length ? `
      <table>
        <thead><tr>${columns.map(c => `<th>${esc(c.label)}</th>`).join('')}<th></th></tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>${columns.map(c => `<td data-label="${esc(c.label)}">${cellHtml(c, r)}</td>`).join('')}
              <td class="row-actions">
                <button class="edit" data-edit="${r.id}">Edit</button>
                <button class="delete" data-del="${r.id}">Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>` : (loadError ? '' : '<div class="empty">Nothing here yet. Tap <strong>+ Add</strong> to create the first one.</div>')}
    `

    containerEl.querySelector('#add-btn').addEventListener('click', startAdd)
    const formCard = containerEl.querySelector('#form-card')
    if (formCard) {
      formCard.querySelectorAll('[data-key]').forEach(input => {
        const sync = () => { form[input.dataset.key] = input.type === 'checkbox' ? input.checked : input.value }
        input.addEventListener('input', sync)
        input.addEventListener('change', sync)
      })
      containerEl.querySelector('#save-btn').addEventListener('click', save)
      containerEl.querySelector('#cancel-btn').addEventListener('click', cancel)
    }
    containerEl.querySelectorAll('input[data-live]').forEach(chk => chk.addEventListener('change', async () => {
      const key = chk.dataset.live, id = chk.dataset.rid, want = chk.checked
      chk.disabled = true
      const { error } = await supabase.from(table).update({ [key]: want }).eq('id', id)
      chk.disabled = false
      if (error) { chk.checked = !want; tell(error.message); return }
      const row = rows.find(r => String(r.id) === id); if (row) row[key] = want
    }))
    containerEl.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => startEdit(rows.find(r => String(r.id) === b.dataset.edit))))
    containerEl.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => remove(b.dataset.del)))
  }

  load()
}
