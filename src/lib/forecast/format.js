// ════════════════════════════════════════════════════════════════════════════
// Shared formatlama helper'ları
// ────────────────────────────────────────────────────────────────────────────
// SalesForecastPage'deki yerel fmtTon ile aynı mantık, ortak bir yerden import
// edilebilir. Tüm sayfalarda (Anasayfa dashboard, SalesForecastPage) tutarlı
// görüntü için kullanılır.
// ════════════════════════════════════════════════════════════════════════════

// kg → ton dönüşümlü insan-okur format
// 4.4B kg → "4,4 Milyon Ton" · 1.7B kg → "1,7 Milyon Ton" · 245.000 kg → "245 Ton"
export function fmtTon(kgValue) {
  const t = (Number(kgValue) || 0) / 1000
  if (t >= 1_000_000) return `${(t / 1_000_000).toFixed(1).replace('.', ',')} Milyon Ton`
  if (t >= 1_000) return `${(t / 1_000).toFixed(1).replace('.', ',')} Bin Ton`
  if (t >= 1) return `${Math.round(t).toLocaleString('tr-TR')} Ton`
  return `${Math.round(Number(kgValue) || 0).toLocaleString('tr-TR')} kg`
}

// Saf sayısal değer (binlik ayraç ile)
export function fmtNumber(v) {
  if (v == null || !Number.isFinite(Number(v))) return '—'
  return Number(v).toLocaleString('tr-TR')
}

// Yüzde (sign'lı, default 1 desimal)
export function fmtPct(v, digits = 1) {
  if (v == null || !Number.isFinite(Number(v))) return '—'
  const sign = v > 0 ? '+' : ''
  return `${sign}${Number(v).toFixed(digits)}%`
}

// Yüzde — sign'sız
export function fmtPctRaw(v, digits = 1) {
  if (v == null || !Number.isFinite(Number(v))) return '—'
  return `%${Math.abs(Number(v)).toFixed(digits)}`
}

// Kısa sayı: K / M / B suffix'li (10K, 4.4M, 1.7B)
export function fmtCompact(v) {
  const n = Number(v) || 0
  const abs = Math.abs(n)
  if (abs >= 1e9) return `${(n / 1e9).toFixed(1).replace('.', ',')}B`
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1).replace('.', ',')}M`
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1).replace('.', ',')}K`
  return `${Math.round(n)}`
}

// Göreceli zaman: "3 dakika önce", "2 saat önce"
export function fmtRelativeTime(timestamp) {
  if (!timestamp) return '—'
  const diff = Date.now() - Number(timestamp)
  const min = Math.round(diff / 60000)
  if (min < 1) return 'az önce'
  if (min < 60) return `${min} dakika önce`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr} saat önce`
  const day = Math.round(hr / 24)
  if (day < 7) return `${day} gün önce`
  const d = new Date(Number(timestamp))
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Ay key (YYYY-MM) → "Ock 2027" gibi okunabilir format
const MONTHS_TR_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
const MONTHS_TR_FULL = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

export function fmtMonthKey(key, opts = {}) {
  if (!key) return '—'
  const [y, m] = String(key).split('-').map(Number)
  if (!y || !m) return key
  const names = opts.full ? MONTHS_TR_FULL : MONTHS_TR_SHORT
  return opts.year === false ? names[m - 1] : `${names[m - 1]} ${y}`
}

export { MONTHS_TR_SHORT, MONTHS_TR_FULL }
