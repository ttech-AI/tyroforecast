// ════════════════════════════════════════════════════════════════════════════
// Home Dashboard Snapshot
// ────────────────────────────────────────────────────────────────────────────
// Satış Tahmini sayfasında "Hesapla" çalıştığında forecast sonucundan compact
// bir snapshot localStorage'a yazılır. Anasayfa bu snapshot'u okuyup executive
// dashboard'ı doldurur. Tek bir snapshot tutulur (son hesaplama).
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react'

export const HOME_SNAPSHOT_KEY = 'tyroforecast_home_snapshot_v1'

// ────────────────────────────────────────────────────────────────────────────
// Build snapshot — runForecast'tan toplanan ham veriyi compact format'a indir
// ────────────────────────────────────────────────────────────────────────────
export function buildHomeSnapshot({
  result,           // setFcstResult'a verilen tam obje
  uniqueProducts,
  uniqueCustomers,
  uniqueCompanies,
}) {
  if (!result || !result.profile) return null

  const profile = result.profile
  const fit = result.fitQty
  const bestId = fit?.bestId
  const best = bestId ? fit.results?.find((r) => r.id === bestId) : null
  const bestMape = best?.mape ?? null

  // Forecast aylık dizisi (en fazla 12 ay)
  const fcPoint = best?.forecast?.point || []
  const fcLow = best?.forecast?.lower || []
  const fcUp = best?.forecast?.upper || []

  // Son ay anahtarından sonraki H ay key'lerini üret
  const histKeys = result.series?.keys || []
  const lastHistKey = histKeys[histKeys.length - 1] || ''
  const forecastMonths = []
  if (lastHistKey && fcPoint.length > 0) {
    let cur = lastHistKey
    for (let i = 0; i < fcPoint.length; i++) {
      cur = addMonths(cur, 1)
      forecastMonths.push({
        key: cur,
        qty: fcPoint[i],
        lower: fcLow[i] ?? null,
        upper: fcUp[i] ?? null,
      })
    }
  }
  const forecastTotal = fcPoint.reduce((s, v) => s + (v || 0), 0)

  // Tüm modellerin compact dizisi — Anasayfa chart'ında dropdown seçimi için
  // Her model: { id, mape, skipped, point, lower, upper } — yaklaşık ~300 byte
  const MODEL_LABELS = {
    hw: 'Holt-Winters',
    stl: 'STL+ETS',
    stlOut: 'Outlier STL+ETS',
    theta: 'Theta',
    holtLin: "Holt's Linear",
    snaive: 'Seasonal Naive',
    croston: 'Croston',
    ma3: 'Moving Avg',
  }
  const models = (fit?.results || []).map((r) => ({
    id: r.id,
    label: MODEL_LABELS[r.id] || r.id,
    mape: r.mape ?? null,
    skipped: !!r.skipped,
    point: r.forecast?.point ?? [],
    lower: r.forecast?.lower ?? [],
    upper: r.forecast?.upper ?? [],
  }))

  return {
    version: 1,
    fetchedAt: Date.now(),
    // Trader meta
    traderCode: result.displayCodes?.[0] || result.traderCode || '—',
    traderName: result.displayNames?.[0] || result.displayCodes?.[0] || '—',
    filterScope: result.filterScope || 'trader',
    resolvedSubCount: result.resolvedSubCount || 0,
    subTraderCount: result.subTraders?.length || 0,
    // Üst 4 KPI ham verileri
    recordCount: result.recordCount || 0,
    uniqueCustomers: uniqueCustomers || 0,
    uniqueProducts: uniqueProducts || 0,
    uniqueCompanies: uniqueCompanies || 0,
    // Toplam miktar
    totalQtyAllTime: profile.totals?.qty || 0,
    totalQtyLast12: profile.lastYearTotals?.qty || 0,
    yoy: profile.yoy,
    // Tahmin
    horizon: result.horizon || 12,
    forecastTotal,
    forecastMonths,
    // Model + karakter
    bestModelId: bestId || null,
    bestModelMape: bestMape,
    models,
    intermittenceIndex: profile.intermittenceIndex ?? null,
    character: profile.character || '—',
    // Top breakdown (zaten { id, name, qty, pct }) — Anasayfa kartlarında 3'er göster
    topProducts: (profile.topProducts || []).slice(0, 3),
    topCustomers: (profile.topDestinations || profile.topAccounts || []).slice(0, 3),
    topCompanies: (profile.topCompanies || []).slice(0, 3),
    // Geçmiş veri — chart + seasonal hesaplamaları için son 24 ay
    historyKeys: histKeys.slice(-24),
    historyQty: (result.series?.qty || []).slice(-24),
  }
}

// 'YYYY-MM' formatlı string'e n ay ekle
function addMonths(key, n) {
  const [yStr, mStr] = key.split('-')
  let y = parseInt(yStr, 10)
  let m = parseInt(mStr, 10) - 1 + n
  while (m >= 12) { y++; m -= 12 }
  while (m < 0) { y--; m += 12 }
  return `${y}-${String(m + 1).padStart(2, '0')}`
}

// ────────────────────────────────────────────────────────────────────────────
// Read / write
// ────────────────────────────────────────────────────────────────────────────
export function writeHomeSnapshot(snapshot) {
  if (!snapshot) return
  try {
    localStorage.setItem(HOME_SNAPSHOT_KEY, JSON.stringify(snapshot))
    // Aynı tab içindeki dinleyicilere haber ver (storage event sadece cross-tab)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tyroforecast:snapshot-changed'))
    }
  } catch (_) { /* quota — silent */ }
}

export function readHomeSnapshot() {
  try {
    const raw = localStorage.getItem(HOME_SNAPSHOT_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch (_) {
    return null
  }
}

export function clearHomeSnapshot() {
  try {
    localStorage.removeItem(HOME_SNAPSHOT_KEY)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tyroforecast:snapshot-changed'))
    }
  } catch (_) { /* silent */ }
}

// ────────────────────────────────────────────────────────────────────────────
// React hook — Anasayfa'da snapshot'ı reactive olarak okur.
// Storage event (cross-tab) ve custom event (same-tab) dinler.
// ────────────────────────────────────────────────────────────────────────────
export function useHomeSnapshot() {
  const [snapshot, setSnapshot] = useState(() => readHomeSnapshot())

  useEffect(() => {
    const refresh = () => setSnapshot(readHomeSnapshot())
    const onStorage = (e) => { if (e.key === HOME_SNAPSHOT_KEY) refresh() }
    window.addEventListener('storage', onStorage)
    window.addEventListener('tyroforecast:snapshot-changed', refresh)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('tyroforecast:snapshot-changed', refresh)
    }
  }, [])

  return snapshot
}
