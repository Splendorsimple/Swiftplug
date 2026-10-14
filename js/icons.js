// Swaps emoji used as icons (they look different on every phone) for clean SVG icons.
// Works on everything on the page, including content added later by other scripts.
const P = {
  '⚡': '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  '🛡': '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  '🌐': '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
  '📥': '<path d="M4 13l2-7h12l2 7v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M4 13h5l1 2h4l1-2h5"/>',
  '📞': '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  '➕': '<path d="M12 5v14M5 12h14"/>',
  '📱': '<rect x="7" y="2" width="10" height="20" rx="3"/><path d="M11 18h2"/>',
  '💳': '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20M6 15h4"/>'
}
const RE = new RegExp('(' + Object.keys(P).join('|') + ')\\uFE0F?', 'g')
const SKIP = 'script,style,textarea,input,select,.theme-toggle,[data-keep-emoji]'

const css = document.createElement('style')
css.textContent = `.ico{display:inline-flex;width:1.2em;height:1.2em;vertical-align:-.22em;flex-shrink:0}
.ico svg{width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.dash-nav button .ico{width:26px;height:26px}`
document.head.appendChild(css)

function iconNode(ch) {
  const s = document.createElement('span')
  s.className = 'ico'
  s.setAttribute('aria-hidden', 'true')
  s.innerHTML = `<svg viewBox="0 0 24 24">${P[ch]}</svg>`
  return s
}

function swapText(node) {
  const text = node.nodeValue
  RE.lastIndex = 0
  if (!RE.test(text)) return
  RE.lastIndex = 0
  const frag = document.createDocumentFragment()
  let last = 0, m
  while ((m = RE.exec(text))) {
    if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)))
    frag.appendChild(iconNode(m[1]))
    last = m.index + m[0].length
  }
  if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)))
  node.replaceWith(frag)
}

function scan(root) {
  if (root.nodeType === 3) { if (!root.parentElement?.closest(SKIP)) swapText(root); return }
  if (root.nodeType !== 1 || root.matches?.(SKIP) || root.closest?.(SKIP)) return
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes = []
  while (walker.nextNode()) nodes.push(walker.currentNode)
  nodes.forEach(n => { if (!n.parentElement?.closest(SKIP)) swapText(n) })
}

scan(document.body)
new MutationObserver((muts) => {
  for (const m of muts) {
    if (m.type === 'characterData') scan(m.target)
    else m.addedNodes.forEach(scan)
  }
}).observe(document.body, { childList: true, subtree: true, characterData: true })
