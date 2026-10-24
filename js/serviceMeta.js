// Hardcoded logos + display order for services. Order here = order shown (most popular first).
// [match words in the service name, logo name, brand colour]
const BRANDS = [
  [['whatsapp'], 'whatsapp', '25D366'],
  [['tiktok'], 'tiktok', '111111'],
  [['telegram'], 'telegram', '26A5E4'],
  [['instagram'], 'instagram', 'E4405F'],
  [['facebook'], 'facebook', '0866FF'],
  [['google', 'gmail'], 'google', '4285F4'],
  [['twitter', 'x (', 'x/'], 'x', '111111'],
  [['snapchat'], 'snapchat', 'F5B800'],
  [['openai', 'chatgpt'], 'openai', '412991'],
  [['discord'], 'discord', '5865F2'],
  [['microsoft'], 'microsoft', '00A4EF'],
  [['amazon'], 'amazon', 'FF9900'],
  [['uber'], 'uber', '111111'],
  [['netflix'], 'netflix', 'E50914'],
  [['paypal'], 'paypal', '003087'],
  [['binance'], 'binance', 'F0B90B'],
  [['tinder'], 'tinder', 'FF6B6B'],
  [['bumble'], 'bumble', 'F5B800'],
  [['linkedin'], 'linkedin', '0A66C2'],
  [['apple'], 'apple', '111111'],
  [['yahoo'], 'yahoo', '6001D2'],
  [['spotify'], 'spotify', '1DB954'],
  [['steam'], 'steam', '111111'],
  [['viber'], 'viber', '7360F2'],
  [['signal'], 'signal', '3A76F0'],
  [['wechat'], 'wechat', '07C160'],
  [['skype'], 'skype', '00AFF0'],
  [['reddit'], 'reddit', 'FF4500'],
  [['pinterest'], 'pinterest', 'BD081C'],
  [['twitch'], 'twitch', '9146FF'],
  [['ebay'], 'ebay', 'E53238'],
  [['airbnb'], 'airbnb', 'FF5A5F'],
  [['lyft'], 'lyft', 'FF00BF'],
  [['youtube'], 'youtube', 'FF0000'],
  [['github'], 'github', '111111'],
  [['aliexpress'], 'aliexpress', 'E62E04'],
  [['shopify'], 'shopify', '7AB55C'],
  [['vk', 'vkontakte'], 'vk', '0077FF'],
  [['kakao'], 'kakaotalk', 'F5C400']
]

function find(name) {
  const n = (name || '').toLowerCase().trim()
  if (n === 'x') return BRANDS.findIndex(b => b[1] === 'x')
  for (let i = 0; i < BRANDS.length; i++) {
    if (BRANDS[i][0].some(w => n.includes(w))) return i
  }
  return -1
}

export function rank(name) {
  const i = find(name)
  return i === -1 ? 999 : i
}

// Order: services with a price first, then by popularity (list above), then A-Z.
export function sortServices(list, hasPrice) {
  return [...list].sort((a, b) =>
    (hasPrice(b) - hasPrice(a)) || (rank(a.name) - rank(b.name)) || a.name.localeCompare(b.name))
}

// Fills the icon tile. Known brand -> its logo. Otherwise the admin Icon URL, otherwise the first letter.
export function fillIcon(ic, s) {
  const i = find(s.name)
  if (i !== -1) {
    const b = BRANDS[i]
    ic.classList.add('has-img')
    const logo = document.createElement('span')
    const url = `https://cdn.jsdelivr.net/npm/simple-icons@9.21.0/icons/${b[1]}.svg`
    logo.style.cssText = `display:block;width:26px;height:26px;background:#${b[2]};-webkit-mask:url(${url}) center/contain no-repeat;mask:url(${url}) center/contain no-repeat`
    ic.appendChild(logo)
  } else if (s.icon_url) {
    ic.classList.add('has-img')
    const img = document.createElement('img')
    img.alt = ''; img.src = s.icon_url
    img.onerror = () => { img.style.visibility = 'hidden' }
    ic.appendChild(img)
  } else {
    ic.textContent = (s.name || '?')[0]
  }
                                                                             }
