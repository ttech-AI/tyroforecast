// ════════════════════════════════════════════════════════════════
// salesSimulation.js — Senaryo Simülasyon Motoru
// ════════════════════════════════════════════════════════════════
// Pure JS, dependency-free. Bir trader/itemid forecast'ı üzerinde
// "what-if" senaryoları uygular. Tarımsal trade odaklı:
//   • Volume sensitivity (talep ±%X)
//   • Mevsim shift (Ramazan/hasat erken-geç)
//   • Müşteri konsantrasyonu kaybı (top-N müşteri)
//   • Origin disruption (grup şirketi)
//   • Monte Carlo P10/P50/P90 (residual bootstrap)
//   • Target backcast (hedeften geri-projeksiyon)
//
// Tüm fonksiyonlar saf — input forecast'ı mutate etmez, yeni obje döner.

// ─────────── İç yardımcılar ───────────────────────────────────

const sum = arr => arr.reduce((a, b) => a + (b || 0), 0);
const mean = arr => arr.length ? sum(arr) / arr.length : 0;

// Forecast objesini güvenli kopyala
function cloneForecast(fc) {
  if (!fc) return null;
  return {
    point: [...(fc.point || [])],
    lower: [...(fc.lower || [])],
    upper: [...(fc.upper || [])],
    fitted: fc.fitted ? [...fc.fitted] : null,
    params: fc.params ? { ...fc.params } : null,
  };
}

// Negatif değerlere izin verme (volume azalsa bile satış sıfırın altına düşmez)
function nonNegative(v) { return v < 0 ? 0 : v; }

// ════════════════════════════════════════════════════════════════
// 1. simulateVolume — Volume multiplier
// ════════════════════════════════════════════════════════════════
// forecast: {point, lower, upper}
// delta: -0.5 ... +0.5  (örn. 0.25 = +%25)
export function simulateVolume(forecast, delta) {
  if (!forecast || !forecast.point) return forecast;
  const factor = 1 + (Number(delta) || 0);
  return {
    point: forecast.point.map(v => nonNegative(v * factor)),
    lower: forecast.lower.map(v => nonNegative(v * factor)),
    upper: forecast.upper.map(v => nonNegative(v * factor)),
    fitted: forecast.fitted,
    params: { ...(forecast.params || {}), volumeFactor: factor },
  };
}

// ════════════════════════════════════════════════════════════════
// 2. simulateSeasonalShift — Mevsim ay kayması
// ════════════════════════════════════════════════════════════════
// forecast üzerine mevsimsel pattern'i N ay öne (-) veya geri (+) kaydır.
// Yöntem: forecast point'lerini circular shift eder, böylece pikler
// kaydığı yerde belirir. Bu fit.S array'ine ihtiyaç duymaz — sadece
// tahmin point dizisini ay sayısı kadar offset'ler.
// monthShift: -3 ... +3 (negatif = mevsim erkene gelir)
export function simulateSeasonalShift(forecast, monthShift) {
  if (!forecast || !forecast.point || !monthShift) return forecast;
  const n = forecast.point.length;
  const shift = ((Number(monthShift) % n) + n) % n;
  if (shift === 0) return forecast;
  // Circular shift: yeni[i] = orijinal[(i - shift + n) % n]
  // Negatif shift = sola kaydır (mevsim erken gelir)
  const shifted = (arr) => {
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      const srcIdx = (i - monthShift + n * 100) % n;
      out[i] = arr[srcIdx];
    }
    return out;
  };
  return {
    point: shifted(forecast.point),
    lower: shifted(forecast.lower),
    upper: shifted(forecast.upper),
    fitted: forecast.fitted,
    params: { ...(forecast.params || {}), seasonalShift: monthShift },
  };
}

// ════════════════════════════════════════════════════════════════
// 3. simulateCustomerLoss — Müşteri konsantrasyonu kaybı
// ════════════════════════════════════════════════════════════════
// profile.topDestinations: [{id, name, qty, pct}, ...] — kaybedilen müşterilerin
// payı pro-rata düşülür. Pay = topDestinations'taki pct toplamı.
// lostAccountIds: kaybedilen müşteri kod listesi (account id)
// Not: Eski profile şeması `name` alanında ID tutuyordu; geriye uyumluluk için
// id yoksa name'e düşeriz.
export function simulateCustomerLoss(forecast, profile, lostAccountIds) {
  if (!forecast || !forecast.point || !Array.isArray(lostAccountIds) || lostAccountIds.length === 0) return forecast;
  const lost = new Set(lostAccountIds.map(x => String(x).trim()));
  const dests = profile?.topDestinations || [];
  const lostPct = dests
    .filter(d => lost.has(String(d.id ?? d.name ?? '').trim()))
    .reduce((s, d) => s + (d.pct || 0), 0);
  // Pay yüzde değil, oranlık: pct/100
  const lossFraction = Math.min(0.99, lostPct / 100);
  if (lossFraction <= 0) return forecast;
  const factor = 1 - lossFraction;
  return {
    point: forecast.point.map(v => nonNegative(v * factor)),
    lower: forecast.lower.map(v => nonNegative(v * factor)),
    upper: forecast.upper.map(v => nonNegative(v * factor)),
    fitted: forecast.fitted,
    params: { ...(forecast.params || {}), customerLossPct: lostPct, customerFactor: factor },
  };
}

// ════════════════════════════════════════════════════════════════
// 4. simulateOriginLoss — Origin (grup şirketi) kaybı
// ════════════════════════════════════════════════════════════════
// profile.topCompanies: [{id (companyCode), name, qty, pct}]
// lostGroupKeys: kaybedilen şirket kodları (üst harfli)
export function simulateOriginLoss(forecast, profile, lostGroupKeys) {
  if (!forecast || !forecast.point || !Array.isArray(lostGroupKeys) || lostGroupKeys.length === 0) return forecast;
  const lost = new Set(lostGroupKeys.map(x => String(x).toUpperCase().trim()));
  const comps = profile?.topCompanies || [];
  const lostPct = comps
    .filter(c => lost.has(String(c.id ?? c.name ?? '').toUpperCase().trim()))
    .reduce((s, c) => s + (c.pct || 0), 0);
  const lossFraction = Math.min(0.99, lostPct / 100);
  if (lossFraction <= 0) return forecast;
  const factor = 1 - lossFraction;
  return {
    point: forecast.point.map(v => nonNegative(v * factor)),
    lower: forecast.lower.map(v => nonNegative(v * factor)),
    upper: forecast.upper.map(v => nonNegative(v * factor)),
    fitted: forecast.fitted,
    params: { ...(forecast.params || {}), originLossPct: lostPct, originFactor: factor },
  };
}

// ════════════════════════════════════════════════════════════════
// 5. monteCarloIntervals — Wild bootstrap residual MC
// ════════════════════════════════════════════════════════════════
// modelFn: (series, h) → forecast objesi
// series: tarihçesel veri (sayı dizisi)
// h: horizon
// nSim: simülasyon sayısı (default 500)
// Algoritma:
//   1. Modeli orjinal seriye uygula (baseline forecast + fitted)
//   2. Residuals = series - fitted
//   3. nSim defa: residualları wild bootstrap (Rademacher × random)
//      pseudo seri = fitted + bootstrapped residuals
//      modelFn'i bu seri üzerinde tekrar koşturup forecast.point'i topla
//   4. Her ay için P10/P25/P50/P75/P90 quantile
// Return: { p10, p25, p50, p75, p90, paths }
export function monteCarloIntervals(modelFn, series, h, nSim = 500) {
  try {
    if (!modelFn || !series || series.length < 12) {
      return { p10: null, p25: null, p50: null, p75: null, p90: null, paths: [] };
    }
    const baseline = modelFn(series, h);
    if (!baseline?.fitted || !baseline?.point) {
      // Fitted yoksa MC yapamayız — point'ten ±std ile gauss approx
      const point = baseline?.point || [];
      const sd = stdOfArray(series) || 1;
      const out = { p10: [], p25: [], p50: [...point], p75: [], p90: [], paths: [] };
      for (let i = 0; i < point.length; i++) {
        const v = point[i];
        out.p10.push(nonNegative(v - 1.28 * sd * Math.sqrt(i + 1)));
        out.p25.push(nonNegative(v - 0.67 * sd * Math.sqrt(i + 1)));
        out.p75.push(nonNegative(v + 0.67 * sd * Math.sqrt(i + 1)));
        out.p90.push(nonNegative(v + 1.28 * sd * Math.sqrt(i + 1)));
      }
      return out;
    }

    const fitted = baseline.fitted;
    const minLen = Math.min(series.length, fitted.length);
    const residuals = [];
    for (let i = 0; i < minLen; i++) {
      const r = series[i] - (fitted[i] ?? series[i]);
      if (Number.isFinite(r)) residuals.push(r);
    }
    if (residuals.length < 6) {
      return { p10: null, p25: null, p50: baseline.point, p75: null, p90: null, paths: [] };
    }

    // nSim path
    const paths = [];
    const N = Math.max(50, Math.min(nSim, 1000));
    for (let s = 0; s < N; s++) {
      const pseudo = new Array(minLen);
      for (let i = 0; i < minLen; i++) {
        const ri = Math.floor(Math.random() * residuals.length);
        const sign = Math.random() < 0.5 ? -1 : 1;  // Rademacher
        pseudo[i] = nonNegative((fitted[i] ?? series[i]) + sign * residuals[ri]);
      }
      try {
        const fc = modelFn(pseudo, h);
        if (fc?.point) paths.push(fc.point.map(nonNegative));
      } catch (_) {}
    }
    if (paths.length < 30) {
      // Çok az başarılı simülasyon → gauss fallback
      const sd = stdOfArray(residuals) || 1;
      const out = { p10: [], p25: [], p50: [...baseline.point], p75: [], p90: [], paths };
      for (let i = 0; i < baseline.point.length; i++) {
        const v = baseline.point[i];
        out.p10.push(nonNegative(v - 1.28 * sd * Math.sqrt(i + 1)));
        out.p25.push(nonNegative(v - 0.67 * sd * Math.sqrt(i + 1)));
        out.p75.push(nonNegative(v + 0.67 * sd * Math.sqrt(i + 1)));
        out.p90.push(nonNegative(v + 1.28 * sd * Math.sqrt(i + 1)));
      }
      return out;
    }
    // Quantile her ay için
    const p10 = [], p25 = [], p50 = [], p75 = [], p90 = [];
    for (let i = 0; i < h; i++) {
      const slice = paths.map(p => p[i]).filter(x => Number.isFinite(x)).sort((a, b) => a - b);
      const q = (frac) => slice[Math.min(slice.length - 1, Math.max(0, Math.floor(slice.length * frac)))];
      p10.push(q(0.10));
      p25.push(q(0.25));
      p50.push(q(0.50));
      p75.push(q(0.75));
      p90.push(q(0.90));
    }
    return { p10, p25, p50, p75, p90, paths };
  } catch (e) {
    console.warn('[MC] failed:', e);
    return { p10: null, p25: null, p50: null, p75: null, p90: null, paths: [] };
  }
}

function stdOfArray(arr) {
  if (!arr || arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1));
}

// ════════════════════════════════════════════════════════════════
// 6. backcastToTarget — Hedeften geri-projeksiyon
// ════════════════════════════════════════════════════════════════
// targetTotal: 12 ay (h ay) sonrası ulaşılması istenen toplam
// Yöntem: mevcut forecast'ın aylık paylarını koru, total'ı targetTotal'a eşitle
//   shape[i] = forecast.point[i] / sum(forecast.point)
//   monthly[i] = shape[i] * targetTotal
// Çıkarım: targetTotal / sum(forecast.point) = ölçek faktörü
// requiredAvgGrowth: targetTotal'a ulaşmak için son 12 ay'a göre %büyüme
export function backcastToTarget(series, fit, targetTotal, h) {
  if (!fit || !targetTotal || !series || series.length < 12) {
    return { monthly: null, requiredAvgGrowth: null, feasibilityScore: null };
  }
  const baseline = fit.results?.find(r => r.id === fit.bestId)?.forecast;
  if (!baseline?.point) return { monthly: null, requiredAvgGrowth: null, feasibilityScore: null };

  const baselineTotal = sum(baseline.point);
  if (baselineTotal <= 0) return { monthly: null, requiredAvgGrowth: null, feasibilityScore: null };

  const factor = targetTotal / baselineTotal;
  const monthly = baseline.point.map(v => nonNegative(v * factor));

  // Son 12 ay aktüel toplamı ile karşılaştır
  const last12 = sum(series.slice(-12));
  const annualizedTarget = targetTotal * (12 / h);
  const requiredAvgGrowth = last12 > 0 ? ((annualizedTarget - last12) / last12) * 100 : null;

  // Feasibility: fizibilite = (target / baseline) — 1.0 civarı kolay, >2.0 agresif
  let feasibilityScore;
  if (factor >= 0.7 && factor <= 1.3) feasibilityScore = 'easy';
  else if (factor >= 0.5 && factor <= 1.6) feasibilityScore = 'moderate';
  else if (factor >= 0.3 && factor <= 2.0) feasibilityScore = 'hard';
  else feasibilityScore = 'unrealistic';

  return { monthly, factor, requiredAvgGrowth, feasibilityScore, baselineTotal, targetTotal };
}

// ════════════════════════════════════════════════════════════════
// 7. applyScenario — Orchestrator
// ════════════════════════════════════════════════════════════════
// Tüm senaryo bileşenlerini sırayla uygular ve toplu sonuç döner.
// scenario: { volumeMult, seasonalShift, lostCustomers, lostOrigins,
//             showMC, targetVolume }
// opts: { runMC: bool, mcModelFn: (series, h) => forecast, mcSeries, mcH, mcNSim }
//
// Sıralama:
//   1. Baseline forecast (orijinal)
//   2. Mevsim shift
//   3. Volume çarpan
//   4. Müşteri kayıp
//   5. Origin kayıp
//   6. Backcast (varsa hedef set)
//   7. Monte Carlo (showMC ise — orijinal seri üzerinde)
export function applyScenario(baselineForecast, fit, profile, scenario, series, h, opts = {}) {
  if (!baselineForecast || !scenario) {
    return { adjustedForecast: baselineForecast, baselineForecast, deltaPct: 0, mcBands: null, components: {} };
  }

  let fc = cloneForecast(baselineForecast);
  const components = {};

  // 1. Mevsim shift (önce)
  if (scenario.seasonalShift && scenario.seasonalShift !== 0) {
    fc = simulateSeasonalShift(fc, scenario.seasonalShift);
    components.seasonal = { shift: scenario.seasonalShift };
  }

  // 2. Volume multiplier
  if (scenario.volumeMult != null && scenario.volumeMult !== 1) {
    const delta = scenario.volumeMult - 1;
    fc = simulateVolume(fc, delta);
    components.volume = { mult: scenario.volumeMult, delta };
  }

  // 3. Müşteri kayıp
  if (Array.isArray(scenario.lostCustomers) && scenario.lostCustomers.length > 0) {
    fc = simulateCustomerLoss(fc, profile, scenario.lostCustomers);
    components.customer = { lost: scenario.lostCustomers, factor: fc.params?.customerFactor };
  }

  // 4. Origin kayıp
  if (Array.isArray(scenario.lostOrigins) && scenario.lostOrigins.length > 0) {
    fc = simulateOriginLoss(fc, profile, scenario.lostOrigins);
    components.origin = { lost: scenario.lostOrigins, factor: fc.params?.originFactor };
  }

  // 5. Backcast (target volume varsa)
  let backcastInfo = null;
  if (scenario.targetVolume && fit && series) {
    backcastInfo = backcastToTarget(series, fit, scenario.targetVolume, h);
    components.backcast = backcastInfo;
  }

  // 6. Monte Carlo (showMC + opts.mcModelFn varsa)
  let mcBands = null;
  if (scenario.showMC && opts.runMC && opts.mcModelFn && opts.mcSeries) {
    mcBands = monteCarloIntervals(opts.mcModelFn, opts.mcSeries, opts.mcH || h, opts.mcNSim || 200);
  }

  // Delta hesapla (toplam üzerinden)
  const baselineTotal = sum(baselineForecast.point);
  const adjustedTotal = sum(fc.point);
  const deltaPct = baselineTotal > 0 ? ((adjustedTotal - baselineTotal) / baselineTotal) * 100 : 0;

  return {
    adjustedForecast: fc,
    baselineForecast,
    deltaPct,
    baselineTotal,
    adjustedTotal,
    mcBands,
    backcastInfo,
    components,
    isActive: Object.keys(components).length > 0 || mcBands != null,
  };
}

// Senaryonun "boş" (baseline) olup olmadığını kontrol et
export function isBaseline(scenario) {
  if (!scenario) return true;
  return (
    (scenario.volumeMult == null || scenario.volumeMult === 1) &&
    (!scenario.seasonalShift || scenario.seasonalShift === 0) &&
    (!Array.isArray(scenario.lostCustomers) || scenario.lostCustomers.length === 0) &&
    (!Array.isArray(scenario.lostOrigins) || scenario.lostOrigins.length === 0) &&
    !scenario.showMC &&
    !scenario.targetVolume
  );
}

// Default boş senaryo
export const DEFAULT_SCENARIO = {
  volumeMult: 1.0,
  seasonalShift: 0,
  lostCustomers: [],
  lostOrigins: [],
  showMC: false,
  targetVolume: null,
};
