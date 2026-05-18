// ════════════════════════════════════════════════════════════════════════════
// fcstCache — Satış Tahmini "tutabildiği kadar" cache yönetimi
// ────────────────────────────────────────────────────────────────────────────
// Strateji:
//   1. TTL YOK — kullanıcı isteğiyle eskimemiş gibi tutulur (ileride manuel
//      refresh ile yeni veri çekilebilir)
//   2. LRU eviction: storage quota dolarsa en eski entry'leri sil + retry
//   3. Hard cap: MAX_ENTRIES geçilince en eskiler düşürülür
// ════════════════════════════════════════════════════════════════════════════

const PREFIX = 'tyroforecast_fcst_v4_'
const MAX_ENTRIES = 50          // toplam cache entry üst sınırı (LRU)
const EVICT_BATCH = 5           // her quota hatası durumunda kaç entry düşürülecek
const RETRY_LIMIT = 5           // quota hatası retry sayısı (her seferinde batch atıyoruz)

// ────────────────────────────────────────────────────────────────────────────
// Listele — tüm fcst cache anahtarlarını fetchedAt'e göre eski-yeni sıralar
function listEntries() {
  const out = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (!k || !k.startsWith(PREFIX)) continue
    try {
      const raw = localStorage.getItem(k)
      if (!raw) continue
      const p = JSON.parse(raw)
      out.push({ key: k, fetchedAt: Number(p?.fetchedAt) || 0 })
    } catch (_) {
      // bozuk JSON varsa eski say (sıralamada en başa düşer → ilk düşürülür)
      out.push({ key: k, fetchedAt: 0 })
    }
  }
  out.sort((a, b) => a.fetchedAt - b.fetchedAt)
  return out
}

// En eski N entry'yi sil; toplam silinen sayıyı döner
function evictOldest(count) {
  const entries = listEntries()
  const toRemove = entries.slice(0, count)
  for (const e of toRemove) {
    try { localStorage.removeItem(e.key) } catch (_) {}
  }
  return toRemove.length
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

export function readFcstCache(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw)
  } catch (_) {
    return null
  }
}

export function writeFcstCache(key, payload) {
  const data = JSON.stringify(payload)

  // Önce hard cap'i uygula — toplam entry sayısı limitti aşıyorsa en eskileri kes
  try {
    const entries = listEntries()
    if (entries.length >= MAX_ENTRIES) {
      const excess = entries.length - MAX_ENTRIES + 1  // +1 yeni geleceği için
      evictOldest(excess)
    }
  } catch (_) { /* ignore — eviction best-effort */ }

  // Sonra yazmayı dene; quota hatasında LRU evict + retry
  for (let attempt = 0; attempt < RETRY_LIMIT; attempt++) {
    try {
      localStorage.setItem(key, data)
      return true
    } catch (e) {
      // QuotaExceededError veya DOMException — eski entry'lerden bazılarını at
      const removed = evictOldest(EVICT_BATCH)
      if (removed === 0) {
        // Daha fazla evict edemiyoruz; bu key'in kendisini de devre dışı bırakıp vazgeçelim
        try { localStorage.removeItem(key) } catch (_) {}
        console.warn('[fcstCache] write failed (no more entries to evict)', e)
        return false
      }
    }
  }
  console.warn('[fcstCache] write failed after retries')
  return false
}

export function clearFcstCache() {
  try {
    const keys = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(PREFIX)) keys.push(k)
    }
    for (const k of keys) localStorage.removeItem(k)
  } catch (_) { /* silent */ }
}

// İstemciden istatistik almak için (debug / settings sayfası için faydalı)
export function getFcstCacheStats() {
  const entries = listEntries()
  let totalBytes = 0
  for (const e of entries) {
    try {
      const v = localStorage.getItem(e.key)
      if (v) totalBytes += v.length * 2  // UTF-16 yaklaşık
    } catch (_) {}
  }
  return {
    count: entries.length,
    bytes: totalBytes,
    oldest: entries[0]?.fetchedAt || null,
    newest: entries[entries.length - 1]?.fetchedAt || null,
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Filter state persistence — son seçilen trader / horizon / metric
// ════════════════════════════════════════════════════════════════════════════
const FILTER_STATE_KEY = 'tyroforecast_filter_state_v1'

export function readFilterState() {
  try {
    const raw = localStorage.getItem(FILTER_STATE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch (_) { return null }
}

export function writeFilterState(state) {
  try {
    localStorage.setItem(FILTER_STATE_KEY, JSON.stringify({
      ...state,
      savedAt: Date.now(),
    }))
  } catch (_) { /* silent */ }
}
