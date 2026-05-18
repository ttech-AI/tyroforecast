// ═══════════════════════════════════════════════════════════════
// TYRO STOCK — Satış Tahmini Modülü
// Pure JS, dependency yok. Tarayıcıda 36 aylık seri için <100ms.
//
// Modeller:
//   - Holt-Winters Triple Exponential Smoothing (multiplicative seasonal)
//   - STL+ETS (basit klasik dekompozisyon + ETS extrapolation)
//   - Seasonal Naive
//   - Croston / TSB (intermittent demand)
//   - Moving Average (3 aylık)
// Yardımcılar:
//   - aggregateMonthly, buildTraderProfile, backtestMAPE, selectBestFit
// ═══════════════════════════════════════════════════════════════

// ──────────────── Utility ─────────────────────────────────────

export const sum = a => a.reduce((s, x) => s + x, 0);
const mean = a => (a.length ? sum(a) / a.length : 0);
const std = a => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(sum(a.map(x => (x - m) ** 2)) / (a.length - 1));
};

// 'YYYY-MM' formatlı ay anahtarı, JS Date'ten
function ymKey(date) {
  const d = (date instanceof Date) ? date : new Date(date);
  if (isNaN(d)) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// 'YYYY-MM' → JS Date (UTC, ayın ilk günü)
function keyToDate(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
}

// 'YYYY-MM' anahtarına n ay ekle, yeni anahtar döndür
function addMonths(key, n) {
  const d = keyToDate(key);
  d.setUTCMonth(d.getUTCMonth() + n);
  return ymKey(d);
}

// İki YM key arasındaki ay farkı
function monthsBetween(fromKey, toKey) {
  const a = keyToDate(fromKey), b = keyToDate(toKey);
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
}

// ──────────────── Aggregate ───────────────────────────────────

// Raw historical-sales rows → aylık aggregate map
// rows: [{mserp_quantity, mserp_amountmst, mserp_shipdate, ...}, ...]
// Tutar alanı yoksa value: null
export function aggregateMonthly(rows, opts = {}) {
  const valueField = opts.valueField || null;  // 'mserp_amountmst' vb. veya null
  const dateField = opts.dateField || 'mserp_shipdate';
  const qtyField = opts.qtyField || 'mserp_quantity';

  const m = {};
  for (const r of rows) {
    const key = ymKey(r[dateField]);
    if (!key) continue;
    if (!m[key]) m[key] = { qty: 0, value: 0, count: 0, hasValue: false };
    const q = Number(r[qtyField]) || 0;
    m[key].qty += q;
    m[key].count += 1;
    if (valueField && r[valueField] != null && r[valueField] !== '') {
      m[key].value += Number(r[valueField]) || 0;
      m[key].hasValue = true;
    }
  }
  return m;
}

// Server-side FetchXML aggregate response → aggMap formatı
// monthly: [{ym: 1-12, yy: 2024, qty: number}, ...] beklenen şema
// Dataverse bazen alias'ları farklı isimle veya FormattedValue'lu döndürebilir — esnek parse
export function aggregateFromServer(monthly) {
  const map = {};
  if (!Array.isArray(monthly) || monthly.length === 0) return map;

  // Diagnostic: ilk satırın anahtarlarını logla (tek seferlik debug)
  if (typeof window !== 'undefined' && !window.__aggSchemaLogged) {
    console.log('[aggregateFromServer] First row schema:', JSON.stringify(monthly[0]));
    console.log('[aggregateFromServer] Total rows:', monthly.length);
    window.__aggSchemaLogged = true;
  }

  for (const r of monthly) {
    if (!r || typeof r !== 'object') continue;
    // Esnek alan okuma — Dataverse alias'ı bazen '@FormattedValue' suffix'iyle döner
    const yyRaw = r.yy ?? r['yy@OData.Community.Display.V1.FormattedValue'];
    const ymRaw = r.ym ?? r['ym@OData.Community.Display.V1.FormattedValue'];
    const qtyRaw = r.qty ?? r['qty@OData.Community.Display.V1.FormattedValue'];
    let y = null, m = null;
    // Önce sayısal yyRaw + ymRaw kombinasyonu (beklenen şema: yy=2024, ym=5)
    if (yyRaw != null && ymRaw != null) {
      const yNum = Number(yyRaw);
      const mNum = Number(ymRaw);
      if (Number.isFinite(yNum) && Number.isFinite(mNum) && mNum >= 1 && mNum <= 12 && yNum >= 1900 && yNum <= 2200) {
        y = String(Math.floor(yNum)).padStart(4, '0');
        m = String(Math.floor(mNum)).padStart(2, '0');
      }
    }
    // Alternatif: ymRaw bir tarih string'i ise (örn. "2024-05-01" veya "2024-05")
    if (!y && typeof ymRaw === 'string') {
      const dt = ymRaw.match(/^(\d{4})-(\d{2})/);
      if (dt) { y = dt[1]; m = dt[2]; }
    }
    // Alternatif: yyRaw'da tarih + ymRaw boş senaryosu
    if (!y && typeof yyRaw === 'string') {
      const dt = yyRaw.match(/^(\d{4})-(\d{2})/);
      if (dt) { y = dt[1]; m = dt[2]; }
    }
    if (!y || !m) continue;
    const key = `${y}-${m}`;
    const qty = Number(qtyRaw) || 0;
    if (!map[key]) map[key] = { qty: 0, value: 0, count: 0, hasValue: false };
    map[key].qty += qty;  // toplam (paranoia: birden fazla satır olursa)
  }
  return map;
}

// Şirket kodu alias mapping (kullanıcı tanımlı birleştirmeler)
// DTHY → DANE: DTHY satışlarını DANE altında değerlendir (kullanıcı kararı)
export const COMPANY_ALIAS = {
  'DTHY': 'DANE',
};
export function aliasCompany(code) {
  const k = String(code || '').toUpperCase().trim();
  return COMPANY_ALIAS[k] || k;
}
// companies array'inde alias'ları birleştirir (DTHY+DANE → DANE).
// Entity'den gelen `name` alanını (mserp_trycompanyname) koru — ilk gördüğümüz
// boş-olmayan değer kazanır.
export function mergeCompanyAliases(companies) {
  const m = new Map();
  for (const r of companies || []) {
    const k = aliasCompany(r.co);
    if (!m.has(k)) m.set(k, { co: k, qty: 0, name: null });
    const entry = m.get(k);
    entry.qty += Number(r.qty) || 0;
    if (!entry.name && r.name) entry.name = r.name;
  }
  return [...m.values()];
}

// Server-side aggregate'lerden trader profili kur (raw rows iterate etmek yok)
// products/accounts/companies: [{pid|aid|co: '...', qty: number}, ...]
export function buildTraderProfileFromAggregates(monthlyMap, products, accounts, companies, gGrpFn) {
  // Şirket alias birleştirmesi (DTHY → DANE)
  companies = mergeCompanyAliases(companies);
  const grpCounts = {};
  let totalQty = 0;
  for (const c of companies || []) {
    const co = String(c.co || '').toUpperCase().trim();
    const q = Number(c.qty) || 0;
    const grp = gGrpFn ? gGrpFn(co) : 'Diğer';
    grpCounts[grp] = (grpCounts[grp] || 0) + q;
    totalQty += q;
  }
  const mainGroup = Object.entries(grpCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Diğer';
  const sortedCompanies = [...(companies || [])].sort((a, b) => (Number(b.qty) || 0) - (Number(a.qty) || 0));
  const sortedProducts = [...(products || [])].sort((a, b) => (Number(b.qty) || 0) - (Number(a.qty) || 0));
  const sortedAccounts = [...(accounts || [])].sort((a, b) => (Number(b.qty) || 0) - (Number(a.qty) || 0));
  // { id, name, qty, pct } şeması — name yoksa null kalır, UI sadece id gösterir.
  const topCompanies = sortedCompanies.slice(0, 3).map(c => ({
    id: c.co,
    name: c.name || null,
    qty: Number(c.qty) || 0,
    pct: totalQty > 0 ? (Number(c.qty) / totalQty * 100) : 0,
  }));
  const topProducts = sortedProducts.slice(0, 5).map(p => ({
    id: p.pid,
    name: p.name || null,
    qty: Number(p.qty) || 0,
    pct: totalQty > 0 ? (Number(p.qty) / totalQty * 100) : 0,
  }));
  const topDestinations = sortedAccounts.slice(0, 5).map(a => ({
    id: a.aid,
    name: a.name || null,
    qty: Number(a.qty) || 0,
    pct: totalQty > 0 ? (Number(a.qty) / totalQty * 100) : 0,
  }));
  const keys = Object.keys(monthlyMap).sort();
  const last12Keys = keys.slice(-12);
  const prev12Keys = keys.slice(-24, -12);
  const last12Qty = last12Keys.reduce((s, k) => s + (monthlyMap[k]?.qty || 0), 0);
  const prev12Qty = prev12Keys.reduce((s, k) => s + (monthlyMap[k]?.qty || 0), 0);
  const yoy = prev12Qty > 0 ? ((last12Qty - prev12Qty) / prev12Qty * 100) : null;
  const monthsWithSales = keys.filter(k => (monthlyMap[k]?.qty || 0) > 0).length;
  const intermittenceIndex = keys.length > 0 ? (monthsWithSales / keys.length) : 0;
  const character = intermittenceIndex >= 0.85 ? 'Stabil aylık akış'
    : intermittenceIndex >= 0.6 ? 'Düzensiz akış'
    : 'Lumpy / opportunistic';
  return {
    mainGroup, topCompanies, topProducts, topDestinations,
    totals: { qty: totalQty, value: 0, count: 0 },
    lastYearTotals: { qty: last12Qty, value: 0 },
    yoy, intermittenceIndex, character,
  };
}

// Aggregate map'i sıralı seri'ye çevir (ay arasındaki boşlukları sıfırla doldurur)
// Returns: { keys: ['2022-01',...], qty: [n,n,...], value: [n,n,...] | null, valueAvailable: bool }
export function mapToSeries(aggMap) {
  const keys = Object.keys(aggMap).sort();
  if (keys.length === 0) return { keys: [], qty: [], value: null, valueAvailable: false };

  // Boşlukları doldur — ilk aydan son aya kadar her ay için varsa al, yoksa 0
  const filled = [];
  let cur = keys[0];
  const last = keys[keys.length - 1];
  while (cur && cur <= last) {
    filled.push(cur);
    cur = addMonths(cur, 1);
  }

  const qty = filled.map(k => (aggMap[k]?.qty ?? 0));
  const valueAvailable = Object.values(aggMap).some(v => v.hasValue);
  const value = valueAvailable ? filled.map(k => (aggMap[k]?.value ?? 0)) : null;

  return { keys: filled, qty, value, valueAvailable };
}

// ──────────────── Holt-Winters Triple Exponential Smoothing ──

// Damped Holt-Winters — additive ve multiplicative iki varyantı dener, en iyi SSE'liyi seçer.
// Period = 12 (yıllık mevsim). Trend damping φ ile uzun vadede şişmeyi önler.
// Sıfır içeren serilerde additive variant otomatik tercih edilir (multiplicative bozulur).

function fitHWAdditive(y, m = 12) {
  if (y.length < m * 2) return null;
  const initLevel = mean(y.slice(0, m));
  const initTrend = (mean(y.slice(m, 2 * m)) - initLevel) / m;
  const initSeas = [];
  for (let i = 0; i < m; i++) initSeas.push(y[i] - initLevel);
  // Mevsim indekslerini sıfır toplamına normalize et
  const seasMean = mean(initSeas);
  for (let i = 0; i < m; i++) initSeas[i] -= seasMean;
  const grid = [0.05, 0.1, 0.2, 0.3];
  const phiGrid = [0.92, 0.96, 1.0];
  let best = null;
  for (const alpha of grid) for (const beta of grid) for (const gamma of grid) for (const phi of phiGrid) {
    const fit = applyHWAdd(y, m, initLevel, initTrend, initSeas, alpha, beta, gamma, phi);
    if (!best || fit.sse < best.sse) best = fit;
  }
  return best;
}
function applyHWAdd(y, m, L0, T0, S0, alpha, beta, gamma, phi) {
  let L = L0, T = T0;
  const S = [...S0];
  const fitted = new Array(y.length);
  let sse = 0;
  for (let t = 0; t < y.length; t++) {
    const sIdx = t % m;
    const sPrev = S[sIdx];
    const yhat = L + phi * T + sPrev;
    fitted[t] = yhat;
    sse += (y[t] - yhat) ** 2;
    const newL = alpha * (y[t] - sPrev) + (1 - alpha) * (L + phi * T);
    const newT = beta * (newL - L) + (1 - beta) * phi * T;
    const newS = gamma * (y[t] - newL) + (1 - gamma) * sPrev;
    L = newL; T = newT; S[sIdx] = newS;
  }
  return { L, T, S, fitted, sse, alpha, beta, gamma, phi, m, kind: 'add' };
}

function fitHWMultiplicative(y, m = 12) {
  if (y.length < m * 2) return null;
  // Multiplicative sadece tüm değerler pozitifse anlamlı — sıfır ay varsa skip
  const allPositive = y.every(v => v > 0);
  if (!allPositive) return null;
  const initLevel = mean(y.slice(0, m));
  if (initLevel <= 0) return null;
  const initTrend = (mean(y.slice(m, 2 * m)) - initLevel) / m;
  const initSeas = [];
  for (let i = 0; i < m; i++) initSeas.push(y[i] / initLevel);
  const grid = [0.05, 0.1, 0.2, 0.3];
  const phiGrid = [0.92, 0.96, 1.0];
  let best = null;
  for (const alpha of grid) for (const beta of grid) for (const gamma of grid) for (const phi of phiGrid) {
    const fit = applyHWMul(y, m, initLevel, initTrend, initSeas, alpha, beta, gamma, phi);
    if (!best || fit.sse < best.sse) best = fit;
  }
  return best;
}
function applyHWMul(y, m, L0, T0, S0, alpha, beta, gamma, phi) {
  let L = L0, T = T0;
  const S = [...S0];
  const fitted = new Array(y.length);
  let sse = 0;
  for (let t = 0; t < y.length; t++) {
    const sIdx = t % m;
    const sPrev = S[sIdx];
    const yhat = (L + phi * T) * sPrev;
    fitted[t] = yhat;
    sse += (y[t] - yhat) ** 2;
    const newL = sPrev > 0 ? alpha * (y[t] / sPrev) + (1 - alpha) * (L + phi * T) : (L + phi * T);
    const newT = beta * (newL - L) + (1 - beta) * phi * T;
    const newS = newL > 0 ? gamma * (y[t] / newL) + (1 - gamma) * sPrev : sPrev;
    L = newL; T = newT; S[sIdx] = newS;
  }
  return { L, T, S, fitted, sse, alpha, beta, gamma, phi, m, kind: 'mul' };
}

function projectHW(fit, h) {
  if (!fit) return null;
  const out = new Array(h);
  // Damped trend için: T toplamı φ + φ² + ... + φ^h = φ(1-φ^h)/(1-φ); φ=1 ise = h
  for (let i = 1; i <= h; i++) {
    const trendSum = fit.phi >= 1 ? i * fit.T : fit.T * fit.phi * (1 - Math.pow(fit.phi, i)) / (1 - fit.phi);
    const sIdx = (fit.fitted.length + i - 1) % fit.m;
    if (fit.kind === 'mul') {
      out[i - 1] = (fit.L + trendSum) * fit.S[sIdx];
    } else {
      out[i - 1] = fit.L + trendSum + fit.S[sIdx];
    }
  }
  return out;
}

export function forecastHoltWinters(series, h) {
  const fitAdd = fitHWAdditive(series, 12);
  const fitMul = fitHWMultiplicative(series, 12);
  // İkisini karşılaştır, daha düşük SSE'li olanı al
  let fit = null;
  if (fitAdd && fitMul) fit = fitAdd.sse <= fitMul.sse ? fitAdd : fitMul;
  else fit = fitAdd || fitMul;
  if (!fit) return forecastSeasonalNaive(series, h);  // fallback
  const point = projectHW(fit, h).map(x => Math.max(0, x));
  // Sanity check: forecast tarihçenin maksimumunun 3 katından büyükse muhtemelen patladı
  const histMax = Math.max(...series, 1);
  const sane = point.every(p => p <= histMax * 3);
  if (!sane) return forecastSeasonalNaive(series, h);  // güvenlik fallback
  const residuals = series.map((y, i) => y - fit.fitted[i]);
  const sd = std(residuals);
  const ci = point.map((p, i) => 1.96 * sd * Math.sqrt(i + 1));
  return {
    point,
    lower: point.map((p, i) => Math.max(0, p - ci[i])),
    upper: point.map((p, i) => p + ci[i]),
    fitted: fit.fitted,
    params: { alpha: fit.alpha, beta: fit.beta, gamma: fit.gamma, phi: fit.phi, kind: fit.kind },
  };
}

// ──────────────── STL+ETS (basit klasik dekompozisyon) ───────

// Klasik additive decomposition: trend (centered MA-12) + seasonal (mean per month) + residual
// Trend uzantısı: lineer regresyon; seasonal: sezon indeksini tekrarla
export function forecastSTLETS(series, h) {
  const n = series.length;
  const m = 12;
  if (n < m * 2) return forecastSeasonalNaive(series, h);

  // 1. Trend: centered moving average (m=12). 12'lik MA için 6'lı yumuşatma
  const trend = new Array(n).fill(null);
  for (let i = 6; i < n - 6; i++) {
    let s = 0;
    for (let j = -5; j <= 6; j++) s += series[i + j];
    s -= series[i - 5] * 0.5 + series[i + 6] * 0.5;  // centered correction
    trend[i] = s / m;
  }
  // Trend kenarlarını lineer extrapolasyonla doldur
  const validIdx = trend.map((v, i) => v != null ? i : -1).filter(i => i >= 0);
  if (validIdx.length < 2) return forecastSeasonalNaive(series, h);
  const t1 = validIdx[0], t2 = validIdx[validIdx.length - 1];
  const slope = (trend[t2] - trend[t1]) / (t2 - t1);
  for (let i = 0; i < t1; i++) trend[i] = trend[t1] - slope * (t1 - i);
  for (let i = t2 + 1; i < n; i++) trend[i] = trend[t2] + slope * (i - t2);

  // 2. Detrended series
  const detrended = series.map((y, i) => y - trend[i]);

  // 3. Seasonal index (her ay için ortalama detrended değer)
  const seasIdx = new Array(m).fill(0);
  const seasCount = new Array(m).fill(0);
  for (let i = 0; i < n; i++) {
    const k = i % m;
    seasIdx[k] += detrended[i];
    seasCount[k] += 1;
  }
  for (let k = 0; k < m; k++) seasIdx[k] /= (seasCount[k] || 1);
  // Mevsim indekslerini sıfırla normalize et (toplamı 0)
  const seasMean = mean(seasIdx);
  for (let k = 0; k < m; k++) seasIdx[k] -= seasMean;

  // 4. Forecast: trend (lineer extrapolasyon) + seasonal index + residual yokmuş gibi 0
  const lastTrend = trend[n - 1];
  const point = [];
  for (let i = 0; i < h; i++) {
    const trendF = lastTrend + slope * (i + 1);
    const seasF = seasIdx[(n + i) % m];
    point.push(Math.max(0, trendF + seasF));
  }

  // CI: residual stdev
  const fitted = series.map((_, i) => trend[i] + seasIdx[i % m]);
  const residuals = series.map((y, i) => y - fitted[i]);
  const sd = std(residuals);
  const ci = point.map((_, i) => 1.96 * sd * Math.sqrt(i + 1));

  return {
    point,
    lower: point.map((p, i) => Math.max(0, p - ci[i])),
    upper: point.map((p, i) => p + ci[i]),
    fitted,
    params: { trendSlope: slope },
  };
}

// ──────────────── Seasonal Naive ──────────────────────────────

export function forecastSeasonalNaive(series, h) {
  const n = series.length;
  const m = 12;
  if (n === 0) return { point: new Array(h).fill(0), lower: new Array(h).fill(0), upper: new Array(h).fill(0), fitted: [], params: {} };

  const point = new Array(h);
  for (let i = 0; i < h; i++) {
    // Geçen yılın aynı ayı (n-m+i)
    const idx = n - m + i;
    if (idx >= 0 && idx < n) point[i] = series[idx];
    else point[i] = series[n - 1];  // fallback son değer
  }

  // Fitted: her i için series[i-m] (varsa)
  const fitted = series.map((_, i) => i >= m ? series[i - m] : series[i]);
  const residuals = series.slice(m).map((y, i) => y - fitted[i + m]);
  const sd = std(residuals);
  const ci = point.map((_, i) => 1.96 * sd * Math.sqrt(Math.floor(i / m) + 1));

  return {
    point,
    lower: point.map((p, i) => Math.max(0, p - ci[i])),
    upper: point.map((p, i) => p + ci[i]),
    fitted,
    params: {},
  };
}

// ──────────────── Croston (TSB variant) ───────────────────────

// Intermittent demand için. α'yı 0.1-0.3 arası optimize eder.
export function forecastCroston(series, h) {
  const n = series.length;
  if (n === 0) return { point: new Array(h).fill(0), lower: new Array(h).fill(0), upper: new Array(h).fill(0), fitted: [], params: {} };

  // Α grid search
  const alphas = [0.1, 0.15, 0.2, 0.25, 0.3];
  let best = null;
  for (const alpha of alphas) {
    const fit = applyCroston(series, alpha);
    if (!best || fit.sse < best.sse) best = fit;
  }

  const forecast = best.lastForecast;  // Croston output sabit (level forecast)
  const point = new Array(h).fill(Math.max(0, forecast));
  const sd = std(best.fitted.map((f, i) => series[i] - f));
  const ci = point.map((_, i) => 1.96 * sd * Math.sqrt(i + 1));

  return {
    point,
    lower: point.map((p, i) => Math.max(0, p - ci[i])),
    upper: point.map((p, i) => p + ci[i]),
    fitted: best.fitted,
    params: { alpha: best.alpha },
  };
}

function applyCroston(series, alpha) {
  // İki seri tut: Z (sıfır olmayan demand'in kademeli ortalaması), P (zaman aralığı)
  let Z = 0, P = 1;
  let lastNonzeroIdx = -1;
  let initialized = false;
  const fitted = new Array(series.length).fill(0);
  let sse = 0;

  for (let t = 0; t < series.length; t++) {
    const yt = series[t];
    if (yt > 0) {
      if (!initialized) {
        Z = yt;
        P = lastNonzeroIdx === -1 ? 1 : (t - lastNonzeroIdx);
        initialized = true;
      } else {
        const interval = lastNonzeroIdx === -1 ? 1 : (t - lastNonzeroIdx);
        Z = alpha * yt + (1 - alpha) * Z;
        P = alpha * interval + (1 - alpha) * P;
      }
      lastNonzeroIdx = t;
    }
    const f = P > 0 ? Z / P : 0;
    fitted[t] = f;
    sse += (yt - f) ** 2;
  }
  return { Z, P, lastForecast: P > 0 ? Z / P : 0, fitted, sse, alpha };
}

// ──────────────── Theta Method ────────────────────────────────

// Klasik Theta — y'yi iki "theta line"a ayırır:
//   theta=0 → tarihsel lineer regresyon doğrusu (trend yakalar)
//   theta=2 → 2y - theta0 (varyasyonu güçlendirir)
// Tahmin: theta0 (uzatılmış lineer) + theta2 (SES ile düzeltilmiş) ortalaması
// Küçük serilerde Seasonal Naive'i sık yener, M3/M4 yarışmalarında üst sıralarda.
export function forecastTheta(series, h) {
  const n = series.length;
  if (n < 4) return forecastSeasonalNaive(series, h);

  // Lineer regresyon: y = a + b*t
  const xMean = (n - 1) / 2;
  const yMean = mean(series);
  let num = 0, denom = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (series[i] - yMean);
    denom += (i - xMean) ** 2;
  }
  const slope = denom !== 0 ? num / denom : 0;
  const intercept = yMean - slope * xMean;
  const theta0 = i => intercept + slope * i;

  // Theta=2 line: 2y - theta0
  const theta2Series = series.map((y, i) => 2 * y - theta0(i));

  // SES (Simple Exponential Smoothing) on theta2 — alpha grid search
  const alphaGrid = [0.05, 0.1, 0.2, 0.3, 0.5, 0.7];
  let bestAlpha = 0.2, bestSSE = Infinity, bestLevel = theta2Series[0];
  for (const a of alphaGrid) {
    let lvl = theta2Series[0];
    let sse = 0;
    for (let t = 1; t < n; t++) {
      const yhat = lvl;
      sse += (theta2Series[t] - yhat) ** 2;
      lvl = a * theta2Series[t] + (1 - a) * lvl;
    }
    if (sse < bestSSE) { bestSSE = sse; bestAlpha = a; bestLevel = lvl; }
  }

  // Fitted values: ortalama (theta0(t) + SES of theta2 up to t)
  const fitted = new Array(n);
  let lvl = theta2Series[0];
  for (let t = 0; t < n; t++) {
    fitted[t] = (theta0(t) + lvl) / 2;
    lvl = bestAlpha * theta2Series[t] + (1 - bestAlpha) * lvl;
  }

  // h-step forecast
  const point = [];
  for (let hi = 1; hi <= h; hi++) {
    const t0F = intercept + slope * (n + hi - 1);
    const t2F = bestLevel;
    point.push(Math.max(0, (t0F + t2F) / 2));
  }
  const residuals = series.map((y, i) => y - fitted[i]);
  const sd = std(residuals);
  const ci = point.map((_, i) => 1.96 * sd * Math.sqrt(i + 1));
  return {
    point,
    lower: point.map((p, i) => Math.max(0, p - ci[i])),
    upper: point.map((p, i) => p + ci[i]),
    fitted,
    params: { slope, alpha: bestAlpha },
  };
}

// ──────────────── Holt's Linear Trend (damped) ────────────────

// Mevsimsiz, sadece seviye + trend (damping ile). Trendli ama mevsim deseni
// olmayan seriler (B2C marka satışları, yeni başlayan trader'lar) için ideal.
export function forecastHoltLinear(series, h) {
  const n = series.length;
  if (n < 3) return forecastSeasonalNaive(series, h);

  const initLevel = series[0];
  const initTrend = series[1] - series[0];
  const grid = [0.05, 0.1, 0.2, 0.3, 0.5];
  const phiGrid = [0.85, 0.92, 0.96, 1.0];
  let best = null;
  for (const alpha of grid) for (const beta of grid) for (const phi of phiGrid) {
    let L = initLevel, T = initTrend;
    const fitted = new Array(n);
    let sse = 0;
    for (let t = 0; t < n; t++) {
      const yhat = L + phi * T;
      fitted[t] = yhat;
      sse += (series[t] - yhat) ** 2;
      const newL = alpha * series[t] + (1 - alpha) * (L + phi * T);
      const newT = beta * (newL - L) + (1 - beta) * phi * T;
      L = newL; T = newT;
    }
    if (!best || sse < best.sse) best = { L, T, alpha, beta, phi, fitted, sse };
  }
  const point = [];
  for (let i = 1; i <= h; i++) {
    const trendSum = best.phi >= 1 ? i * best.T : best.T * best.phi * (1 - Math.pow(best.phi, i)) / (1 - best.phi);
    point.push(Math.max(0, best.L + trendSum));
  }
  const residuals = series.map((y, i) => y - best.fitted[i]);
  const sd = std(residuals);
  const ci = point.map((_, i) => 1.96 * sd * Math.sqrt(i + 1));
  return {
    point,
    lower: point.map((p, i) => Math.max(0, p - ci[i])),
    upper: point.map((p, i) => p + ci[i]),
    fitted: best.fitted,
    params: { alpha: best.alpha, beta: best.beta, phi: best.phi },
  };
}

// ──────────────── Outlier STL+ETS ─────────────────────────────

// STL+ETS'in outlier'a dayanıklı versiyonu — IQR (interquartile range)
// kullanarak aşırı değerleri tespit eder, medyan ile değiştirir, sonra
// klasik dekompozisyon uygular. Tek vessel sevkiyatları gibi büyük
// noktasal anomaliler tahminleri bozmasın.
export function forecastSTLETSOutlier(series, h) {
  const n = series.length;
  if (n < 24) return forecastSTLETS(series, h);

  // Outlier tespiti: rolling 12-aylık medyan + IQR-bazlı eşik
  const cleaned = [...series];
  const win = 12;
  for (let t = 0; t < n; t++) {
    const start = Math.max(0, t - win), end = Math.min(n, t + win + 1);
    const w = series.slice(start, end).filter(v => v != null).sort((a, b) => a - b);
    if (w.length < 4) continue;
    const q1 = w[Math.floor(w.length * 0.25)];
    const q3 = w[Math.floor(w.length * 0.75)];
    const median = w[Math.floor(w.length / 2)];
    const iqr = q3 - q1;
    const lo = q1 - 2.5 * iqr, hi = q3 + 2.5 * iqr;
    if (series[t] < lo || series[t] > hi) {
      cleaned[t] = median;  // outlier replaced with local median
    }
  }
  return forecastSTLETS(cleaned, h);
}

// ──────────────── Moving Average ──────────────────────────────

export function forecastMovingAverage(series, h, window = 3) {
  const n = series.length;
  if (n < window) return forecastSeasonalNaive(series, h);

  const lastAvg = mean(series.slice(-window));
  const point = new Array(h).fill(Math.max(0, lastAvg));

  // Fitted: her i için son window'un ortalaması
  const fitted = series.map((_, i) => i >= window ? mean(series.slice(i - window, i)) : series[i]);
  const residuals = series.slice(window).map((y, i) => y - fitted[i + window]);
  const sd = std(residuals);
  const ci = point.map((_, i) => 1.96 * sd * Math.sqrt(i + 1));

  return {
    point,
    lower: point.map((p, i) => Math.max(0, p - ci[i])),
    upper: point.map((p, i) => p + ci[i]),
    fitted,
    params: { window },
  };
}

// ──────────────── Backtest (MAPE) ─────────────────────────────

// Son `holdout` ayı sakla, geri kalanla eğit, sakladığını tahmin et, MAPE hesapla
// modelFn: (series, h) => { point, ... }
export function backtestMAPE(modelFn, series, holdout = 6) {
  if (series.length < holdout + 12) return null;  // anlamlı backtest için yetersiz
  const train = series.slice(0, -holdout);
  const test = series.slice(-holdout);
  const result = modelFn(train, holdout);
  if (!result || !result.point) return null;

  let sumPctError = 0, count = 0;
  for (let i = 0; i < holdout; i++) {
    const actual = test[i];
    const pred = result.point[i];
    const denom = Math.max(Math.abs(actual), 1);  // sıfır koruması
    sumPctError += Math.abs(actual - pred) / denom;
    count++;
  }
  return count > 0 ? (sumPctError / count) * 100 : null;
}

// ──────────────── Best Fit selector ───────────────────────────

// Tüm modelleri çalıştır, MAPE'leri hesapla, en düşük MAPE'liyi seç
export function selectBestFit(series, h) {
  const intermittence = (series.filter(x => x > 0).length / series.length);
  const isIntermittent = intermittence < 0.6;

  const models = [
    { id: 'hw',      label: 'Holt-Winters',    fn: (s, hh) => forecastHoltWinters(s, hh) },
    { id: 'stlOut',  label: 'Outlier STL+ETS', fn: (s, hh) => forecastSTLETSOutlier(s, hh) },
    { id: 'theta',   label: 'Theta',           fn: (s, hh) => forecastTheta(s, hh) },
    { id: 'holtLin', label: "Holt's Linear",   fn: (s, hh) => forecastHoltLinear(s, hh) },
    { id: 'stl',     label: 'STL+ETS',         fn: (s, hh) => forecastSTLETS(s, hh) },
    { id: 'snaive',  label: 'Seasonal Naive',  fn: (s, hh) => forecastSeasonalNaive(s, hh) },
    { id: 'croston', label: 'Croston',         fn: (s, hh) => forecastCroston(s, hh), onlyIfIntermittent: true },
    { id: 'ma3',     label: 'Moving Avg (3)',  fn: (s, hh) => forecastMovingAverage(s, hh, 3) },
  ];

  const results = [];
  for (const m of models) {
    if (m.onlyIfIntermittent && !isIntermittent) {
      results.push({ id: m.id, label: m.label, mape: null, forecast: null, skipped: true, reason: 'Seri intermittent değil' });
      continue;
    }
    try {
      const forecast = m.fn(series, h);
      const mape = backtestMAPE(m.fn, series, Math.min(6, Math.floor(series.length / 6)));
      results.push({ id: m.id, label: m.label, mape, forecast, skipped: false });
    } catch (e) {
      results.push({ id: m.id, label: m.label, mape: null, forecast: null, skipped: true, reason: e.message });
    }
  }

  // En düşük MAPE'li (null hariç) en iyi
  const ranked = results.filter(r => !r.skipped && r.mape != null).sort((a, b) => a.mape - b.mape);
  const bestId = ranked.length > 0 ? ranked[0].id : (isIntermittent ? 'croston' : 'hw');
  return { bestId, results, intermittence, isIntermittent };
}

// ──────────────── Trader Profile ──────────────────────────────

// rows: raw historical-sales records
// gGrpFn: (companyCode) => groupName (App.jsx'ten gGrp fonksiyonu)
// monthlyAgg: aggregateMonthly() çıktısı (zaten hesaplanmış)
export function buildTraderProfile(rows, gGrpFn, monthlyAgg) {
  const totalRows = rows.length;
  if (totalRows === 0) {
    return {
      mainGroup: '-',
      topCompanies: [],
      topProducts: [],
      topDestinations: [],
      totals: { qty: 0, value: 0, count: 0 },
      lastYearTotals: { qty: 0, value: 0 },
      yoy: null,
      intermittenceIndex: 0,
      character: '-',
    };
  }

  // Grup şirket: salesdataareaid'den (mserp_salesdataareaid: 'dthy', 'dane' gibi)
  // gGrpFn beklenen çıktı: 'Tiryaki Anadolu' vb. — companyCode CGRP key formatında olmalı (büyük harf)
  const grpCounts = {};
  const compCounts = {};
  const prodCounts = {};
  const destCounts = {};
  // id → name map'leri (entity'den okunan ad alanları)
  const compNames = {};
  const prodNames = {};
  const destNames = {};
  let totalQty = 0, totalValue = 0, totalCount = 0;

  for (const r of rows) {
    // Şirket alias birleştirmesi (DTHY → DANE)
    const co = aliasCompany(r.mserp_salesdataareaid);
    const grp = gGrpFn ? gGrpFn(co) : 'Diğer';
    const q = Number(r.mserp_quantity) || 0;
    grpCounts[grp] = (grpCounts[grp] || 0) + q;
    compCounts[co] = (compCounts[co] || 0) + q;
    if (co && !compNames[co] && r.mserp_trycompanyname) {
      compNames[co] = String(r.mserp_trycompanyname).trim() || null;
    }

    const p = String(r.mserp_productid || '').trim();
    if (p) {
      prodCounts[p] = (prodCounts[p] || 0) + q;
      if (!prodNames[p] && r.mserp_tryitemname) {
        prodNames[p] = String(r.mserp_tryitemname).trim() || null;
      }
    }

    const d = String(r.mserp_toaccountid || '').trim();
    if (d) {
      destCounts[d] = (destCounts[d] || 0) + q;
      if (!destNames[d] && r.mserp_accountname) {
        destNames[d] = String(r.mserp_accountname).trim() || null;
      }
    }

    totalQty += q;
    if (r.mserp_amountmst != null) totalValue += Number(r.mserp_amountmst) || 0;
    totalCount += 1;
  }

  const mainGroup = Object.entries(grpCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Diğer';
  const topCompanies = Object.entries(compCounts).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([id, q]) => ({ id, name: compNames[id] || null, qty: q, pct: totalQty > 0 ? (q / totalQty * 100) : 0 }));
  const topProducts = Object.entries(prodCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([id, q]) => ({ id, name: prodNames[id] || null, qty: q, pct: totalQty > 0 ? (q / totalQty * 100) : 0 }));
  const topDestinations = Object.entries(destCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([id, q]) => ({ id, name: destNames[id] || null, qty: q, pct: totalQty > 0 ? (q / totalQty * 100) : 0 }));

  // Son 12 ay vs önceki 12 ay (YoY)
  const keys = Object.keys(monthlyAgg).sort();
  const last12Keys = keys.slice(-12);
  const prev12Keys = keys.slice(-24, -12);
  const last12Qty = sum(last12Keys.map(k => monthlyAgg[k]?.qty || 0));
  const prev12Qty = sum(prev12Keys.map(k => monthlyAgg[k]?.qty || 0));
  const last12Value = sum(last12Keys.map(k => monthlyAgg[k]?.value || 0));
  const yoy = prev12Qty > 0 ? ((last12Qty - prev12Qty) / prev12Qty * 100) : null;

  // Intermittence: kaç ayda satış olmuş / toplam ay sayısı
  const filledMonths = keys.length;
  const monthsWithSales = keys.filter(k => (monthlyAgg[k]?.qty || 0) > 0).length;
  const intermittenceIndex = filledMonths > 0 ? (monthsWithSales / filledMonths) : 0;
  const character = intermittenceIndex >= 0.85 ? 'Stabil aylık akış'
    : intermittenceIndex >= 0.6 ? 'Düzensiz akış'
    : 'Lumpy / opportunistic';

  return {
    mainGroup,
    topCompanies,
    topProducts,
    topDestinations,
    totals: { qty: totalQty, value: totalValue, count: totalCount },
    lastYearTotals: { qty: last12Qty, value: last12Value },
    yoy,
    intermittenceIndex,
    character,
  };
}

// ──────────────── Public model registry ───────────────────────

// UI'da sekme listesi + hover detay panelleri için
export const FORECAST_MODELS = [
  {
    id: 'hw',
    label: 'Holt-Winters',
    short: 'Trend + yıllık mevsim',
    description: 'Üçlü üstel düzleme (Triple Exponential Smoothing) — seviye, trend ve yıllık mevsimselliği additive ve multiplicative variantlarda paralel deniyor, daha düşük hatalı seçiliyor. Damped trend (φ) uzun horizon\'da şişmeyi engelliyor.',
    strength: 'Yıllık mevsimsel desen + büyüme trendi olan stabil seriler için en güçlüsü. Ramazan-bayram gibi yıllık tekrar eden pikleri yakalar.',
    weakness: 'Yapısal kırılmalara (acquisition, kapanma) ve düzensiz/sıçramalı seriler için zayıf. En az 24 ay tarihçe gerekir.',
    whenToUse: 'Düzenli aylık satış akışı olan B2B trader\'lar (Sunrise, Tiryaki Anadolu domestic, Hasata B2C).',
    formula: 'L_t = α(y_t/S_{t-m}) + (1-α)(L_{t-1} + φ·T_{t-1})',
  },
  {
    id: 'stlOut',
    label: 'Outlier STL+ETS',
    short: 'Outlier toleranslı dekompozisyon',
    description: 'STL+ETS\'in outlier-dayanıklı versiyonu. Önce IQR (interquartile range) bazlı tespitle aşırı değerleri yerel medyan ile değiştirir, sonra klasik dekompozisyon uygular. Tek vessel sevkiyatı gibi büyük noktasal anomalileri filtreler.',
    strength: 'Düzensiz büyük sıçramalar (vessel sevkiyatları, tek seferlik kontratlar) modeli bozmuyor. Trend + mevsim hâlâ yakalanır.',
    weakness: 'Eğer aslında bütün satışlar büyükse (örn. her ay 5K+ Ton), her şeyi outlier sayıp aşırı sönükleştirebilir.',
    whenToUse: 'Vessel-bazlı uluslararası trader\'lar (Mesopotamia, Sunrise) — anomaliler genellikle gerçek tek seferlik olaylardır.',
    formula: 'y_t = clip(y_t, Q1-2.5·IQR, Q3+2.5·IQR) → STL',
  },
  {
    id: 'theta',
    label: 'Theta',
    short: 'Lineer trend + SES kombinasyonu',
    description: 'M3/M4 forecasting yarışmalarında üst sıralarda yer alan klasik Theta yöntemi. Seriyi iki "theta line"a ayırır: theta=0 (lineer regresyon doğrusu) ve theta=2 (ham veri × 2 - regresyon). İkisini ayrı ayrı uzatıp ortalamayla birleştirir.',
    strength: 'Küçük örneklemde (24-36 ay) Seasonal Naive\'i sık yenen az sayıda yöntemden biri. Trend yakalama gücü iyi, mevsimsiz serilerde de çalışır.',
    weakness: 'Yıllık mevsimi açıkça modellemiyor — eğer mevsimsel pik çok belirginse HW\'den geri kalabilir.',
    whenToUse: 'Trend var ama mevsim deseni belirsiz/zayıf seriler. Yeni başlayan trader\'lar (kısa tarihçe) için iyi default.',
    formula: 'ŷ = (theta0_extrap + SES(theta2)) / 2',
  },
  {
    id: 'holtLin',
    label: "Holt's Linear",
    short: 'Trend, mevsimsiz (damped)',
    description: 'Çift üstel düzleme: seviye ve trend modellenir, mevsim modellenmez. Damped variant (φ < 1) trendin uzun vadede sönmesini sağlar.',
    strength: 'Trendli ama yıllık tekrarlayan deseni olmayan seriler için temiz. Damping uzun tahminlerde aşırı projeksiyonu engeller.',
    weakness: 'Mevsimsel pik varsa onu yakalayamaz — bakliyat hasadı, Ramazan gibi etkileri kaçırır.',
    whenToUse: 'B2C ürünler (FMCG, marka satışı) ve genel olarak mevsim deseni zayıf trader\'lar.',
    formula: 'ŷ_{t+h} = L_t + Σ φ^i · T_t',
  },
  {
    id: 'stl',
    label: 'STL+ETS (basit)',
    short: 'Klasik dekompozisyon',
    description: 'Seriyi trend (12-aylık merkezli MA), mevsimsel indeks ve residual\'a ayırır. Trend lineer regresyonla geleceğe taşınır, mevsim deseni tekrarlanır.',
    strength: 'Trend ve mevsimi görsel olarak ayrıştırabilirsin. Stabil seriler için iyi.',
    weakness: 'Outlier\'a dayanıksız — anomaliler dekompozisyonu boza. Outlier STL+ETS varyantı tercih edilir.',
    whenToUse: 'Sadece referans için bırakıldı. Genelde Outlier STL+ETS daha iyi.',
    formula: 'y_t = T_t + S_t + R_t  (additive)',
  },
  {
    id: 'snaive',
    label: 'Seasonal Naive',
    short: 'Geçen yıl aynı ay',
    description: '"Önümüzdeki Mayıs, geçen Mayıs gibi olur" varsayımı. m=12 ile her ay için bir önceki yılın aynı ayı tekrar edilir.',
    strength: 'Çok basit, zorla anlamlı bir baseline. Eğer diğer modeller bundan daha iyi çıkamıyorsa, modelimiz aslında bilgi katmıyor demektir.',
    weakness: 'Trend yok — büyüme veya küçülme trendi varsa düşük tahmin verir. **Tahmin = geçen yıl olduğu için YoY her zaman %0**.',
    whenToUse: 'Stabil mevsimsel ürünler — bakliyat, organik feed gibi yıldan yıla benzer akışlar. Her zaman karşılaştırma için referans.',
    formula: 'ŷ_{t+h} = y_{t+h-12}',
  },
  {
    id: 'croston',
    label: 'Croston (TSB)',
    short: 'Lumpy / intermittent',
    description: 'Aralıklı/sıçramalı talep için özelleşmiş. Demand miktarı (Z) ve sıfır-olmayan satışlar arası süre (P) ayrı üstel düzleme ile takip edilir, tahmin Z/P olarak çıkar.',
    strength: 'Bazı aylarda satış olmayan trader\'lar için doğru olan tek model. HW veya naive bu seriler için resmen yanlış.',
    weakness: 'Yapısal olarak düz forecast verir — trend veya mevsim yakalayamaz. Düzenli serilerde HW\'den daima zayıf.',
    whenToUse: 'Vessel-temelli opportunistic trader\'lar (Mesopotamia FZE), 36 ayın <%60\'ında satış varsa otomatik olarak bu seçilir.',
    formula: 'ŷ = Ẑ / P̂  (level / interval)',
  },
  {
    id: 'ma3',
    label: 'Moving Avg (3)',
    short: 'Son 3 ay ortalaması',
    description: 'Son 3 ayın aritmetik ortalaması, geleceğe sabit olarak taşınır. En basit hareketli ortalama.',
    strength: 'Çok kararlı — kısa vadeli gürültüye dayanıklı. Hızlı trend değişikliklerini takip eder.',
    weakness: 'Mevsimsel desen yok, trend yok — uzun vadede tüm forecast düz çizgi. Yıllık mevsimi tamamen kaçırır.',
    whenToUse: 'Sadece son durum referansı için. Eğer best fit olarak çıkıyorsa, seri tahmin edilemez kadar gürültülü demektir.',
    formula: 'ŷ_{t+h} = (y_{t-2} + y_{t-1} + y_t) / 3',
  },
];

// ════════════════════════════════════════════════════════════════
// Phase 3 — Trader + Itemid Hiyerarşi
// ════════════════════════════════════════════════════════════════

// ─────────────── Hyndman-Boylan ADI/CV² seri sınıflandırma ───────
// ADI = Average Demand Interval (sıfır-olmayan dönemler arası ortalama mesafe)
// CV² = (std/mean)² sıfır-olmayan değerlerde
// type: smooth (ADI<1.32, CV²<0.49) | erratic (ADI<1.32, CV²>=0.49)
//       intermittent (ADI>=1.32, CV²<0.49) | lumpy (ADI>=1.32, CV²>=0.49)
export function classifySeries(series) {
  const n = series.length;
  if (n === 0) return { adi: Infinity, cv2: 0, type: 'lumpy', forecastable: false, score: 0, recommendedModels: [] };

  const nonZero = series.filter(x => x > 0);
  const monthsWithSales = nonZero.length;
  const adi = monthsWithSales > 0 ? n / monthsWithSales : Infinity;
  const m = mean(nonZero);
  const sd = std(nonZero);
  const cv2 = m > 0 ? (sd / m) ** 2 : 0;

  let type;
  if (adi < 1.32 && cv2 < 0.49) type = 'smooth';
  else if (adi < 1.32 && cv2 >= 0.49) type = 'erratic';
  else if (adi >= 1.32 && cv2 < 0.49) type = 'intermittent';
  else type = 'lumpy';

  // Forecastable: yeterli uzunluk + yeterli sıklık + makul varyans
  const forecastable = (n >= 18) && (monthsWithSales >= Math.min(12, Math.floor(n / 2))) && (cv2 < 4);

  // Skor: 1 - (cv²/4 cap'li) × (1 / (1 + (adi-1)*0.5))
  const cv2Norm = Math.min(1, cv2 / 4);
  const adiNorm = 1 / (1 + Math.max(0, adi - 1) * 0.5);
  const score = Math.max(0, Math.min(1, (1 - cv2Norm) * adiNorm));

  let recommendedModels;
  if (type === 'smooth') recommendedModels = ['hw', 'theta', 'stl', 'holtLin'];
  else if (type === 'erratic') recommendedModels = ['stlOut', 'theta', 'ma3'];
  else if (type === 'intermittent') recommendedModels = ['croston', 'snaive', 'ma3'];
  else recommendedModels = ['croston', 'ma3', 'snaive'];

  return { adi, cv2, type, forecastable, score, monthsWithSales, recommendedModels };
}

// ─────────────── Itemid×month server response → seri map ─────────
// itemmonthRows: [{pid, ym, qty, yy} | parse-friendly variants]
// Dönüş: Map<pid, { keys: [...sorted YYYY-MM...], qty: [...], totalQty: number }>
export function aggregateByItemid(itemmonthRows) {
  const itemMap = new Map();  // pid → { tempMap: Map<key, qty>, totalQty, name }
  const debugFirst = itemmonthRows && itemmonthRows[0];
  if (debugFirst) {
    try { console.log('[aggregateByItemid] first row keys:', Object.keys(debugFirst).slice(0, 12)); } catch (_) {}
  }

  for (const row of (itemmonthRows || [])) {
    if (!row) continue;
    const pid = String(row.pid || row['pid@OData.Community.Display.V1.FormattedValue'] || row.mserp_productid || '').trim();
    if (!pid) continue;
    const qty = Number(row.qty || 0);
    if (!Number.isFinite(qty)) continue;

    // ay bilgisi: ym (sayı 1-12) + yy (yıl), ya da ym/ymRaw tarih string
    let key = null;
    if (row.yy != null && row.ym != null && Number.isFinite(+row.ym) && +row.ym >= 1 && +row.ym <= 12) {
      const yy = +row.yy;
      const mm = +row.ym;
      key = `${yy}-${String(mm).padStart(2, '0')}`;
    } else {
      const ymRaw = row.ymRaw || row.ym;
      if (typeof ymRaw === 'string') {
        const d = new Date(ymRaw);
        if (!isNaN(d)) key = ymKey(d);
      }
    }
    if (!key) continue;

    if (!itemMap.has(pid)) itemMap.set(pid, { tempMap: new Map(), totalQty: 0, name: null });
    const entry = itemMap.get(pid);
    entry.tempMap.set(key, (entry.tempMap.get(key) || 0) + qty);
    entry.totalQty += qty;
    // Ürün adını yakala — ilk gördüğümüz boş-olmayan değer (aggregate sorgudan `pname`,
    // raw fallback'tan `mserp_tryitemname` gelir).
    if (!entry.name) {
      const rawName = row.pname
        ?? row['pname@OData.Community.Display.V1.FormattedValue']
        ?? row.mserp_tryitemname
        ?? null;
      const str = (rawName == null ? '' : String(rawName)).trim();
      if (str) entry.name = str;
    }
  }

  // tempMap → keys+qty array (boşluklar 0 ile dolu)
  const result = new Map();
  for (const [pid, entry] of itemMap) {
    const keys = [...entry.tempMap.keys()].sort();
    if (keys.length === 0) continue;
    const filled = [];
    let cur = keys[0];
    const last = keys[keys.length - 1];
    while (cur && cur <= last) { filled.push(cur); cur = addMonths(cur, 1); }
    const qty = filled.map(k => entry.tempMap.get(k) || 0);
    result.set(pid, { keys: filled, qty, totalQty: entry.totalQty, name: entry.name });
  }
  return result;
}

// ─────────────── Top-N Itemid Forecast Batch ─────────────────────
// itemSeriesMap: Map<pid, {keys, qty, totalQty}>
// h: horizon (3/6/12)
// opts: { topN=30, onProgress, yieldEvery=5 }
// Return: { items: [...], longTail: {...} }
export async function forecastItemidBatch(itemSeriesMap, h, opts = {}) {
  const topN = opts.topN || 30;
  const yieldEvery = opts.yieldEvery || 5;
  const onProgress = opts.onProgress;

  // Tüm itemid'leri totalQty'ye göre sırala
  const allItems = [...itemSeriesMap.entries()].map(([pid, s]) => ({ pid, ...s }));
  allItems.sort((a, b) => b.totalQty - a.totalQty);

  const topItems = allItems.slice(0, topN);
  const tailItems = allItems.slice(topN);

  const items = [];
  let processedIdx = 0;

  for (const it of topItems) {
    processedIdx++;
    if (onProgress) onProgress(processedIdx, topItems.length, it.pid);

    const cls = classifySeries(it.qty);
    let fit = null;
    let isStable = cls.forecastable;

    if (isStable) {
      try {
        fit = selectBestFit(it.qty, h);
      } catch (e) {
        isStable = false;
        fit = null;
      }
    }

    // Son 12 ay & forecast h ay toplamları
    const last12 = sum(it.qty.slice(-12));
    let hAhead = null;
    if (fit && fit.bestId) {
      const best = fit.results.find(r => r.id === fit.bestId);
      if (best?.forecast?.point) hAhead = sum(best.forecast.point);
    }

    items.push({
      pid: it.pid,
      name: it.name || null,
      keys: it.keys,
      qty: it.qty,
      totalQty: it.totalQty,
      classification: cls,
      isStable,
      fit,
      last12,
      hAhead,
    });

    // Her N itemid'de UI yield (event loop bloklamamak için)
    if (processedIdx % yieldEvery === 0) {
      await new Promise(r => setTimeout(r, 0));
    }
  }

  // Uzun kuyruk: ham özet (tek tek forecast yok)
  const longTail = {
    count: tailItems.length,
    totalQty: tailItems.reduce((s, x) => s + x.totalQty, 0),
    last12: tailItems.reduce((s, x) => s + sum(x.qty.slice(-12)), 0),
    // Basit moving avg ile toplam tail forecast tahmini
    estimatedHAhead: null,
  };
  if (tailItems.length > 0) {
    // Tail toplamını ay bazında topla → tek bir tail-aggregate serisi → MA3
    const tailMonthMap = new Map();
    for (const t of tailItems) {
      for (let i = 0; i < t.keys.length; i++) {
        const k = t.keys[i];
        tailMonthMap.set(k, (tailMonthMap.get(k) || 0) + t.qty[i]);
      }
    }
    const tailKeys = [...tailMonthMap.keys()].sort();
    if (tailKeys.length >= 3) {
      const tailQty = tailKeys.map(k => tailMonthMap.get(k));
      try {
        const tailFc = forecastMovingAverage(tailQty, h, 3);
        longTail.estimatedHAhead = sum(tailFc.point);
      } catch (_) {}
    }
  }

  return { items, longTail, totalScanned: allItems.length };
}

// ─────────────── Bottom-up Reconciliation (Proportional) ─────────
// Σ(itemid forecasts) ≠ trader-total olduğunda, itemid forecast'larını
// pro-rata scale et: scaling factor = traderTotal / itemSum
export function reconcileItemForecasts(traderTotalForecast, itemForecasts) {
  if (!traderTotalForecast?.point || !Array.isArray(itemForecasts)) {
    return { items: itemForecasts || [], scalingFactor: 1, residualGap: 0 };
  }
  const traderTotal = sum(traderTotalForecast.point);
  let itemSum = 0;
  for (const it of itemForecasts) {
    if (it.hAhead != null) itemSum += it.hAhead;
  }
  if (itemSum <= 0) return { items: itemForecasts, scalingFactor: 1, residualGap: traderTotal };

  const sf = traderTotal / itemSum;
  const residualGap = traderTotal - itemSum;
  const items = itemForecasts.map(it => {
    if (it.hAhead == null || !it.fit) return { ...it, hAheadAdjusted: it.hAhead, scalingFactor: 1 };
    return {
      ...it,
      hAheadAdjusted: it.hAhead * sf,
      scalingFactor: sf,
    };
  });
  return { items, scalingFactor: sf, residualGap };
}

// ─────────────── Excel-friendly itemid × ay matrisi ──────────────
// items: forecastItemidBatch().items
// h: horizon
// mode: 'forecast' (sadece tahmin ay'ları) | 'history' (sadece geçmiş) | 'both'
export function buildItemMonthMatrix(items, h, mode = 'forecast') {
  const rows = [];
  const monthSet = new Set();

  for (const it of items) {
    const byMonth = {};
    if (mode === 'history' || mode === 'both') {
      for (let i = 0; i < it.keys.length; i++) {
        byMonth[it.keys[i]] = it.qty[i];
        monthSet.add(it.keys[i]);
      }
    }
    if ((mode === 'forecast' || mode === 'both') && it.fit && it.fit.bestId) {
      const best = it.fit.results.find(r => r.id === it.fit.bestId);
      if (best?.forecast?.point && it.keys.length > 0) {
        const lastKey = it.keys[it.keys.length - 1];
        for (let i = 0; i < h && i < best.forecast.point.length; i++) {
          const fkey = addMonths(lastKey, i + 1);
          byMonth[fkey] = best.forecast.point[i];
          monthSet.add(fkey);
        }
      }
    }
    rows.push({ pid: it.pid, byMonth, total: it.last12, hAhead: it.hAhead });
  }

  const months = [...monthSet].sort();
  return { rows, months };
}
