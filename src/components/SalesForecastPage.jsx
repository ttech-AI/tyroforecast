import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  AiBrain03Icon,
  AiAudioIcon,
  AiIdeaIcon,
  AiLaptopIcon,
  User03Icon,
  UserAccountIcon,
  UserGroup02Icon,
  CalendarAdd01Icon,
  WeightScale01Icon,
  Dollar02Icon,
  Cancel01Icon,
  Calendar03Icon,
  ChartLineData01Icon,
  TradeUpIcon,
  TradeDownIcon,
  PercentSquareIcon,
  FactoryIcon,
  PackageIcon,
  DeliveryTruck01Icon,
  Flowchart02Icon,
  MagicWand02Icon,
  Hexagon01Icon,
  Target02Icon,
  CalendarAnalysisIcon,
  ChartIncreaseIcon,
  CheckmarkBadge02Icon,
  CloudDownloadIcon,
  File02Icon,
  RotateClockwiseIcon,
  FlashIcon,
} from '@hugeicons/core-free-icons'
import { ChevronDown, ChevronUp, Info, Star } from 'lucide-react'
import {
  applyScenario,
  isBaseline,
} from '../lib/forecast/salesSimulation.js'
import {
  forecastHoltWinters,
  forecastSTLETS,
  forecastSTLETSOutlier,
  forecastTheta,
  forecastHoltLinear,
  forecastSeasonalNaive,
  forecastCroston,
  forecastMovingAverage,
} from '../lib/forecast/salesForecast.js'
import { useMsal } from '../lib/forecast/msalContext.jsx'
import {
  getDataverseToken,
  fetchTraderDirectory,
  fetchHistoricalAggregatesByTrader,
  fetchHistoricalSalesByTrader,
} from '../lib/forecast/dataverseService.js'
import {
  aggregateFromServer,
  aggregateMonthly,
  buildTraderProfile,
  buildTraderProfileFromAggregates,
  mapToSeries,
  selectBestFit,
  aggregateByItemid,
  forecastItemidBatch,
  reconcileItemForecasts,
  FORECAST_MODELS,
} from '../lib/forecast/salesForecast.js'
import { DEFAULT_SCENARIO } from '../lib/forecast/salesSimulation.js'
import { buildHomeSnapshot, writeHomeSnapshot } from '../lib/forecast/homeSnapshot.js'

// Cache key prefix — bump when payload shape changes
// v3: mergeCompanyAliases artık name'i preserve ediyor — eski v2 cache'inde
// şirket adı düşmüştü; bump ile invalidate ediliyor.
const CACHE_PREFIX = 'tyroforecast_fcst_v3'
const TRADER_CACHE_KEY = 'tyroforecast_traders_v1'

// Group code → ana şirket çözücüsü (DTHY → DANE merge'i salesForecast içinde)
function gGrp(code) {
  if (!code) return 'Diğer'
  const c = String(code).toUpperCase()
  if (c.startsWith('TI')) return 'TIRYAKI'
  if (c.startsWith('AS')) return 'ASYA'
  if (c.startsWith('DA') || c.startsWith('DT')) return 'DANE'
  if (c.startsWith('SS')) return 'SUNAR'
  return c.slice(0, 4) || 'Diğer'
}

const isTrdPrefix = (c) => /^(TRD|DNM)[-_A-Z0-9]*$/.test(String(c || '').toUpperCase())
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

export function SalesForecastPage() {
  const { account } = useMsal()

  // ─────────────────────────────────────────────────────────────────────────
  // Trader directory state
  // ─────────────────────────────────────────────────────────────────────────
  const [fcstTraderList, setFcstTraderList] = useState([])
  const [fcstAnaTraderList, setFcstAnaTraderList] = useState([])
  const [fcstTraderListLoading, setFcstTraderListLoading] = useState(false)

  // ─────────────────────────────────────────────────────────────────────────
  // Filter inputs
  // ─────────────────────────────────────────────────────────────────────────
  const [fcstTrader, setFcstTrader] = useState([])
  const [fcstAnaTrader, setFcstAnaTrader] = useState([])
  const [fcstHorizon, setFcstHorizon] = useState(12)
  const [fcstMetric, setFcstMetric] = useState('qty')

  // ─────────────────────────────────────────────────────────────────────────
  // Forecast result + status
  // ─────────────────────────────────────────────────────────────────────────
  const [fcstResult, setFcstResult] = useState(null)
  const [fcstLoading, setFcstLoading] = useState(false)
  const [fcstError, setFcstError] = useState('')
  const [, setFcstStatus] = useState('')
  const [fcstStep, setFcstStep] = useState(0)
  const [fcstStepData, setFcstStepData] = useState({})
  const [fcstActiveModel, setFcstActiveModel] = useState(null)

  // ─────────────────────────────────────────────────────────────────────────
  // Result view state (Phase 3 — itemid hierarchy, scenarios)
  // ─────────────────────────────────────────────────────────────────────────
  const [, setFcstChartView] = useState('total')
  const [fcstScenario] = useState(DEFAULT_SCENARIO)
  const [, setFcstScenarioResult] = useState(null)
  const fcstScenarioDebounceRef = useRef(null)

  // Sonuç view'i ile FilterPanel arasında köprü:
  // - showScenarios state'i parent'ta tutuyoruz ki FilterPanel'deki "Senaryo" butonu drawer'ı açıp kapatabilsin
  // - Export handler'ları ResultView'da hesaplanıyor (fit/activeResult vb. orada hazırlanıyor),
  //   parent bunlara ref üzerinden erişiyor.
  const [showScenarios, setShowScenarios] = useState(false)
  const [scenarioActive, setScenarioActive] = useState(false)
  const exportHandlersRef = useRef({ excel: null, pdf: null })

  // ─────────────────────────────────────────────────────────────────────────
  // Trader directory loader — cached for 24h
  // ─────────────────────────────────────────────────────────────────────────
  const loadFcstTraderList = useCallback(async () => {
    if (!account) return
    if ((fcstTraderList.length > 0 && fcstAnaTraderList.length > 0) || fcstTraderListLoading) return
    try {
      const cached = localStorage.getItem(TRADER_CACHE_KEY)
      if (cached) {
        const p = JSON.parse(cached)
        if (p && p.fetchedAt && Date.now() - p.fetchedAt < 86400000 && Array.isArray(p.list) && Array.isArray(p.anaList)) {
          setFcstTraderList(p.list)
          setFcstAnaTraderList(p.anaList)
          if (Array.isArray(p.directory)) window.__fcstTraderDirectory = p.directory
          return
        }
      }
    } catch (_) { /* cache parse hatası */ }
    setFcstTraderListLoading(true)
    try {
      const token = await getDataverseToken(account)
      const directory = await fetchTraderDirectory(token)
      window.__fcstTraderDirectory = directory
      const list = directory
        .filter((t) => isTrdPrefix(t.traderid))
        .map((t) => ({
          code: t.traderid,
          name: t.name,
          maintraderid: t.maintraderid,
          label: t.name ? `${t.traderid} : ${t.name}` : t.traderid,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, 'tr'))
      const dirByCode = new Map(directory.map((t) => [t.traderid, t.name]))
      const seen = new Set()
      const anaList = []
      for (const t of directory) {
        const mid = t.maintraderid
        if (!mid || !isTrdPrefix(mid) || seen.has(mid)) continue
        seen.add(mid)
        const mname = dirByCode.get(mid) || ''
        anaList.push({ code: mid, name: mname, label: mname ? `${mid} : ${mname}` : mid })
      }
      anaList.sort((a, b) => a.label.localeCompare(b.label, 'tr'))
      setFcstTraderList(list)
      setFcstAnaTraderList(anaList)
      try { localStorage.setItem(TRADER_CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), list, anaList, directory })) } catch (_) { /* quota */ }
    } catch (e) {
      console.warn('[Forecast] Trader list yüklenemedi:', e)
      setFcstError('Trader listesi yüklenemedi: ' + (e.message || String(e)))
    } finally {
      setFcstTraderListLoading(false)
    }
  }, [account, fcstTraderList.length, fcstAnaTraderList.length, fcstTraderListLoading])

  useEffect(() => {
    if (account) loadFcstTraderList()
  }, [account, loadFcstTraderList])

  // ─────────────────────────────────────────────────────────────────────────
  // runForecast — full pipeline (cache → fetch → models → backtest → result)
  // ─────────────────────────────────────────────────────────────────────────
  const runForecast = useCallback(async () => {
    const traders = Array.isArray(fcstTrader) ? fcstTrader : (fcstTrader ? [fcstTrader] : [])
    const anaTraders = Array.isArray(fcstAnaTrader) ? fcstAnaTrader : []
    const useAnaTrader = traders.length === 0 && anaTraders.length > 0

    let fetchCodes
    if (useAnaTrader) {
      const subCodes = fcstTraderList.filter((t) => anaTraders.includes(t.maintraderid)).map((t) => t.code)
      if (subCodes.length === 0) {
        setFcstError('Seçili ana trader(lar)a bağlı aktif alt trader bulunamadı.')
        return
      }
      fetchCodes = subCodes
    } else {
      fetchCodes = traders
    }
    if (fetchCodes.length === 0 || !account || fcstLoading) return

    setFcstLoading(true); setFcstError(''); setFcstStatus('')
    setFcstStep(1); setFcstStepData({}); setFcstResult(null)

    try {
      const filterField = useAnaTrader ? 'main' : 'trd'
      const anaSig = useAnaTrader ? [...anaTraders].sort().join('+') : ''
      const cacheKey = `${CACHE_PREFIX}_${filterField}_${useAnaTrader ? 'ana_' + anaSig : [...fetchCodes].sort().join('+')}`

      let aggMap = null, profile = null, valueAvailable = false, fromCache = false, recordCount = 0, fetchMode = 'aggregate'
      let itemmonthRows = null
      // Anasayfa KPI'ları için unique count'lar (her path'te set edilir)
      let uniqueProducts = 0, uniqueCustomers = 0, uniqueCompanies = 0

      // ─── Cache check ───
      try {
        const cached = localStorage.getItem(cacheKey)
        if (cached) {
          const p = JSON.parse(cached)
          if (p && p.fetchedAt && Date.now() - p.fetchedAt < 86400000) {
            aggMap = p.aggMap; profile = p.profile; valueAvailable = p.valueAvailable
            recordCount = p.recordCount || 0; fromCache = true; fetchMode = p.fetchMode || 'aggregate'
            itemmonthRows = p.itemmonthRows || null
            uniqueProducts = p.uniqueProducts || 0
            uniqueCustomers = p.uniqueCustomers || 0
            uniqueCompanies = p.uniqueCompanies || 0
            setFcstStepData((d) => ({ ...d, fetched: { count: recordCount, fromCache: true, mode: fetchMode } }))
          }
        }
      } catch (_) { /* cache parse */ }

      // ─── Step 1: Fetch ───
      if (!aggMap) {
        try {
          const agg = await fetchHistoricalAggregatesByTrader(account, fetchCodes, {
            onProgress: (loaded, total) =>
              setFcstStepData((d) => ({ ...d, fetched: { loaded, total, fromCache: false, mode: 'aggregate', scope: useAnaTrader ? 'ana' : 'trader', resolvedSubCount: fetchCodes.length } })),
          })
          aggMap = aggregateFromServer(agg.monthly)
          profile = buildTraderProfileFromAggregates(aggMap, agg.products, agg.accounts, agg.companies, gGrp)
          recordCount = agg.monthly.length
          // Anasayfa KPI'ları için: aggregate path tüm ürün/müşteri/şirket listesini döner
          uniqueProducts = agg.products?.length || 0
          uniqueCustomers = agg.accounts?.length || 0
          uniqueCompanies = agg.companies?.length || 0
          itemmonthRows = agg.itemmonth || []
          fetchMode = 'aggregate'
          valueAvailable = false
        } catch (aggErr) {
          console.warn('[Forecast] Aggregate fetch failed, raw fallback:', aggErr)
          fetchMode = 'raw'
          setFcstStepData((d) => ({ ...d, fetched: { loaded: 0, total: null, fromCache: false, mode: 'raw', scope: useAnaTrader ? 'ana' : 'trader', aggError: aggErr.message } }))
          const fetchRes = await fetchHistoricalSalesByTrader(account, fetchCodes, {
            onProgress: (loaded, total) =>
              setFcstStepData((d) => ({ ...d, fetched: { loaded, total, fromCache: false, mode: 'raw', scope: useAnaTrader ? 'ana' : 'trader' } })),
          })
          recordCount = fetchRes.records.length
          aggMap = aggregateMonthly(fetchRes.records, { valueField: fetchRes.valueField })
          profile = buildTraderProfile(fetchRes.records, gGrp, aggMap)
          valueAvailable = !!fetchRes.valueField
          // Anasayfa KPI'ları için: raw fallback'te Set ile tekil sayım
          {
            const pSet = new Set(), aSet = new Set(), cSet = new Set()
            for (const r of fetchRes.records) {
              if (r.mserp_productid) pSet.add(String(r.mserp_productid).trim())
              if (r.mserp_toaccountid) aSet.add(String(r.mserp_toaccountid).trim())
              if (r.mserp_salesdataareaid) cSet.add(String(r.mserp_salesdataareaid).trim().toUpperCase())
            }
            uniqueProducts = pSet.size
            uniqueCustomers = aSet.size
            uniqueCompanies = cSet.size
          }
          itemmonthRows = []
          for (const r of fetchRes.records) {
            const pid = String(r.mserp_productid || '').trim()
            const dt = r.mserp_shipdate ? new Date(r.mserp_shipdate) : null
            if (!pid || !dt || isNaN(dt)) continue
            itemmonthRows.push({
              pid,
              pname: r.mserp_tryitemname || null,
              yy: dt.getUTCFullYear(),
              ym: dt.getUTCMonth() + 1,
              qty: Number(r.mserp_quantity) || 0,
            })
          }
        }
        try {
          localStorage.setItem(cacheKey, JSON.stringify({
            fetchedAt: Date.now(), aggMap, profile, valueAvailable, recordCount, fetchMode, itemmonthRows,
            uniqueProducts, uniqueCustomers, uniqueCompanies,
          }))
        } catch (_) { /* quota — silent */ }
      }

      // ─── Step 2: Aggregate ───
      setFcstStep(2); await wait(120)
      setFcstStepData((d) => ({ ...d, aggregate: { months: Object.keys(aggMap).length, records: recordCount } }))

      // ─── Step 3: Trader-total models (8 models progressive) ───
      setFcstStep(3); await wait(160)
      const series = mapToSeries(aggMap)
      const modelOrder = ['Holt-Winters', 'Outlier STL+ETS', 'Theta', "Holt's Linear", 'STL+ETS', 'Seasonal Naive', 'Croston', 'Moving Avg']
      for (const m of modelOrder) {
        setFcstStepData((d) => ({ ...d, modelsRunning: m })); await wait(50)
      }
      const fitQty = selectBestFit(series.qty, fcstHorizon)
      let fitValue = null
      if (series.valueAvailable && series.value) {
        fitValue = selectBestFit(series.value, fcstHorizon)
      }

      // ─── Step 4: Itemid batch ───
      setFcstStep(4); await wait(140)
      let itemForecasts = []
      let itemLongTail = null
      let itemReconcile = null
      if (itemmonthRows && itemmonthRows.length > 0) {
        try {
          const itemMap = aggregateByItemid(itemmonthRows)
          setFcstStepData((d) => ({ ...d, itemBatch: { total: itemMap.size, processed: 0 } }))
          const batch = await forecastItemidBatch(itemMap, fcstHorizon, {
            topN: 30,
            onProgress: (processed, total, pid) =>
              setFcstStepData((d) => ({ ...d, itemBatch: { total, processed, currentPid: pid } })),
          })
          itemForecasts = batch.items
          itemLongTail = batch.longTail
          const traderTotalFc = fitQty?.results?.find((r) => r.id === fitQty.bestId)?.forecast
          if (traderTotalFc) {
            const rec = reconcileItemForecasts(traderTotalFc, itemForecasts)
            itemForecasts = rec.items
            itemReconcile = { scalingFactor: rec.scalingFactor, residualGap: rec.residualGap }
          }
        } catch (itemErr) {
          console.warn('[Forecast] Itemid batch failed:', itemErr)
        }
      }

      // ─── Step 5: Backtest MAPE ───
      setFcstStepData((d) => ({ ...d, backtest: { models: fitQty.results.filter((r) => !r.skipped).length } }))
      setFcstStep(5); await wait(150)

      // ─── Step 6: Best fit ───
      setFcstStepData((d) => ({ ...d, bestFit: { id: fitQty.bestId, mape: fitQty.results.find((r) => r.id === fitQty.bestId)?.mape } }))
      setFcstStep(6); await wait(200)
      setFcstStep(7)

      const displayCodes = useAnaTrader ? anaTraders : fetchCodes
      const subTraders = useAnaTrader
        ? fetchCodes.map((c) => { const t = fcstTraderList.find((x) => x.code === c); return { code: c, name: t?.name || c } })
        : null
      // Code → display name lookup (single-trader başlığında "TRD-TME • Adı Soyadı"
      // gösterimi için). Ana-trader senaryosunda anaTraders kodları,
      // alt-trader senaryosunda fetchCodes kodlarına bakılır.
      const displayNames = displayCodes.map((c) => {
        const t = fcstTraderList.find((x) => x.code === c)
        return t?.name || null
      })

      const nextResult = {
        series, profile, fitQty, fitValue, valueAvailable,
        traderCode: displayCodes.length === 1 ? displayCodes[0] : displayCodes.join('+'),
        traderCodes: fetchCodes, displayCodes, displayNames,
        resolvedSubCount: fetchCodes.length, subTraders,
        filterScope: useAnaTrader ? 'ana' : 'trader',
        horizon: fcstHorizon, fetchedAt: Date.now(), fromCache, recordCount,
        uniqueProducts, uniqueCustomers, uniqueCompanies,
        itemForecasts, itemLongTail, itemReconcile,
      }
      setFcstResult(nextResult)
      // Anasayfa snapshot — executive dashboard'ı bu trader sonucuyla doldur
      try {
        const snap = buildHomeSnapshot({ result: nextResult, uniqueProducts, uniqueCustomers, uniqueCompanies })
        writeHomeSnapshot(snap)
      } catch (snapErr) {
        console.warn('[HomeSnapshot] write failed', snapErr)
      }
      setFcstChartView('total')
      setFcstActiveModel(null)
      await wait(300)
      setFcstStep(0)
    } catch (e) {
      console.error('[Forecast] runForecast failed', e)
      setFcstError(e.message || 'Tahmin hesaplanamadı')
      setFcstStatus('')
      setFcstStep(0)
    } finally {
      setFcstLoading(false)
    }
  }, [fcstTrader, fcstAnaTrader, fcstHorizon, fcstTraderList, account, fcstLoading])

  // ─────────────────────────────────────────────────────────────────────────
  // Scenario reactive recompute (Phase 5 will fully wire the drawer)
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!fcstResult) { setFcstScenarioResult(null); return }
    // Phase 5: applyScenario debounced
    return () => { if (fcstScenarioDebounceRef.current) clearTimeout(fcstScenarioDebounceRef.current) }
  }, [fcstScenario, fcstResult])

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <FilterPanel
        fcstTraderList={fcstTraderList}
        fcstAnaTraderList={fcstAnaTraderList}
        fcstTraderListLoading={fcstTraderListLoading}
        fcstTrader={fcstTrader} setFcstTrader={setFcstTrader}
        fcstAnaTrader={fcstAnaTrader} setFcstAnaTrader={setFcstAnaTrader}
        fcstHorizon={fcstHorizon} setFcstHorizon={setFcstHorizon}
        fcstMetric={fcstMetric} setFcstMetric={setFcstMetric}
        runForecast={runForecast}
        fcstLoading={fcstLoading}
        hasResult={!!fcstResult}
        scenarioActive={scenarioActive}
        onScenarioToggle={() => setShowScenarios((v) => !v)}
        onExportExcel={() => exportHandlersRef.current.excel?.()}
        onExportPDF={() => exportHandlersRef.current.pdf?.()}
      />

      {fcstError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">
          <strong>Hata:</strong> {fcstError}
        </div>
      )}

      {fcstLoading && <AiLoader step={fcstStep} stepData={fcstStepData} horizon={fcstHorizon} />}

      {!fcstResult && !fcstLoading && !fcstError && <EmptyState />}

      {fcstResult && !fcstLoading && (
        <ResultView
          result={fcstResult}
          fcstMetric={fcstMetric}
          activeModelId={fcstActiveModel}
          onSelectModel={setFcstActiveModel}
          showScenarios={showScenarios}
          setShowScenarios={setShowScenarios}
          onScenarioActiveChange={setScenarioActive}
          exportHandlersRef={exportHandlersRef}
        />
      )}
    </div>
  )
}

// Model id → forecast function mapping (for Monte Carlo)
const MODEL_FN_MAP = {
  hw: forecastHoltWinters,
  stl: forecastSTLETS,
  stlOut: forecastSTLETSOutlier,
  theta: forecastTheta,
  holtLin: forecastHoltLinear,
  snaive: forecastSeasonalNaive,
  croston: forecastCroston,
  ma3: forecastMovingAverage,
}

// ════════════════════════════════════════════════════════════════════════════
// ResultView — orchestrator (profile + tabs + KPI + chart + Phase 4-5-6)
// ════════════════════════════════════════════════════════════════════════════
function ResultView({
  result, fcstMetric, activeModelId, onSelectModel,
  showScenarios, setShowScenarios,
  onScenarioActiveChange, exportHandlersRef,
}) {
  // ─── Derived state ───
  const useValue = fcstMetric === 'value' && result.valueAvailable && result.fitValue
  const fit = useValue ? result.fitValue : result.fitQty
  const activeId = activeModelId && fit.results.find((r) => r.id === activeModelId) ? activeModelId : fit.bestId
  const activeResult = fit.results.find((r) => r.id === activeId) || fit.results.find((r) => r.id === fit.bestId)

  const histArr = useValue ? result.series.value || [] : result.series.qty
  const histKeys = result.series.keys || []
  const lastHistKey = histKeys[histKeys.length - 1] || ''
  const forecast = activeResult?.forecast || { point: [], lower: [], upper: [] }
  const forecastKeys = useMemo(() => {
    if (!lastHistKey) return []
    const [yy, mm] = lastHistKey.split('-').map(Number)
    return Array.from({ length: forecast.point.length }, (_, i) => {
      const d = new Date(Date.UTC(yy, (mm - 1) + 1 + i, 1))
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    })
  }, [lastHistKey, forecast.point.length])

  const horizon = result.horizon || 12
  const histLast12 = histArr.slice(-12)
  const histTotal = histLast12.reduce((a, b) => a + (b || 0), 0)
  const fcTotal = forecast.point.reduce((a, b) => a + (b || 0), 0)
  const monthlyAvg = horizon > 0 ? fcTotal / horizon : 0
  const trendPct = histTotal > 0 ? ((fcTotal - histTotal * horizon / 12) / (histTotal * horizon / 12)) * 100 : null
  const mape = activeResult?.mape

  // ─── Phase 5: Scenario state + reactive recompute ───
  // showScenarios artık parent'tan kontrol ediliyor (FilterPanel'deki Senaryo butonu için).
  const [scenario, setScenario] = useState(DEFAULT_SCENARIO)
  const [scenarioResult, setScenarioResult] = useState(null)
  const debounceRef = useRef(null)

  // ─── Chart view: 'total' veya item pid ───
  // Gelişmiş Filtre butonu chart'ın header'ında; seçim sadece ForecastChart'ı değiştirir,
  // KPI/MonthlyDetail/ModelComparison/MiniInsights trader-total üzerinde kalır.
  const [chartView, setChartView] = useState('total')
  const chartData = useMemo(() => {
    if (chartView === 'total' || !result.itemForecasts) {
      return {
        viewLabel: null,
        chartHistArr: histArr,
        chartHistKeys: histKeys,
        chartForecast: forecast,
        chartActiveResult: activeResult,
        chartForecastKeys: forecastKeys,
      }
    }
    const item = result.itemForecasts.find((it) => it.pid === chartView)
    if (!item) {
      return {
        viewLabel: null,
        chartHistArr: histArr,
        chartHistKeys: histKeys,
        chartForecast: forecast,
        chartActiveResult: activeResult,
        chartForecastKeys: forecastKeys,
      }
    }
    const itemFit = item.fit
    const itemActive = itemFit?.results?.find((r) => r.id === itemFit?.bestId)
    const itemHistKeys = item.keys || []
    const itemLastKey = itemHistKeys[itemHistKeys.length - 1] || ''
    const itemFcPts = itemActive?.forecast?.point || []
    const itemFcKeys = itemLastKey
      ? Array.from({ length: itemFcPts.length }, (_, i) => {
          const [yy, mm] = itemLastKey.split('-').map(Number)
          const d = new Date(Date.UTC(yy, (mm - 1) + 1 + i, 1))
          return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
        })
      : []
    return {
      viewLabel: `${item.pid}${item.name ? ' • ' + item.name : ''}`,
      chartHistArr: item.qty || [],
      chartHistKeys: itemHistKeys,
      chartForecast: itemActive?.forecast || { point: [], lower: [], upper: [] },
      chartActiveResult: itemActive,
      chartForecastKeys: itemFcKeys,
    }
  }, [chartView, result, histArr, histKeys, forecast, activeResult, forecastKeys])

  useEffect(() => {
    if (!result || isBaseline(scenario)) {
      setScenarioResult(null)
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      try {
        const baseSeries = useValue ? result.series.value : result.series.qty
        const mcFn = MODEL_FN_MAP[activeId] || forecastHoltWinters
        const sr = applyScenario(forecast, fit, result.profile, scenario, baseSeries, horizon, {
          runMC: scenario.showMC,
          mcModelFn: mcFn,
          mcSeries: baseSeries,
          mcH: horizon,
          mcNSim: 200,
        })
        setScenarioResult(sr)
      } catch (err) {
        console.warn('[Scenario] applyScenario failed:', err)
        setScenarioResult(null)
      }
    }, 300)
    return () => debounceRef.current && clearTimeout(debounceRef.current)
  }, [scenario, result, useValue, activeId, forecast, fit, horizon])

  // ─── Phase 6: Export ───
  const handleExportExcel = useCallback(() => {
    exportExcel({ result, fit, activeResult, fcstMetric, useValue, histLast12, histKeys, forecastKeys, forecast, scenarioResult })
  }, [result, fit, activeResult, fcstMetric, useValue, histLast12, histKeys, forecastKeys, forecast, scenarioResult])

  const handleExportPDF = useCallback(() => {
    exportPDF({ result, fit, activeResult, fcstMetric, useValue, histLast12, histKeys, forecastKeys, forecast, scenarioResult, monthlyAvg, fcTotal, horizon, trendPct, mape })
  }, [result, fit, activeResult, fcstMetric, useValue, histLast12, histKeys, forecastKeys, forecast, scenarioResult, monthlyAvg, fcTotal, horizon, trendPct, mape])

  // Export handler'larını parent ref'ine bağla — FilterPanel'deki Excel/PDF butonları buradan çağırıyor
  useEffect(() => {
    if (!exportHandlersRef) return
    exportHandlersRef.current = { excel: handleExportExcel, pdf: handleExportPDF }
    return () => { if (exportHandlersRef.current) exportHandlersRef.current = { excel: null, pdf: null } }
  }, [exportHandlersRef, handleExportExcel, handleExportPDF])

  // Senaryo aktiflik durumunu parent'a bildir (FilterPanel'deki Senaryo butonu stilini etkiler)
  useEffect(() => {
    onScenarioActiveChange?.(!!scenarioResult)
  }, [scenarioResult, onScenarioActiveChange])

  return (
    <div className="space-y-4">
      <TraderProfileCard result={result} histLast12={histLast12} />

      <ModelTabs fit={fit} activeId={activeId} onSelect={onSelectModel} />

      <KpiCards
        monthlyAvg={monthlyAvg}
        fcTotal={fcTotal}
        horizon={horizon}
        trendPct={trendPct}
        mape={mape}
        useValue={useValue}
        scenarioResult={scenarioResult}
      />

      <ForecastChart
        histArr={chartData.chartHistArr.slice(-12)}
        histKeys={chartData.chartHistKeys.slice(-12)}
        forecastPts={chartData.chartForecast.point || []}
        forecastLow={chartData.chartForecast.lower}
        forecastUp={chartData.chartForecast.upper}
        forecastKeys={chartData.chartForecastKeys}
        activeResult={chartData.chartActiveResult || activeResult}
        useValue={useValue}
        scenarioResult={chartView === 'total' ? scenarioResult : null}
        items={result.itemForecasts || []}
        chartView={chartView}
        viewLabel={chartData.viewLabel}
        onChartViewChange={setChartView}
      />

      <MiniInsights
        histArr={histArr}
        histKeys={histKeys}
        mape={mape}
        useValue={useValue}
      />

      <ItemForecastTable
        result={result}
        useValue={useValue}
        horizon={horizon}
        chartView={chartView}
        onItemClick={setChartView}
      />

      <MonthlyDetailTable
        forecastKeys={forecastKeys}
        forecastPts={forecast.point}
        forecastLow={forecast.lower}
        forecastUp={forecast.upper}
        histArr={histArr}
        histKeys={histKeys}
        useValue={useValue}
      />

      <ModelComparisonTable fit={fit} histKeys={histKeys} />

      {/* Phase 5: Scenario drawer */}
      <ScenarioDrawer
        open={showScenarios}
        onClose={() => setShowScenarios(false)}
        scenario={scenario}
        setScenario={setScenario}
        scenarioResult={scenarioResult}
        profile={result.profile}
        useValue={useValue}
      />
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// TraderProfileCard — Premium hero + 3 stat cards + 3 ranked top cards
// Reference: TYRO-WMSAgent App.jsx (emerald-aurora) → Clay theme (navy+orange)
// ════════════════════════════════════════════════════════════════════════════
function TraderProfileCard({ result, histLast12 }) {
  // Alt trader hover tooltip (position:fixed; overflow:hidden parent kartlardan kurtulur)
  const [subTip, setSubTip] = useState(null)

  const profile = result.profile || {}
  const isAnaScope = result.filterScope === 'ana'
  const hasSubInfo = isAnaScope && Array.isArray(result.subTraders) && result.subTraders.length > 0
  const intermittence = Number(profile.intermittenceIndex || 0)
  const yoy = profile.yoy
  const last12Total = histLast12.reduce((a, b) => a + (b || 0), 0)

  // Header: tek-trader → directory adı, çoklu → "N Trader Birleşik"
  const codes = result.displayCodes || []
  const names = result.displayNames || []
  const isMulti = codes.length > 1
  const singleCode = !isMulti ? codes[0] : null
  const singleName = !isMulti ? names[0] : null
  const scopeLabel = isAnaScope ? 'Ana Trader' : 'Trader'
  const headerName = isMulti
    ? `${codes.length} ${scopeLabel} Birleşik`
    : (singleName || singleCode || '—')

  // Subtitle: kod + scope etiketi (+ alt-trader hyperlink ana scope'ta)
  const subPrefix = isMulti
    ? codes.join(' · ')
    : `${singleCode || ''}${isAnaScope ? ' (Ana Trader)' : (profile.mainGroup ? ' · ' + profile.mainGroup : '')}`

  const showSubTip = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const tipW = 320
    let x = r.left
    if (x + tipW > window.innerWidth - 12) x = Math.max(12, window.innerWidth - tipW - 12)
    setSubTip({ x, y: r.bottom + 6 })
  }
  const hideSubTip = () => setSubTip(null)

  // Top 3 per dimension (gerekirse total fallback)
  const topCompanies = (profile.topCompanies || []).slice(0, 3)
  const topProducts = (profile.topProducts || []).slice(0, 3)
  const topDestinations = (profile.topDestinations || profile.topAccounts || []).slice(0, 3)

  // Karakter rozeti (intermittence index'e göre premium gradient pill)
  const charTone = (() => {
    if (intermittence >= 0.85) {
      return {
        label: 'Stabil aylık akış',
        text: '#047857',
        bg: 'linear-gradient(135deg, rgba(16,185,129,.14), rgba(4,120,87,.06))',
        border: 'rgba(4,120,87,.22)',
      }
    }
    if (intermittence >= 0.6) {
      return {
        label: 'Düzensiz akış',
        text: '#92400e',
        bg: 'linear-gradient(135deg, rgba(240,122,35,.14), rgba(234,88,12,.06))',
        border: 'rgba(240,122,35,.30)',
      }
    }
    return {
      label: 'Lumpy / fasılalı',
      text: '#be123c',
      bg: 'linear-gradient(135deg, rgba(244,63,94,.14), rgba(244,63,94,.06))',
      border: 'rgba(244,63,94,.25)',
    }
  })()

  return (
    <section className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.10)]">
      {/* Üst gradient şerit */}
      <div
        aria-hidden="true"
        className="h-[3px]"
        style={{ background: 'linear-gradient(90deg, #0a3d8f 0%, #3b82f6 50%, #f07a23 100%)' }}
      />

      {/* HERO HEADER — glassmorphism + 48px gradient ikon */}
      <div
        className="flex flex-wrap items-center gap-3.5 border-b border-border px-5 py-4 md:px-6"
        style={{
          background:
            'linear-gradient(135deg, rgba(10,61,143,.05) 0%, rgba(59,130,246,.04) 50%, rgba(240,122,35,.05) 100%)',
        }}
      >
        <div
          className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-white"
          style={{
            background: 'linear-gradient(135deg, #0a3d8f 0%, #3b82f6 55%, #f07a23 100%)',
            boxShadow:
              '0 6px 18px rgba(10,61,143,.32), 0 2px 6px rgba(10,61,143,.22), inset 0 1px 0 rgba(255,255,255,.22)',
          }}
        >
          <HugeiconsIcon icon={UserAccountIcon} size={24} strokeWidth={1.7} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[17px] font-bold leading-tight tracking-tight text-foreground">
            {headerName}
          </h2>
          <div className="mt-1 text-[12px] font-medium text-muted-foreground">
            <span>{subPrefix}</span>
            {hasSubInfo && (
              <>
                <span> · </span>
                <span
                  className="cursor-help border-b border-dotted font-bold transition-colors"
                  style={{ color: '#3b82f6', borderColor: '#3b82f6' }}
                  onMouseEnter={showSubTip}
                  onMouseLeave={hideSubTip}
                  onFocus={showSubTip}
                  onBlur={hideSubTip}
                  tabIndex={0}
                >
                  {result.resolvedSubCount} alt trader satışı dahil
                </span>
              </>
            )}
          </div>
        </div>
        {/* Karakter rozeti — intermittence index açıklama tooltip ile */}
        <span
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11.5px] font-bold tracking-tight shadow-sm"
          style={{ background: charTone.bg, borderColor: charTone.border, color: charTone.text }}
        >
          <HugeiconsIcon icon={FlashIcon} size={12} strokeWidth={2.2} />
          {charTone.label}
          <InfoTip
            title="Aktivite Karakteri"
            desc="Trader'ın satış akışının düzenlilik derecesi. Geçmiş veride satış yapılan ayların yüzdesine bakılır."
            whenToUse="Stabil akış → klasik modeller (HW, Theta) iyi çalışır. Lumpy akış → Croston tercih edilir, klasik modeller yanıltıcı olur."
            detail={`Intermittence index = ${(intermittence * 100).toFixed(0)}%. ≥85% Stabil · 60-85% Düzensiz · <60% Lumpy/fasılalı.`}
            iconSize={10}
          />
        </span>
      </div>

      {/* PERFORMANS ÖZETİ — 3 stat kartı (ikon arka planı yok, inline accent) */}
      <div className="grid grid-cols-1 gap-3.5 px-5 py-4 sm:grid-cols-3 md:px-6">
        <PremiumStat
          icon={ChartLineData01Icon}
          iconColor="#0a3d8f"
          label="Son 12 Ay Toplam"
          value={fmtTon(last12Total)}
          sub="fiili veri"
        />
        <PremiumStat
          icon={yoy == null ? ChartLineData01Icon : yoy >= 0 ? TradeUpIcon : TradeDownIcon}
          iconColor={yoy == null ? '#64748b' : yoy >= 0 ? '#047857' : '#be123c'}
          label="YoY Değişim"
          value={yoy == null ? '—' : `${yoy >= 0 ? '+' : ''}${yoy.toFixed(1)}%`}
          valueColor={yoy == null ? undefined : yoy >= 0 ? '#047857' : '#be123c'}
          sub="Önceki 12 ay vs son 12 ay"
        />
        <PremiumStat
          icon={FlashIcon}
          iconColor="#f07a23"
          label="Aktivite (Süreklilik)"
          value={`${Math.round(intermittence * 100)}%`}
          sub={
            intermittence >= 0.85
              ? 'stabil aylık akış'
              : intermittence >= 0.6
              ? 'düzensiz akış'
              : 'lumpy / fasılalı'
          }
        />
      </div>

      {/* TOP CARDS — 3 ayrı premium kart, ranked progress bar */}
      <div className="grid grid-cols-1 gap-3 px-5 pb-5 md:grid-cols-3 md:px-6 md:pb-6">
        <TopBreakdown icon={FactoryIcon} accent="#0a3d8f" title="Top Şirketler" items={topCompanies} />
        <TopBreakdown icon={PackageIcon} accent="#f07a23" title="Top Ürünler" items={topProducts} />
        <TopBreakdown icon={DeliveryTruck01Icon} accent="#8b5cf6" title="Top Müşteriler / Destinasyonlar" items={topDestinations} />
      </div>

      {/* Alt-trader hover tooltip — position:fixed (parent overflow:hidden bypass) */}
      {subTip && hasSubInfo && (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-[9999] overflow-y-auto rounded-lg px-3 py-2.5 text-[11px] font-medium text-white shadow-[0_8px_24px_rgba(0,0,0,0.30)]"
          style={{
            left: subTip.x,
            top: subTip.y,
            minWidth: 240,
            maxWidth: 320,
            maxHeight: 320,
            background: '#1f2937',
          }}
        >
          <div className="mb-1.5 border-b border-white/15 pb-1.5 text-[9px] font-extrabold uppercase tracking-wider opacity-70">
            Dahil edilen alt trader{result.subTraders.length > 1 ? 'lar' : ''} ({result.subTraders.length})
          </div>
          <div className="flex flex-col gap-1.5">
            {result.subTraders.map((st) => (
              <div key={st.code} className="flex items-baseline gap-2">
                <span className="shrink-0 text-[10.5px] font-bold text-sky-300" style={{ minWidth: 64 }}>
                  {st.code}
                </span>
                <span className="break-words font-semibold text-slate-100">{st.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Global stil sabitleri — kart yumuşaklığı, yumuşak gölgeler, soft border'lar
// ════════════════════════════════════════════════════════════════════════════
const SECTION_CARD = 'overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.10)]'
const SOFT_CARD = 'rounded-xl border border-border/55 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.03),0_4px_12px_-6px_rgba(15,23,42,0.08)]'

// ════════════════════════════════════════════════════════════════════════════
// InfoTip — premium hover tooltip; kompleks terimleri (MAPE, R², Reconcile,
// Intermittence, Monte Carlo) anlaşılır kılmak için kullanılır.
// Yapı:
//   - title (büyük başlık)
//   - desc (ana açıklama — son kullanıcıya yönelik)
//   - whenToUse (opsiyonel "Ne zaman?" highlight box)
//   - detail (opsiyonel teknik detay, daha küçük + ayraçla ayrılmış)
//   - formula (opsiyonel monospace formül kutusu)
// position:fixed → overflow:hidden parent kartlardan kurtulur, viewport clamp.
// ════════════════════════════════════════════════════════════════════════════
function InfoTip({ title, desc, whenToUse, detail, formula, placement = 'top', iconSize = 11, asChild = false }) {
  const [pos, setPos] = useState(null)
  const triggerRef = useRef(null)
  const TIP_W = 340
  const TIP_H = (detail ? 60 : 0) + (whenToUse ? 50 : 0) + (formula ? 40 : 0) + 100

  const show = () => {
    if (!triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let x = r.left + r.width / 2
    if (x - TIP_W / 2 < 10) x = 10 + TIP_W / 2
    if (x + TIP_W / 2 > vw - 10) x = vw - 10 - TIP_W / 2
    let y, anchor
    const wantTop = placement === 'top'
    const fitsTop = r.top - TIP_H - 12 > 0
    const fitsBottom = r.bottom + TIP_H + 12 < vh
    if (wantTop && fitsTop) { y = r.top - 8; anchor = 'top' }
    else if (fitsBottom) { y = r.bottom + 8; anchor = 'bottom' }
    else if (fitsTop) { y = r.top - 8; anchor = 'top' }
    else { y = Math.max(10, r.top - 8); anchor = 'top' }
    setPos({ x, y, anchor })
  }
  const hide = () => setPos(null)

  return (
    <span
      ref={triggerRef}
      className={asChild ? 'contents' : 'inline-flex shrink-0 items-center'}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      tabIndex={0}
      aria-label={title}
    >
      {!asChild && <Info size={iconSize} className="cursor-help text-foreground/40 transition-colors hover:text-foreground/70" />}
      {pos && typeof document !== 'undefined' && createPortal(
        <div
          role="tooltip"
          className="pointer-events-none"
          style={{
            position: 'fixed',
            left: pos.x,
            top: pos.y,
            transform: 'translateX(-50%)' + (pos.anchor === 'top' ? ' translateY(-100%)' : ''),
            zIndex: 9999,
            minWidth: 260,
            maxWidth: TIP_W,
            background: 'linear-gradient(180deg, #1e293b, #0f172a)',
            color: '#fff',
            borderRadius: 12,
            padding: '12px 14px 11px',
            boxShadow: '0 16px 40px rgba(0,0,0,.32), 0 4px 14px rgba(0,0,0,.18), inset 0 1px 0 rgba(255,255,255,.06)',
            border: '1px solid rgba(148,163,184,.18)',
          }}
        >
          {/* Title */}
          <div className="mb-1 text-[12.5px] font-extrabold tracking-tight text-white">{title}</div>
          {/* Main user-friendly description */}
          <div className="text-[11.5px] leading-relaxed text-slate-200">{desc}</div>
          {/* When-to-use highlight */}
          {whenToUse && (
            <div
              className="mt-2 rounded-md px-2.5 py-1.5 text-[11px] leading-relaxed"
              style={{
                background: 'linear-gradient(135deg, rgba(59,130,246,.16), rgba(99,102,241,.10))',
                border: '1px solid rgba(59,130,246,.22)',
                color: '#bfdbfe',
              }}
            >
              <span className="font-bold text-sky-200">Ne zaman? </span>
              <span>{whenToUse}</span>
            </div>
          )}
          {/* Technical detail — secondary */}
          {detail && (
            <div className="mt-2 border-t border-white/8 pt-2 text-[10.5px] leading-relaxed text-slate-400">
              <span className="font-semibold uppercase tracking-wider text-slate-500">Detay </span>
              <span className="ml-1">{detail}</span>
            </div>
          )}
          {/* Formula */}
          {formula && (
            <div
              className="mt-1.5 rounded bg-white/5 px-2 py-1 text-[10.5px] text-slate-300"
              style={{ fontFamily: 'Consolas, "Courier New", monospace' }}
            >
              {formula}
            </div>
          )}
        </div>,
        document.body
      )}
    </span>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// ModelInfoTip — Tahmin Modeli sekme tooltip'i için zengin varyant.
// WMS pattern'inden esinlenerek model'in label/short/desc/strength/weakness/
// whenToUse/formula içeriklerini düzenli bir kartta gösterir.
// ════════════════════════════════════════════════════════════════════════════
function ModelInfoTip({ meta, mape, isBest }) {
  const [pos, setPos] = useState(null)
  const triggerRef = useRef(null)
  const TIP_W = 380

  const show = () => {
    if (!triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const TIP_H = 320
    let x = r.left + r.width / 2
    if (x - TIP_W / 2 < 10) x = 10 + TIP_W / 2
    if (x + TIP_W / 2 > vw - 10) x = vw - 10 - TIP_W / 2
    let y, anchor
    const fitsTop = r.top - TIP_H - 12 > 0
    const fitsBottom = r.bottom + TIP_H + 12 < vh
    if (fitsTop) { y = r.top - 8; anchor = 'top' }
    else if (fitsBottom) { y = r.bottom + 8; anchor = 'bottom' }
    else { y = Math.max(10, r.top - 8); anchor = 'top' }
    setPos({ x, y, anchor })
  }
  const hide = () => setPos(null)

  if (!meta) return null

  return (
    <span
      ref={triggerRef}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      tabIndex={0}
      aria-label={meta.label}
      className="inline-flex"
    >
      <Info size={11} className="text-current opacity-60" />
      {pos && typeof document !== 'undefined' && createPortal(
        <div
          role="tooltip"
          className="pointer-events-none"
          style={{
            position: 'fixed',
            left: pos.x,
            top: pos.y,
            transform: 'translateX(-50%)' + (pos.anchor === 'top' ? ' translateY(-100%)' : ''),
            zIndex: 9999,
            width: TIP_W,
            maxWidth: 'calc(100vw - 24px)',
            background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
            color: '#fff',
            borderRadius: 14,
            boxShadow: '0 18px 48px rgba(0,0,0,.36), 0 6px 16px rgba(0,0,0,.20), inset 0 1px 0 rgba(255,255,255,.06)',
            border: '1px solid rgba(148,163,184,.18)',
            overflow: 'hidden',
          }}
        >
          {/* Üst gradient şerit + title row */}
          <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, #3b82f6, #8b5cf6, #f07a23)' }} />
          <div
            className="flex items-start gap-2.5 px-4 py-3"
            style={{ background: 'linear-gradient(135deg, rgba(59,130,246,.10), rgba(139,92,246,.05))' }}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[13.5px] font-extrabold tracking-tight text-white">{meta.label}</span>
                {isBest && (
                  <span
                    className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-amber-50"
                    style={{ background: 'linear-gradient(135deg, #fbbf24, #d97706)' }}
                  >
                    <Star className="h-2.5 w-2.5 fill-current" strokeWidth={0} /> Best
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-[11px] font-medium text-slate-300">{meta.short}</div>
            </div>
            {mape != null && (
              <div
                className="shrink-0 rounded-md px-2 py-1 text-[11px] font-extrabold tabular-nums"
                style={{
                  background: mape < 10 ? 'rgba(16,185,129,.16)' : mape < 20 ? 'rgba(245,158,11,.16)' : 'rgba(244,63,94,.16)',
                  color: mape < 10 ? '#6ee7b7' : mape < 20 ? '#fcd34d' : '#fda4af',
                }}
              >
                MAPE %{mape.toFixed(1)}
              </div>
            )}
          </div>

          {/* User-facing body */}
          <div className="space-y-2.5 px-4 py-3">
            <div className="text-[11.5px] leading-relaxed text-slate-200">{meta.description}</div>

            {/* Ne zaman kullanılır — highlight kutu */}
            <div
              className="rounded-md px-2.5 py-2 text-[11px] leading-relaxed"
              style={{
                background: 'linear-gradient(135deg, rgba(59,130,246,.14), rgba(99,102,241,.08))',
                border: '1px solid rgba(59,130,246,.22)',
                color: '#bfdbfe',
              }}
            >
              <div className="mb-0.5 text-[9.5px] font-extrabold uppercase tracking-wider text-sky-300">Ne zaman kullanılır?</div>
              <div>{meta.whenToUse}</div>
            </div>

            {/* Güçlü / Zayıf yönler */}
            <div className="grid grid-cols-1 gap-1.5">
              <div
                className="rounded-md px-2 py-1.5 text-[10.5px] leading-relaxed"
                style={{ background: 'rgba(16,185,129,.10)', border: '1px solid rgba(16,185,129,.18)', color: '#a7f3d0' }}
              >
                <span className="font-extrabold text-emerald-300">✓ Güçlü yön: </span>
                <span>{meta.strength}</span>
              </div>
              <div
                className="rounded-md px-2 py-1.5 text-[10.5px] leading-relaxed"
                style={{ background: 'rgba(244,63,94,.08)', border: '1px solid rgba(244,63,94,.18)', color: '#fecaca' }}
              >
                <span className="font-extrabold text-rose-300">✗ Zayıf yön: </span>
                <span>{meta.weakness}</span>
              </div>
            </div>

            {/* Formula (en altta, teknik) */}
            {meta.formula && (
              <div className="border-t border-white/8 pt-2">
                <div className="mb-1 text-[9.5px] font-extrabold uppercase tracking-wider text-slate-500">Formül</div>
                <div
                  className="rounded bg-white/5 px-2 py-1 text-[10.5px] text-slate-300"
                  style={{ fontFamily: 'Consolas, "Courier New", monospace' }}
                >
                  {meta.formula}
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </span>
  )
}

// Ton formatlama — girdi kg, çıktı insan-okur formatta ton
// 4.4B kg → "4,4 Milyon Ton" · 1.7B kg → "1,7 Milyon Ton" · 245.000 kg → "245 Ton"
function fmtTon(kgValue) {
  const t = (Number(kgValue) || 0) / 1000  // kg → ton
  if (t >= 1_000_000) return `${(t / 1_000_000).toFixed(1).replace('.', ',')} Milyon Ton`
  if (t >= 1_000) return `${(t / 1_000).toFixed(1).replace('.', ',')} Bin Ton`
  if (t >= 1) return `${Math.round(t).toLocaleString('tr-TR')} Ton`
  return `${Math.round(Number(kgValue) || 0).toLocaleString('tr-TR')} kg`
}

// Premium stat kartı — inline ikon (arkaplan yok), büyük mono değer, alt-bilgi.
function PremiumStat({ icon, iconColor, label, value, valueColor, sub }) {
  return (
    <div
      className="rounded-xl border border-border bg-card/50 p-3.5 transition-all"
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(248,250,252,0.7)'; e.currentTarget.style.borderColor = 'rgba(148,163,184,0.4)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = ''; e.currentTarget.style.borderColor = '' }}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <HugeiconsIcon icon={icon} size={14} strokeWidth={2} color={iconColor} />
        <span className="flex-1 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <div
        className="text-[22px] font-extrabold leading-none tracking-tight tabular-nums"
        style={{ color: valueColor || undefined }}
      >
        {value}
      </div>
      {sub && <div className="mt-1.5 text-[10.5px] font-semibold text-muted-foreground">{sub}</div>}
    </div>
  )
}

// legacy alias — eski SubStat çağrıları
function SubStat({ icon, color, label, value, suffix }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: `${color}15`, color }}>
        {icon}
      </span>
      <div>
        <div className="text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-0.5 text-[15px] font-semibold leading-tight text-foreground">
          {value} <span className="text-[10.5px] font-normal text-muted-foreground">{suffix}</span>
        </div>
      </div>
    </div>
  )
}

function TopBreakdown({ icon, accent, title, items }) {
  // Premium gold / silver / bronze gradient rank badges
  const RANK_COLORS = ['#fbbf24', '#94a3b8', '#cd7f32']
  const list = items || []
  // Total fallback: pct alanı yoksa qty toplamından hesapla.
  const total = list.reduce((s, x) => s + Number(x.qty || x.q || x.value || 0), 0) || 1

  return (
    <div className="rounded-xl border border-border bg-card/60 p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:bg-card/80">
      {/* Header — ikon arka planı YOK, sadece renkli ikon + uppercase başlık */}
      <header className="mb-3 flex items-center gap-2">
        <HugeiconsIcon icon={icon} size={15} strokeWidth={2} color={accent} />
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-foreground">{title}</span>
      </header>
      {list.length === 0 ? (
        <div className="py-1 text-[11px] italic text-muted-foreground">Veri yok</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((it, i) => {
            const v = Number(it.qty || it.q || it.value || 0)
            // pct alanı varsa onu kullan (buildTraderProfile yüzdeleri pre-compute ediyor);
            // yoksa qty/total'dan hesapla.
            const pctRaw = it.pct != null ? Number(it.pct) : (total > 0 ? (v / total) * 100 : 0)
            const id = String(it.id ?? it.name ?? '—')
            const displayName = it.name && it.name !== id ? String(it.name) : null
            const rankColor = RANK_COLORS[i] || '#cbd5e1'
            return (
              <li key={`${id}-${i}`} className="flex items-center gap-2.5">
                {/* Premium rank badge — gradient + glow */}
                <div
                  className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md text-[9.5px] font-extrabold text-white"
                  style={{
                    background: `linear-gradient(135deg, ${rankColor}, ${rankColor}cc)`,
                    boxShadow: `0 1px 3px ${rankColor}55`,
                  }}
                >
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <span
                      className="min-w-0 truncate text-[11.5px] font-bold leading-tight text-foreground"
                      title={displayName ? `${id} • ${displayName}` : id}
                    >
                      <span>{id}</span>
                      {displayName && (
                        <span className="ml-1 font-normal text-muted-foreground">• {displayName}</span>
                      )}
                    </span>
                    <span
                      className="shrink-0 text-[11.5px] font-extrabold tabular-nums"
                      style={{ color: accent }}
                    >
                      {pctRaw.toFixed(1)}%
                    </span>
                  </div>
                  <div className="relative h-[5px] overflow-hidden rounded-full bg-muted/60">
                    <div
                      className="h-full rounded-full transition-[width] duration-500"
                      style={{
                        width: `${Math.min(100, pctRaw)}%`,
                        background: `linear-gradient(90deg, ${accent}aa, ${accent})`,
                      }}
                    />
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// ModelTabs — 8 forecast models sorted by MAPE asc, Best Fit star
// ════════════════════════════════════════════════════════════════════════════
const MODEL_ICON_MAP = {
  hw: Flowchart02Icon,
  stlOut: MagicWand02Icon,
  theta: Hexagon01Icon,
  holtLin: ChartLineData01Icon,
  stl: ChartLineData01Icon,
  snaive: CalendarAdd01Icon,
  croston: PercentSquareIcon,
  ma3: ChartLineData01Icon,
}

function ModelTabs({ fit, activeId, onSelect }) {
  const sorted = useMemo(() => {
    const arr = [...fit.results]
    return arr.sort((a, b) => {
      if (a.skipped && !b.skipped) return 1
      if (!a.skipped && b.skipped) return -1
      const am = a.mape == null ? Infinity : a.mape
      const bm = b.mape == null ? Infinity : b.mape
      return am - bm
    })
  }, [fit])

  // Aktif modelin metadata'sı — alttaki açıklama bandı için
  const activeResult = fit.results.find((r) => r.id === activeId) || fit.results.find((r) => r.id === fit.bestId)
  const activeMeta = FORECAST_MODELS.find((m) => m.id === activeResult?.id)
  const activeMape = activeResult?.mape
  const mapeCat = activeMape == null
    ? null
    : activeMape < 10
      ? { label: 'Mükemmel', color: 'text-emerald-700', bg: 'bg-emerald-100' }
      : activeMape < 20
        ? { label: 'Kabul edilebilir', color: 'text-amber-700', bg: 'bg-amber-100' }
        : { label: 'Yüksek değişkenlik', color: 'text-rose-700', bg: 'bg-rose-100' }

  return (
    <section className={SECTION_CARD}>
      {/* Üst gradient şerit */}
      <div aria-hidden="true" className="h-[3px]" style={{ background: 'linear-gradient(90deg, #0a3d8f 0%, #3b82f6 50%, #f07a23 100%)' }} />
      <header className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3 md:px-5">
        <div className="flex items-center gap-2">
          {/* Tahmin Modelleri — küçük section: sadece renkli ikon, arka plan YOK */}
          <HugeiconsIcon icon={AiIdeaIcon} size={18} strokeWidth={1.9} color="#0a3d8f" />
          <div>
            <h3 className="text-[13px] font-bold leading-tight text-foreground">Tahmin Modelleri</h3>
            <p className="text-[10.5px] text-muted-foreground">MAPE'ye göre sıralı · düşük hata = daha doğru</p>
          </div>
        </div>
        <InfoTip
          title="Tahmin Modelleri"
          desc="8 farklı zaman serisi modeli paralel koşturuldu ve backtest doğruluğuna göre sıralandı. Aktif sekme değiştirilince grafik o modelin tahminini gösterir."
          whenToUse="Best Fit (⭐) işaretli model otomatik olarak önerilen. Diğerlerini deneyerek senaryo karşılaştırması yapabilirsin."
          detail="Croston aralıklı/lumpy serilerde, Holt-Winters mevsim + trend taşıyan stabil akışta, Theta küçük örneklem trend'inde, MA(3) ise referans baseline olarak öne çıkar."
        />
      </header>

      {/* Tab listesi — info ikonu butonun İÇİNDE */}
      <div className="flex flex-wrap gap-1.5 px-3 py-3 md:px-4">
        {sorted.map((r) => {
          const isActive = r.id === activeId
          const isBest = r.id === fit.bestId
          const Icon = MODEL_ICON_MAP[r.id] || ChartLineData01Icon
          const skipped = r.skipped
          const meta = FORECAST_MODELS.find((m) => m.id === r.id)
          return (
            <button
              key={r.id}
              type="button"
              disabled={skipped}
              onClick={() => onSelect(r.id)}
              className={`group relative inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                isActive
                  ? 'border-primary/40 bg-primary/8 text-primary shadow-[0_2px_8px_-2px_rgba(10,61,143,.20)]'
                  : 'border-border/70 bg-card text-foreground/75 hover:-translate-y-0.5 hover:border-foreground/25 hover:text-foreground hover:shadow-[0_2px_6px_-2px_rgba(15,23,42,.10)]'
              }`}
              style={isActive ? { background: 'linear-gradient(135deg, rgba(10,61,143,.08), rgba(59,130,246,.05))' } : undefined}
            >
              <HugeiconsIcon icon={Icon} size={13} strokeWidth={1.9} />
              <span>{r.label}</span>
              {isBest && (
                <Star className="h-3 w-3 shrink-0 fill-current text-amber-500" strokeWidth={0} aria-label="Best Fit" />
              )}
              {r.mape != null && (
                <span className={`rounded px-1 text-[10px] font-semibold tabular-nums ${mapeColorCls(r.mape)}`}>
                  {r.mape.toFixed(1)}%
                </span>
              )}
              {skipped && <span className="text-[10px] uppercase text-muted-foreground/60">Atlandı</span>}
              {meta && !skipped && (
                <span
                  className="ml-0.5 grid h-[15px] w-[15px] place-items-center rounded text-foreground/35 transition-colors hover:bg-foreground/8 hover:text-foreground/70"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ModelInfoTip meta={meta} mape={r.mape} isBest={isBest} />
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Aktif model açıklama bandı — ikon arka planı YOK */}
      {activeMeta && (
        <div
          className="flex flex-col gap-1.5 border-t border-border/60 px-4 py-3 md:flex-row md:items-center md:gap-3 md:px-5"
          style={{ background: 'linear-gradient(180deg, rgba(248,250,252,0.55), rgba(241,245,249,0.30))' }}
        >
          <div className="flex items-start gap-2 md:flex-1">
            <Info size={15} strokeWidth={2} className="mt-0.5 shrink-0 text-primary/80" />
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-bold leading-tight text-foreground">
                {activeMeta.label}
                {activeResult?.id === fit.bestId && (
                  <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 align-middle text-[9px] font-extrabold uppercase tracking-wider text-amber-700">
                    <Star className="h-2.5 w-2.5 fill-current" strokeWidth={0} /> Best Fit
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground/85">{activeMeta.short}.</span>{' '}
                {activeMeta.whenToUse}
              </p>
            </div>
          </div>
          {activeMape != null && mapeCat && (
            <div className="flex items-center gap-2 md:shrink-0">
              <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">MAPE</span>
              <span className={`rounded-md px-2 py-1 text-[11.5px] font-extrabold tabular-nums ${mapeCat.bg} ${mapeCat.color}`}>
                %{activeMape.toFixed(1)}
              </span>
              <span className={`text-[10.5px] font-semibold ${mapeCat.color}`}>· {mapeCat.label}</span>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function mapeColorCls(m) {
  if (m == null) return 'bg-muted text-muted-foreground'
  if (m < 15) return 'bg-emerald-100 text-emerald-700'
  if (m < 30) return 'bg-amber-100 text-amber-700'
  if (m < 60) return 'bg-orange-100 text-orange-700'
  return 'bg-rose-100 text-rose-700'
}

// ════════════════════════════════════════════════════════════════════════════
// KpiCards — 4 quick stats (scenario delta when active)
// ════════════════════════════════════════════════════════════════════════════
function KpiCards({ monthlyAvg, fcTotal, horizon, trendPct, mape, useValue, scenarioResult }) {
  // Birim formatlama: useValue=true ise para ($), değilse ton-formatlı
  const fmtVal = (v) => {
    if (v == null) return '—'
    if (useValue) return `$${Math.round(v).toLocaleString('tr-TR')}`
    return fmtTon(v)
  }
  const scActive = scenarioResult?.isActive && scenarioResult.adjustedTotal != null
  const scDelta = scActive ? scenarioResult.deltaPct : null

  return (
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3">
      <KpiCard
        icon={Calendar03Icon}
        accent="#f07a23"
        label="Aylık Ortalama"
        value={fmtVal(monthlyAvg)}
        sub={`${horizon} ay tahmin`}
        deltaPct={scActive ? scDelta : null}
        info={{
          title: 'Aylık Ortalama Tahmin',
          desc: `Aktif modelin önümüzdeki ${horizon} ay için tahmin ettiği toplamın ay başına ortalaması.`,
          detail: 'Mevsimsellik nedeniyle bazı aylar bu ortalamanın üstünde, bazıları altında olabilir. Detay için "Aylık Tahmin Detayı" tablosuna bak.',
        }}
      />
      <KpiCard
        icon={ChartLineData01Icon}
        accent="#0a3d8f"
        label={`${horizon} Ay Toplam`}
        value={fmtVal(fcTotal)}
        sub={scActive ? `Senaryo: ${fmtVal(scenarioResult.adjustedTotal)}` : 'Tahmin edilen'}
        deltaPct={scActive ? scDelta : null}
        info={{
          title: `${horizon} Ay Toplam Tahmin`,
          desc: 'Aktif modelin tahmin dönemindeki toplam satış miktarı.',
          detail: 'Senaryo aktifken simülasyon sonrası rakamı da gösterir; delta yüzdesiyle baseline\'dan sapma görünür.',
        }}
      />
      <KpiCard
        icon={trendPct == null ? PercentSquareIcon : trendPct >= 0 ? TradeUpIcon : TradeDownIcon}
        accent={trendPct == null ? '#64748b' : trendPct >= 0 ? '#047857' : '#be123c'}
        label="Trend %"
        value={trendPct == null ? '—' : `${trendPct >= 0 ? '+' : ''}${trendPct.toFixed(1)}%`}
        valueColor={trendPct == null ? undefined : trendPct >= 0 ? '#047857' : '#be123c'}
        sub="Geçen yıl aynı dönem"
        info={{
          title: 'Year-over-Year Trend',
          desc: 'Tahmin döneminin, geçmiş yıldaki aynı aylara göre yüzde değişimi. Pozitif = büyüme, negatif = daralma.',
          formula: '(Tahmin − GeçenYıl) / GeçenYıl × 100',
        }}
      />
      <KpiCard
        icon={PercentSquareIcon}
        accent={mape == null ? '#64748b' : mape < 15 ? '#047857' : mape < 30 ? '#b45309' : mape < 60 ? '#b85216' : '#be123c'}
        label="Backtest MAPE"
        value={mape == null ? '—' : `%${mape.toFixed(1)}`}
        sub="Holdout doğruluk"
        info={{
          title: 'Mean Absolute Percentage Error',
          desc: 'Modelin geçmiş veride yaptığı tahminlerin gerçek değerlerden ortalama yüzde sapması. Düşük = daha doğru model.',
          detail: '%0-10 mükemmel · %10-20 kabul edilebilir · %20+ gürültülü/güvensiz seri.',
        }}
      />
    </div>
  )
}

// Küçük kart kuralı: ikon arka planı YOK, sadece renkli ikon + label aynı satırda
function KpiCard({ icon, accent, label, value, valueColor, sub, deltaPct, info }) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-[0_4px_12px_-2px_rgba(15,23,42,0.08),0_10px_20px_-8px_rgba(15,23,42,0.12)] md:p-3.5">
      <header className="flex items-center gap-1.5">
        <HugeiconsIcon icon={icon} size={14} strokeWidth={2} color={accent} />
        <span className="flex-1 text-[10.5px] font-extrabold uppercase tracking-wider text-muted-foreground">{label}</span>
        {info && <InfoTip {...info} iconSize={10} />}
        {deltaPct != null && (
          <span
            className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9.5px] font-extrabold tabular-nums ${
              deltaPct >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
            }`}
          >
            <HugeiconsIcon icon={FlashIcon} size={9} strokeWidth={2.4} />
            {deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(1)}%
          </span>
        )}
      </header>
      <p
        className="mt-2 text-[17px] font-extrabold leading-none tracking-tight tabular-nums md:text-[19px]"
        style={{ color: valueColor || undefined }}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[10.5px] font-medium text-muted-foreground">{sub}</p>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// ForecastChart — inline SVG with smooth Bezier + hover tooltip
// ════════════════════════════════════════════════════════════════════════════
const MONTHS_TR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']

function ForecastChart({
  histArr, histKeys, forecastPts, forecastLow, forecastUp, forecastKeys, activeResult, useValue, scenarioResult,
  items = [], chartView = 'total', viewLabel = null, onChartViewChange,
}) {
  const scenarioPts = scenarioResult?.isActive ? scenarioResult.adjustedForecast?.point : null
  const mcBands = scenarioResult?.isActive ? scenarioResult.mcBands : null

  const wrapRef = useRef(null)
  const [width, setWidth] = useState(900)
  const [hoverIdx, setHoverIdx] = useState(null)

  // Gelişmiş Filtre dropdown state
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterSearch, setFilterSearch] = useState('')
  const filterBtnRef = useRef(null)
  const [filterPos, setFilterPos] = useState(null)
  useEffect(() => {
    if (!filterOpen || !filterBtnRef.current) { setFilterPos(null); return }
    const update = () => {
      const r = filterBtnRef.current.getBoundingClientRect()
      const w = 320
      setFilterPos({ right: window.innerWidth - r.right, top: r.bottom + 6, w })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    const onDoc = (e) => {
      if (filterBtnRef.current && !filterBtnRef.current.contains(e.target) && !e.target.closest('[data-fcst-filter-menu]')) {
        setFilterOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      document.removeEventListener('mousedown', onDoc)
    }
  }, [filterOpen])

  const filteredItems = useMemo(() => {
    const q = filterSearch.trim().toLocaleLowerCase('tr-TR')
    if (!q) return items
    return items.filter((it) =>
      it.pid.toLocaleLowerCase('tr-TR').includes(q) ||
      (it.name || '').toLocaleLowerCase('tr-TR').includes(q)
    )
  }, [items, filterSearch])

  const isItemView = chartView !== 'total'
  const activeItem = isItemView ? items.find((it) => it.pid === chartView) : null

  useEffect(() => {
    if (!wrapRef.current) return
    const update = () => {
      const w = wrapRef.current?.getBoundingClientRect()?.width
      if (w && w > 200) setWidth(Math.round(w))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [])

  // Build series
  const allKeys = [...histKeys, ...forecastKeys]
  const allPts = [...histArr, ...forecastPts]
  const histLen = histArr.length

  const allValues = [...histArr, ...forecastPts, ...(forecastUp || [])].filter((v) => v != null && !isNaN(v))
  const maxV = Math.max(1, ...allValues) * 1.15
  const minV = 0

  const padL = 50, padR = 16, padT = 16, padB = 30
  const H = 260
  const W = Math.max(400, width)
  const innerW = W - padL - padR
  const innerH = H - padT - padB

  const xAt = (i) => allPts.length > 1 ? padL + (i * innerW) / (allPts.length - 1) : padL + innerW / 2
  const yAt = (v) => padT + innerH - (((v || 0) - minV) / (maxV - minV)) * innerH

  // Cubic Bezier smoothing — half-distance control points
  const buildSmoothPath = (vals, startX = null, startY = null) => {
    if (vals.length === 0) return ''
    const pts = vals.map((v, i) => ({ x: xAt(i), y: yAt(v) }))
    let d
    if (startX != null && startY != null) {
      d = `M ${startX.toFixed(1)} ${startY.toFixed(1)} L ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
    } else {
      d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i], p1 = pts[i + 1]
      const cp1x = p0.x + (p1.x - p0.x) / 2
      const cp2x = p0.x + (p1.x - p0.x) / 2
      d += ` C ${cp1x.toFixed(1)} ${p0.y.toFixed(1)}, ${cp2x.toFixed(1)} ${p1.y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`
    }
    return d
  }

  // History path (separate so we can style differently)
  const histPath = buildSmoothPath(histArr)
  // Forecast path — start from last history point
  const lastHistX = histLen > 0 ? xAt(histLen - 1) : null
  const lastHistY = histLen > 0 ? yAt(histArr[histLen - 1]) : null
  // For forecast, we have to offset the x positions by histLen
  const fcPathInner = (() => {
    if (forecastPts.length === 0) return ''
    const pts = forecastPts.map((v, i) => ({ x: xAt(histLen + i), y: yAt(v) }))
    let d = lastHistX != null
      ? `M ${lastHistX.toFixed(1)} ${lastHistY.toFixed(1)} L ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
      : `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i], p1 = pts[i + 1]
      const cp1x = p0.x + (p1.x - p0.x) / 2
      const cp2x = p0.x + (p1.x - p0.x) / 2
      d += ` C ${cp1x.toFixed(1)} ${p0.y.toFixed(1)}, ${cp2x.toFixed(1)} ${p1.y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`
    }
    return d
  })()

  // Confidence band (upper/lower)
  const confPath = (() => {
    if (!forecastUp?.length || !forecastLow?.length) return ''
    const upPts = forecastUp.map((v, i) => ({ x: xAt(histLen + i), y: yAt(v) }))
    const lowPts = forecastLow.map((v, i) => ({ x: xAt(histLen + i), y: yAt(v) })).reverse()
    let d = `M ${upPts[0].x.toFixed(1)} ${upPts[0].y.toFixed(1)}`
    for (let i = 0; i < upPts.length - 1; i++) {
      const p0 = upPts[i], p1 = upPts[i + 1]
      const cp1x = p0.x + (p1.x - p0.x) / 2
      const cp2x = p0.x + (p1.x - p0.x) / 2
      d += ` C ${cp1x.toFixed(1)} ${p0.y.toFixed(1)}, ${cp2x.toFixed(1)} ${p1.y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`
    }
    for (let i = 0; i < lowPts.length; i++) {
      d += ` L ${lowPts[i].x.toFixed(1)} ${lowPts[i].y.toFixed(1)}`
    }
    return d + ' Z'
  })()

  // Y-axis ticks (5)
  const yTicks = useMemo(() => {
    const ticks = []
    for (let i = 0; i <= 4; i++) {
      const v = minV + ((maxV - minV) * i) / 4
      ticks.push({ v, y: yAt(v) })
    }
    return ticks
  }, [maxV, innerH, padT])
  void yTicks // (used in render)

  const fmtVal = (v) => v == null ? '—' : `${useValue ? '$' : ''}${Math.round(v).toLocaleString('tr-TR')}${useValue ? '' : ' kg'}`
  const fmtKey = (k) => {
    if (!k) return ''
    const [yy, mm] = k.split('-')
    return `${MONTHS_TR[+mm - 1]} '${yy.slice(2)}`
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.10)]" ref={wrapRef}>
      <header
        className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 md:px-5"
        style={{ background: 'linear-gradient(135deg, rgba(59,130,246,.04), rgba(10,61,143,.02))' }}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          {/* Büyük section — navy gradient ikon */}
          <span
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white"
            style={{
              background: 'linear-gradient(135deg, #0a3d8f, #3b82f6)',
              boxShadow: '0 2px 6px rgba(10,61,143,0.22)',
            }}
          >
            <HugeiconsIcon icon={ChartLineData01Icon} size={15} strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-[13.5px] font-bold leading-tight text-foreground">Tahmin Grafiği</h3>
            <p className="truncate text-[11px] font-medium text-muted-foreground">
              Aktif model: <span className="font-bold text-foreground/85">{activeResult?.label || '—'}</span>
              {activeResult?.mape != null && <span className="ml-1 tabular-nums">· MAPE %{activeResult.mape.toFixed(1)}</span>}
              {isItemView && activeItem && (
                <span className="ml-2 inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-extrabold text-primary">
                  <HugeiconsIcon icon={PackageIcon} size={9} strokeWidth={2.4} />
                  {activeItem.pid}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Gelişmiş Filtre butonu */}
          {items.length > 0 && onChartViewChange && (
            <div className="relative">
              <button
                ref={filterBtnRef}
                type="button"
                onClick={() => setFilterOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-semibold transition-all"
                style={
                  isItemView
                    ? {
                        background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                        borderColor: 'rgba(59,130,246,.55)',
                        color: '#fff',
                        boxShadow: '0 2px 8px rgba(59,130,246,.30), 0 1px 3px rgba(59,130,246,.20)',
                      }
                    : {
                        background: '#fff',
                        borderColor: 'rgba(59,130,246,.30)',
                        color: '#1d4ed8',
                        boxShadow: '0 1px 3px rgba(59,130,246,.08)',
                      }
                }
              >
                <HugeiconsIcon icon={MagicWand02Icon} size={13} strokeWidth={2} />
                Gelişmiş Filtre
                {isItemView && activeItem && (
                  <span
                    className="ml-0.5 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-extrabold"
                    style={{ background: 'rgba(255,255,255,.25)', color: '#fff', backdropFilter: 'blur(4px)' }}
                  >
                    {activeItem.pid}
                  </span>
                )}
                <ChevronDown size={11} className={`transition ${filterOpen ? 'rotate-180' : ''}`} strokeWidth={2.2} />
              </button>

              {filterOpen && filterPos && (
                <div
                  data-fcst-filter-menu
                  className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_12px_36px_rgba(0,0,0,0.14),0_4px_12px_rgba(0,0,0,0.06)]"
                  style={{
                    position: 'fixed',
                    right: filterPos.right,
                    top: filterPos.top,
                    width: filterPos.w,
                    maxWidth: 'calc(100vw - 24px)',
                    maxHeight: `min(560px, calc(100vh - ${filterPos.top + 20}px))`,
                    zIndex: 50,
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  {/* Üst gradient şerit */}
                  <div aria-hidden="true" className="h-[3px] shrink-0" style={{ background: 'linear-gradient(90deg, #3b82f6, #6366f1, #8b5cf6)' }} />

                  {/* Header */}
                  <div
                    className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3"
                    style={{ background: 'linear-gradient(135deg, rgba(59,130,246,.05), rgba(99,102,241,.02))' }}
                  >
                    <HugeiconsIcon icon={MagicWand02Icon} size={14} strokeWidth={2} className="text-primary" />
                    <div className="flex-1">
                      <div className="text-[12.5px] font-extrabold tracking-tight text-foreground">Gelişmiş Filtre</div>
                      <div className="text-[10px] font-medium text-muted-foreground">Görüntüleme kapsamını seçin</div>
                    </div>
                    <InfoTip
                      title="Gelişmiş Filtre"
                      desc="Grafiği trader toplamı yerine tek bir ürünün serisi üzerinde görüntüle. Diğer tablolar trader-total üzerinde kalır."
                      iconSize={10}
                    />
                  </div>

                  {/* Trader Total */}
                  <div className="shrink-0 border-b border-border px-3 py-3">
                    <div className="mb-2 flex items-center gap-1 text-[9.5px] font-extrabold uppercase tracking-wider text-muted-foreground">
                      <HugeiconsIcon icon={UserGroup02Icon} size={11} strokeWidth={2.2} />
                      Trader Kapsamı
                    </div>
                    <button
                      type="button"
                      onClick={() => { onChartViewChange('total'); setFilterOpen(false); setFilterSearch('') }}
                      className="flex w-full items-center gap-2.5 rounded-lg border p-2.5 transition"
                      style={
                        !isItemView
                          ? {
                              background: 'linear-gradient(135deg, rgba(59,130,246,.10), rgba(139,92,246,.04))',
                              borderColor: 'rgba(59,130,246,.30)',
                            }
                          : { background: '#fafbfc', borderColor: 'rgba(226,232,240,.8)' }
                      }
                    >
                      <span
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
                        style={
                          !isItemView
                            ? {
                                background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                                color: '#fff',
                                boxShadow: '0 2px 6px rgba(59,130,246,.25)',
                              }
                            : { background: 'rgba(59,130,246,.10)', color: '#1d4ed8' }
                        }
                      >
                        <HugeiconsIcon icon={User03Icon} size={15} strokeWidth={2} />
                      </span>
                      <div className="min-w-0 flex-1 text-left">
                        <div className={`truncate text-[12.5px] font-extrabold ${!isItemView ? 'text-primary' : 'text-foreground'}`}>
                          Trader Toplamı
                        </div>
                        <div className="truncate text-[10.5px] font-medium text-muted-foreground">Tüm ürünlerin birleşik tahmini</div>
                      </div>
                      {!isItemView && (
                        <span
                          className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-white"
                          style={{ background: 'linear-gradient(135deg, #047857, #10b981)' }}
                        >
                          ● Aktif
                        </span>
                      )}
                    </button>
                  </div>

                  {/* Tek Ürün */}
                  <div className="shrink-0 border-b border-border px-3 py-3">
                    <div className="mb-2 flex items-center gap-1 text-[9.5px] font-extrabold uppercase tracking-wider text-muted-foreground">
                      <HugeiconsIcon icon={PackageIcon} size={11} strokeWidth={2.2} />
                      Tek Ürün <span className="ml-1 font-medium normal-case tracking-normal">· Top {items.length}</span>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        value={filterSearch}
                        onChange={(e) => setFilterSearch(e.target.value)}
                        placeholder="Ürün kodu veya adı ara…"
                        autoFocus
                        className="w-full rounded-md border border-border bg-card px-3 py-1.5 text-[11.5px] font-medium text-foreground outline-none transition focus:border-primary/50 focus:bg-card"
                      />
                    </div>
                  </div>

                  {/* List */}
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    {filteredItems.slice(0, 30).map((it) => {
                      const sel = chartView === it.pid
                      return (
                        <button
                          key={it.pid}
                          type="button"
                          onClick={() => { onChartViewChange(it.pid); setFilterOpen(false); setFilterSearch('') }}
                          className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left transition hover:bg-muted/30"
                          style={sel ? { background: 'linear-gradient(135deg, rgba(59,130,246,.08), rgba(139,92,246,.04))' } : undefined}
                        >
                          {sel && <span className="absolute left-0 top-0 h-full w-[3px]" style={{ background: 'linear-gradient(180deg, #3b82f6, #6366f1)' }} />}
                          <span
                            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ background: sel ? 'linear-gradient(135deg, #3b82f6, #6366f1)' : '#cbd5e1' }}
                          />
                          <div className="min-w-0 flex-1">
                            <div className={`truncate text-[11.5px] font-bold ${sel ? 'text-primary' : 'text-foreground'}`}>{it.pid}</div>
                            {it.name && (
                              <div className="truncate text-[10px] font-medium text-muted-foreground">{it.name}</div>
                            )}
                          </div>
                          <span className="shrink-0 text-[10.5px] font-semibold tabular-nums text-muted-foreground">{fmtTon(it.last12)}</span>
                          {it.isStable === false && (
                            <span className="shrink-0 rounded bg-orange-100 px-1 py-0.5 text-[9px] font-extrabold tracking-wider text-orange-700">
                              DÜZENSİZ
                            </span>
                          )}
                        </button>
                      )
                    })}
                    {filteredItems.length === 0 && (
                      <div className="py-6 text-center text-[11px] italic text-muted-foreground">Eşleşme yok</div>
                    )}
                  </div>

                  {/* Footer */}
                  <div
                    className="flex shrink-0 gap-2 border-t border-border px-3 py-2.5"
                    style={{ background: 'linear-gradient(180deg, #fafbfc, #f5f7fa)' }}
                  >
                    <button
                      type="button"
                      onClick={() => { onChartViewChange('total'); setFilterSearch(''); setFilterOpen(false) }}
                      disabled={!isItemView && !filterSearch}
                      className="flex-1 rounded-md border border-rose-200 bg-card px-2.5 py-1.5 text-[11.5px] font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <HugeiconsIcon icon={RotateClockwiseIcon} size={11} strokeWidth={2} className="mr-1 inline" />
                      Filtreyi Temizle
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterOpen(false)}
                      className="flex-1 rounded-md px-2.5 py-1.5 text-[11.5px] font-semibold text-white transition"
                      style={{
                        background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                        boxShadow: '0 2px 6px rgba(59,130,246,.20)',
                      }}
                    >
                      <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2.4} className="mr-1 inline" />
                      Kapat
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Legend */}
          <div className="flex items-center gap-3 text-[11px] font-medium text-muted-foreground">
            <Legend color="#0a3d8f" label="Geçmiş" />
            <Legend color="#f07a23" label="Tahmin" dashed />
            {forecastUp?.length > 0 && <Legend color="#f07a23" label="Güven aralığı" band />}
          </div>
        </div>
      </header>

      <div className="p-4 md:p-5">

      <div className="relative">
        <svg
          width="100%"
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const x = ((e.clientX - rect.left) / rect.width) * W
            const t = (x - padL) / innerW
            const idx = Math.round(t * (allPts.length - 1))
            if (idx >= 0 && idx < allPts.length) setHoverIdx(idx)
          }}
          onMouseLeave={() => setHoverIdx(null)}
          style={{ display: 'block', cursor: 'crosshair' }}
        >
          <defs>
            <linearGradient id="fcStrokeGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#f07a23" />
              <stop offset="1" stopColor="#b85216" />
            </linearGradient>
            <linearGradient id="histStrokeGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#1d4ed8" />
              <stop offset="1" stopColor="#0a3d8f" />
            </linearGradient>
          </defs>

          {/* Gridlines */}
          {yTicks.map((t, i) => (
            <line
              key={i}
              x1={padL}
              x2={W - padR}
              y1={t.y}
              y2={t.y}
              stroke="#e5e7eb"
              strokeDasharray="2 4"
              strokeWidth="1"
            />
          ))}

          {/* Y labels */}
          {yTicks.map((t, i) => (
            <text
              key={i}
              x={padL - 8}
              y={t.y + 3}
              textAnchor="end"
              fontSize="10"
              fill="#94a3b8"
            >
              {t.v >= 1000 ? `${(t.v / 1000).toFixed(1)}k` : Math.round(t.v).toString()}
            </text>
          ))}

          {/* Confidence band */}
          {confPath && (
            <path d={confPath} fill="rgba(240,122,35,0.10)" />
          )}

          {/* History area subtle fill */}
          {histPath && (
            <path
              d={`${histPath} L ${xAt(histLen - 1).toFixed(1)} ${(padT + innerH).toFixed(1)} L ${xAt(0).toFixed(1)} ${(padT + innerH).toFixed(1)} Z`}
              fill="rgba(10,61,143,0.05)"
            />
          )}

          {/* Vertical separator */}
          {histLen > 0 && forecastPts.length > 0 && (
            <line
              x1={xAt(histLen - 1)}
              x2={xAt(histLen - 1)}
              y1={padT}
              y2={padT + innerH}
              stroke="#94a3b8"
              strokeDasharray="3 3"
              strokeWidth="1"
              opacity="0.5"
            />
          )}

          {/* History line */}
          {histPath && (
            <path d={histPath} fill="none" stroke="url(#histStrokeGrad)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          )}

          {/* Forecast line — dashed */}
          {fcPathInner && (
            <path
              d={fcPathInner}
              fill="none"
              stroke="url(#fcStrokeGrad)"
              strokeWidth="2.4"
              strokeDasharray="6 4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* MC bands (P10-P90) */}
          {mcBands?.p10 && mcBands?.p90 && (() => {
            const upPts = mcBands.p90.map((v, i) => ({ x: xAt(histLen + i), y: yAt(v) }))
            const lowPts = mcBands.p10.map((v, i) => ({ x: xAt(histLen + i), y: yAt(v) })).reverse()
            let d = `M ${upPts[0].x} ${upPts[0].y}`
            for (let i = 1; i < upPts.length; i++) d += ` L ${upPts[i].x} ${upPts[i].y}`
            for (const p of lowPts) d += ` L ${p.x} ${p.y}`
            return <path d={d + ' Z'} fill="rgba(168,85,247,0.10)" />
          })()}

          {/* Scenario adjusted forecast (orange dashed) */}
          {scenarioPts && (() => {
            const pts = scenarioPts.map((v, i) => ({ x: xAt(histLen + i), y: yAt(v) }))
            let d = lastHistX != null
              ? `M ${lastHistX.toFixed(1)} ${lastHistY.toFixed(1)} L ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
              : `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
            for (let i = 0; i < pts.length - 1; i++) {
              const p0 = pts[i], p1 = pts[i + 1]
              const cp1x = p0.x + (p1.x - p0.x) / 2
              const cp2x = p0.x + (p1.x - p0.x) / 2
              d += ` C ${cp1x.toFixed(1)} ${p0.y.toFixed(1)}, ${cp2x.toFixed(1)} ${p1.y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`
            }
            return (
              <>
                <path d={d} fill="none" stroke="#a855f7" strokeWidth="2.4" strokeDasharray="3 3" strokeLinecap="round" />
                {pts.map((p, i) => <circle key={`s-${i}`} cx={p.x} cy={p.y} r="2.5" fill="#a855f7" />)}
              </>
            )
          })()}

          {/* Data points */}
          {histArr.map((v, i) =>
            v == null ? null : (
              <circle key={`h-${i}`} cx={xAt(i)} cy={yAt(v)} r="3" fill="#0a3d8f" />
            ),
          )}
          {forecastPts.map((v, i) =>
            v == null ? null : (
              <circle key={`f-${i}`} cx={xAt(histLen + i)} cy={yAt(v)} r="3" fill="#f07a23" />
            ),
          )}

          {/* Hover guide */}
          {hoverIdx != null && allPts[hoverIdx] != null && (
            <line
              x1={xAt(hoverIdx)}
              x2={xAt(hoverIdx)}
              y1={padT}
              y2={padT + innerH}
              stroke="#0a3d8f"
              strokeWidth="1"
              opacity="0.35"
            />
          )}
          {hoverIdx != null && allPts[hoverIdx] != null && (
            <circle cx={xAt(hoverIdx)} cy={yAt(allPts[hoverIdx])} r="5" fill="#fff" stroke={hoverIdx < histLen ? '#0a3d8f' : '#f07a23'} strokeWidth="2" />
          )}

          {/* X labels — every other */}
          {allKeys.map((k, i) => i % 2 === 0 && (
            <text
              key={`x-${i}`}
              x={xAt(i)}
              y={H - 8}
              textAnchor="middle"
              fontSize="10"
              fill="#94a3b8"
            >
              {fmtKey(k)}
            </text>
          ))}
        </svg>

        {/* Hover tooltip */}
        {hoverIdx != null && allPts[hoverIdx] != null && (
          <div
            className="pointer-events-none absolute z-10 rounded-lg border border-border bg-card px-3 py-2 text-[11px] shadow-md"
            style={{
              left: `${(xAt(hoverIdx) / W) * 100}%`,
              top: 6,
              transform: 'translateX(-50%)',
            }}
          >
            <div className="font-semibold text-foreground">{fmtKey(allKeys[hoverIdx])}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-foreground/85">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: hoverIdx < histLen ? '#0a3d8f' : '#f07a23' }}
              />
              <span>{hoverIdx < histLen ? 'Geçmiş' : 'Tahmin'}:</span>
              <span className="font-semibold text-foreground">{fmtVal(allPts[hoverIdx])}</span>
            </div>
            {hoverIdx >= histLen && forecastLow?.[hoverIdx - histLen] != null && (
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                Alt-Üst: {fmtVal(forecastLow[hoverIdx - histLen])} — {fmtVal(forecastUp[hoverIdx - histLen])}
              </div>
            )}
          </div>
        )}
      </div>
      </div>
    </section>
  )
}

function Legend({ color, label, dashed, band }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {band ? (
        <span className="h-2 w-5 rounded" style={{ background: `${color}30` }} />
      ) : (
        <span
          className="h-0.5 w-5 rounded-full"
          style={{
            background: color,
            ...(dashed && { backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 3px, transparent 3px 5px)`, background: 'transparent' }),
          }}
        />
      )}
      <span>{label}</span>
    </span>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Phase 6: ExportBar — Excel + PDF + Scenario toggle
// ════════════════════════════════════════════════════════════════════════════
function ExportBar({ scenarioActive, onScenarioToggle, onExportExcel, onExportPDF }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button
        type="button"
        onClick={onScenarioToggle}
        className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-[12.5px] font-semibold transition ${
          scenarioActive
            ? 'border-purple-300 bg-purple-50 text-purple-700 shadow-sm'
            : 'border-border bg-card text-foreground/80 hover:text-foreground'
        }`}
      >
        <HugeiconsIcon icon={Target02Icon} size={14} strokeWidth={1.9} />
        Senaryo Simülasyonu
        {scenarioActive && <span className="grid h-4 min-w-[16px] place-items-center rounded-full bg-purple-600 px-1 text-[9px] text-white">●</span>}
      </button>
      <button
        type="button"
        onClick={onExportExcel}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-[12.5px] font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50"
      >
        <HugeiconsIcon icon={File02Icon} size={14} strokeWidth={1.9} />
        Excel
      </button>
      <button
        type="button"
        onClick={onExportPDF}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-[12.5px] font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-50"
      >
        <HugeiconsIcon icon={CloudDownloadIcon} size={14} strokeWidth={1.9} />
        PDF
      </button>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Phase 4: MiniInsights — Mevsim / Trend / Güven 3'lü mini kart
// ════════════════════════════════════════════════════════════════════════════
function calculateSeasonalIndices(qty, keys) {
  const sums = Array(12).fill(0)
  const counts = Array(12).fill(0)
  for (let i = 0; i < qty.length; i++) {
    const k = keys[i]
    if (!k) continue
    const month = parseInt(k.split('-')[1], 10) - 1
    if (qty[i] != null && qty[i] > 0) {
      sums[month] += qty[i]
      counts[month]++
    }
  }
  const avgs = sums.map((s, i) => (counts[i] > 0 ? s / counts[i] : 0))
  const overall = avgs.filter((v) => v > 0).reduce((a, b) => a + b, 0) / Math.max(1, avgs.filter((v) => v > 0).length)
  return avgs.map((a) => (overall > 0 ? a / overall : 1))
}

function linearRegression(values) {
  const arr = values.filter((v) => v != null && !isNaN(v))
  if (arr.length < 2) return { slope: 0, intercept: 0, r2: 0 }
  const n = arr.length
  const xMean = (n - 1) / 2
  const yMean = arr.reduce((a, b) => a + b, 0) / n
  let num = 0, den = 0, totSS = 0
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (arr[i] - yMean)
    den += (i - xMean) ** 2
    totSS += (arr[i] - yMean) ** 2
  }
  const slope = den !== 0 ? num / den : 0
  const intercept = yMean - slope * xMean
  let resSS = 0
  for (let i = 0; i < n; i++) {
    const pred = intercept + slope * i
    resSS += (arr[i] - pred) ** 2
  }
  const r2 = totSS > 0 ? Math.max(0, 1 - resSS / totSS) : 0
  return { slope, intercept, r2 }
}

const MONTHS_TR_FULL = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

function MiniInsights({ histArr, histKeys, mape }) {
  // Aylık ortalamalar + genel ortalamaya göre % sapma
  const { monthMeans, seasonality, topMonths, lowMonths } = useMemo(() => {
    const sums = Array(12).fill(0)
    const counts = Array(12).fill(0)
    for (let i = 0; i < histArr.length; i++) {
      const k = histKeys[i]
      if (!k) continue
      const m = parseInt(k.split('-')[1], 10) - 1
      if (histArr[i] != null && histArr[i] >= 0) {
        sums[m] += histArr[i]
        counts[m]++
      }
    }
    const means = sums.map((s, i) => (counts[i] > 0 ? s / counts[i] : 0))
    const positive = means.filter((v) => v > 0)
    const overall = positive.length > 0 ? positive.reduce((a, b) => a + b, 0) / positive.length : 1
    const seasonality = means.map((m, i) => ({
      i,
      m,
      pct: overall > 0 ? ((m - overall) / overall) * 100 : 0,
    }))
    const sortedDesc = [...seasonality].filter((s) => s.m > 0).sort((a, b) => b.pct - a.pct)
    const sortedAsc = [...seasonality].filter((s) => s.m > 0).sort((a, b) => a.pct - b.pct)
    return {
      monthMeans: means,
      seasonality,
      topMonths: sortedDesc.slice(0, 3),
      lowMonths: sortedAsc.slice(0, 3),
    }
  }, [histArr, histKeys])

  const reg = useMemo(() => linearRegression(histArr), [histArr])
  const overallMean = monthMeans.reduce((a, b) => a + b, 0) / 12 || 1
  const trendDir = reg.slope > overallMean * 0.005 ? 'up' : reg.slope < -overallMean * 0.005 ? 'down' : 'flat'
  const trendLabel = trendDir === 'up' ? 'Artan' : trendDir === 'down' ? 'Azalan' : 'Yatay'

  // Güven seviyesi (MAPE eşikleri WMS pattern)
  const confidence = mape == null ? 'low' : mape < 10 ? 'high' : mape < 20 ? 'medium' : 'low'
  const confMeta = confidence === 'high'
    ? {
        label: 'YÜKSEK GÜVEN',
        color: '#047857',
        bg: 'linear-gradient(135deg, rgba(16,185,129,.14), rgba(4,120,87,.06))',
        border: 'rgba(4,120,87,.22)',
        desc: 'Tahmin sapması düşük (<%10). Modelin geçmişteki başarısı yüksek; planlama için güvenle kullanılabilir.',
      }
    : confidence === 'medium'
      ? {
          label: 'ORTA GÜVEN',
          color: '#b85216',
          bg: 'linear-gradient(135deg, rgba(240,122,35,.14), rgba(234,88,12,.06))',
          border: 'rgba(240,122,35,.30)',
          desc: 'Orta sapma (%10-20). Tahmin yön gösterir ama kesin sayı için ±%20 marj bırakın.',
        }
      : {
          label: 'DÜŞÜK GÜVEN',
          color: '#be123c',
          bg: 'linear-gradient(135deg, rgba(244,63,94,.14), rgba(244,63,94,.06))',
          border: 'rgba(244,63,94,.25)',
          desc: mape == null ? 'MAPE hesaplanamadı.' : 'Yüksek sapma (>%20). Seri çok gürültülü veya yapısal kırılma var. Tahmin sadece referans olarak kullanın.',
        }

  const maxMonthMean = Math.max(...monthMeans, 1)

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
      {/* ─── Mevsim Profili ─── */}
      <InsightCard
        accent="#14b8a6"
        icon={CalendarAnalysisIcon}
        title="Mevsim Profili"
        info={{
          title: 'Mevsim Profili',
          desc: 'Her takvim ayının tarihsel ortalamasının, genel ortalamaya göre yüzde sapması. Trader\'ın hangi aylarda yoğun, hangilerinde düşük çalıştığını gösterir.',
          detail: 'Pikler agro hasat dönemleri (ayçiçeği yaz, nohut sonbahar) veya tüketici takvimi (Ramazan, bayram) ile ilişkili olabilir.',
        }}
      >
        {/* Bar chart — WMS pattern: parent fixed height + flex bars */}
        <div className="mb-2 flex items-end gap-[2px]" style={{ height: 54 }}>
          {seasonality.map((s) => {
            const norm = maxMonthMean > 0 ? (s.m / maxMonthMean) * 100 : 0
            const h = Math.max(norm, 4)
            const bg = s.pct >= 10
              ? 'linear-gradient(180deg, #5eead4, #14b8a6)'
              : s.pct >= -10
                ? 'linear-gradient(180deg, #93c5fd, #3b82f6)'
                : '#e2e8f0'
            return (
              <div
                key={s.i}
                title={`${MONTHS_TR_FULL[s.i]}: ${s.pct >= 0 ? '+' : ''}${s.pct.toFixed(0)}%`}
                style={{ flex: 1, height: `${h}%`, background: bg, borderRadius: '3px 3px 0 0', transition: 'all .15s' }}
              />
            )
          })}
        </div>
        <div className="mb-2 flex justify-between text-[9.5px] font-bold text-muted-foreground">
          {MONTHS_TR.map((m, i) => <span key={i}>{m[0]}</span>)}
        </div>
        {topMonths.length > 0 && (
          <div className="text-[11px] leading-relaxed text-foreground/80">
            <strong className="font-semibold text-teal-700">Pik aylar:</strong>{' '}
            {topMonths.map((m) => MONTHS_TR_FULL[m.i].slice(0, 3)).join(', ')}{' '}
            <span className="text-muted-foreground">(+%{topMonths[0].pct.toFixed(0)} ortalamadan)</span>
          </div>
        )}
        {lowMonths.length > 0 && (
          <div className="mt-0.5 text-[11px] leading-relaxed text-foreground/80">
            <strong className="font-semibold text-rose-700">Düşük aylar:</strong>{' '}
            {lowMonths.map((m) => MONTHS_TR_FULL[m.i].slice(0, 3)).join(', ')}{' '}
            <span className="text-muted-foreground">(%{lowMonths[0].pct.toFixed(0)} ortalamadan)</span>
          </div>
        )}
      </InsightCard>

      {/* ─── Trend Analizi ─── */}
      <InsightCard
        accent="#8b5cf6"
        icon={ChartIncreaseIcon}
        title="Trend Analizi"
        info={{
          title: 'Trend Yönü ve Gücü',
          desc: 'Geçmiş veriye lineer regresyon uygulanarak hesaplanır. R² (determinasyon katsayısı) trend\'in serideki varyansı ne kadar açıkladığını gösterir.',
          detail: 'R² > 0.7 güçlü trend · 0.3-0.7 orta · <0.3 trend yok/zayıf, mevsim veya gürültü baskın.',
          formula: 'R² = SSR / SST',
        }}
      >
        <div className="mb-3 flex items-center gap-3">
          {/* 50x50 stroke-border ikon kutusu — büyük gösterim */}
          <div
            className="grid h-[50px] w-[50px] shrink-0 place-items-center rounded-xl border"
            style={{
              background:
                trendDir === 'up'
                  ? 'linear-gradient(135deg, rgba(16,185,129,.15), rgba(4,120,87,.08))'
                  : trendDir === 'down'
                    ? 'linear-gradient(135deg, rgba(244,63,94,.15), rgba(244,63,94,.08))'
                    : 'linear-gradient(135deg, rgba(0,0,0,.05), rgba(0,0,0,.02))',
              borderColor:
                trendDir === 'up' ? 'rgba(4,120,87,.20)' : trendDir === 'down' ? 'rgba(244,63,94,.20)' : 'rgba(0,0,0,.08)',
              color: trendDir === 'up' ? '#047857' : trendDir === 'down' ? '#be123c' : '#64748b',
            }}
          >
            <HugeiconsIcon
              icon={trendDir === 'up' ? TradeUpIcon : trendDir === 'down' ? TradeDownIcon : ChartLineData01Icon}
              size={26}
              strokeWidth={1.8}
            />
          </div>
          <div>
            <div
              className="text-[18px] font-extrabold tracking-tight"
              style={{ color: trendDir === 'up' ? '#047857' : trendDir === 'down' ? '#be123c' : '#0f172a' }}
            >
              {trendLabel}
            </div>
            <div className="mt-0.5 text-[10.5px] font-semibold text-muted-foreground tabular-nums">
              R² = {reg.r2.toFixed(2)} ·{' '}
              <span
                className="font-extrabold"
                style={{ color: reg.r2 >= 0.7 ? '#047857' : reg.r2 >= 0.3 ? '#b45309' : '#be123c' }}
              >
                {reg.r2 >= 0.7 ? 'güçlü' : reg.r2 >= 0.3 ? 'orta' : 'zayıf'}
              </span>{' '}
              açıklama
            </div>
          </div>
        </div>
        <div className="mb-2 h-[7px] overflow-hidden rounded-full border border-border bg-muted/40">
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{
              width: `${Math.min(reg.r2 * 100, 100)}%`,
              background:
                reg.r2 >= 0.7
                  ? 'linear-gradient(90deg, #5eead4, #047857)'
                  : reg.r2 >= 0.3
                    ? 'linear-gradient(90deg, #fbbf24, #f59e0b)'
                    : 'linear-gradient(90deg, #fb7185, #e11d48)',
            }}
          />
        </div>
        <p className="text-[10.5px] font-medium leading-relaxed text-muted-foreground">
          {reg.r2 >= 0.7
            ? 'Modeller bu trader\'da güvenle çalışır.'
            : reg.r2 >= 0.3
              ? 'Trend var ama varyans yüksek; tahmin koridor şeklinde yorumlanmalı.'
              : 'Trend belirsiz; mevsim veya gürültü baskın. Seasonal Naive sık kazanabilir.'}
        </p>
      </InsightCard>

      {/* ─── Tahmin Güveni ─── */}
      <InsightCard
        accent="#06b6d4"
        icon={CheckmarkBadge02Icon}
        title="Tahmin Güveni"
        info={{
          title: 'Tahmin Güven Seviyesi',
          desc: 'Aktif modelin backtest MAPE değerine göre belirlenir. Geçmişte ne kadar başarılıysa, gelecek tahmininin de o kadar güvenilir olması beklenir.',
          detail: 'High (<%10) · Medium (%10-20) · Low (>%20). Düşük güvende sayıları nokta tahmin değil koridor olarak yorumlayın.',
        }}
      >
        <div
          className="mb-3 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-extrabold tracking-tight"
          style={{ background: confMeta.bg, borderColor: confMeta.border, color: confMeta.color }}
        >
          <HugeiconsIcon icon={CheckmarkBadge02Icon} size={13} strokeWidth={2.2} />
          {confMeta.label}
        </div>
        <p className="text-[11px] font-medium leading-relaxed text-foreground/75">{confMeta.desc}</p>
        {mape != null && (
          <div className="mt-2.5 border-t border-border pt-2.5 text-[11px] font-medium text-muted-foreground tabular-nums">
            Backtest MAPE:{' '}
            <strong className="text-[13px] font-extrabold" style={{ color: confMeta.color }}>
              %{mape.toFixed(1)}
            </strong>
          </div>
        )}
      </InsightCard>
    </div>
  )
}

// Premium kartların ortak wrapper'ı — gradient şerit + hover lift + InfoTip slot
function InsightCard({ accent, icon, title, info, children }) {
  return (
    <section
      className="overflow-hidden rounded-2xl border border-border bg-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_12px_-2px_rgba(15,23,42,0.06),0_12px_28px_-8px_rgba(15,23,42,0.12)]"
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,.04), 0 4px 14px rgba(0,0,0,.05)' }}
    >
      <div className="px-4 py-3.5 md:px-5 md:py-4">
        <header className="mb-3 flex items-center gap-2">
          {/* Küçük kart kuralı: sadece renkli ikon, arka plan yok */}
          <HugeiconsIcon icon={icon} size={16} strokeWidth={2} color={accent} />
          <span className="flex-1 text-[11px] font-extrabold uppercase tracking-wider text-foreground">{title}</span>
          {info && <InfoTip {...info} iconSize={11} />}
        </header>
        {children}
      </div>
    </section>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Phase 4: ItemForecastTable — Top 30 ürün, sortable, sparkline
// ════════════════════════════════════════════════════════════════════════════
function ItemForecastTable({ result, useValue, horizon, chartView = 'total', onItemClick }) {
  const [sortCol, setSortCol] = useState('hAhead')
  const [sortDir, setSortDir] = useState(-1)
  const [showAll, setShowAll] = useState(false)

  const items = result.itemForecasts || []
  const rows = useMemo(() => {
    const enriched = items.map((it) => {
      // Geçmiş 12 ay toplam (kg) — son 12 ayın qty'leri
      const hist = it.qty || []
      const hist12 = it.last12 != null ? it.last12 : hist.slice(-12).reduce((a, b) => a + (b || 0), 0)
      // Tahmin toplam: reconcile sonrası varsa adjusted, yoksa hAhead
      const fcSum = it.hAheadAdjusted != null ? it.hAheadAdjusted : it.hAhead
      // YoY: tahmin döneminin geçen yıl aynı dönemine kıyası
      const normalizedHist = hist12 > 0 ? hist12 * horizon / 12 : 0
      const yoy = normalizedHist > 0 && fcSum != null ? ((fcSum - normalizedHist) / normalizedHist) * 100 : null
      // Best Fit ID + MAPE — it.fit içinden çek
      const bestId = it.fit?.bestId || null
      const bestModel = bestId ? FORECAST_MODELS.find((m) => m.id === bestId) : null
      const bestResult = bestId ? it.fit?.results?.find((r) => r.id === bestId) : null
      const mape = bestResult?.mape ?? null
      return {
        pid: it.pid,
        pname: it.name || null,
        hist12,
        hAhead: fcSum,
        yoy,
        bestId,
        bestLabel: bestModel?.label || null,
        mape,
        sparkline: hist.slice(-12),
        isStable: it.isStable !== false,
      }
    })
    enriched.sort((a, b) => {
      const av = a[sortCol]
      const bv = b[sortCol]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'string') return sortDir * av.localeCompare(bv)
      return sortDir * (av - bv)
    })
    return enriched
  }, [items, sortCol, sortDir, horizon])

  const visible = showAll ? rows : rows.slice(0, 10)
  const longTail = result.itemLongTail
  const reconcile = result.itemReconcile

  if (rows.length === 0) {
    return null
  }

  // Sayı formatlama: useValue ise $ + thousand-sep, değilse ton-formatlı
  const fmtCell = (v) => {
    if (v == null) return '—'
    if (useValue) return `$${Math.round(v).toLocaleString('tr-TR')}`
    return fmtTon(v)
  }

  // Tablo toplamları
  const totalHist12 = rows.reduce((s, r) => s + (r.hist12 || 0), 0)
  const totalHAhead = rows.reduce((s, r) => s + (r.hAhead || 0), 0)
  const totalYoy = totalHist12 > 0 ? ((totalHAhead - totalHist12 * horizon / 12) / (totalHist12 * horizon / 12)) * 100 : null

  const toggle = (col) => {
    if (sortCol === col) setSortDir((d) => -d)
    else { setSortCol(col); setSortDir(-1) }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.10)]">
      <header
        className="flex flex-wrap items-center gap-3 border-b border-border/60 px-4 py-3 md:px-5"
        style={{ background: 'linear-gradient(135deg, rgba(6,182,212,.04), rgba(99,102,241,.02))' }}
      >
        <div className="flex items-center gap-2.5">
          {/* Büyük section — cyan-indigo gradient (Tahmin Grafiği'nden farklı) */}
          <span
            className="grid h-8 w-8 place-items-center rounded-lg text-white"
            style={{
              background: 'linear-gradient(135deg, #06b6d4, #6366f1)',
              boxShadow: '0 3px 8px rgba(6,182,212,0.25), 0 1px 3px rgba(99,102,241,0.20)',
            }}
          >
            <HugeiconsIcon icon={PackageIcon} size={15} strokeWidth={2} />
          </span>
          <div>
            <h3 className="text-[13.5px] font-bold leading-tight text-foreground">Ürün Bazlı Tahmin</h3>
            <p className="text-[11px] font-medium text-muted-foreground">
              {rows.length} ürün <span className="text-foreground/40">·</span> Top {Math.min(rows.length, 30)} hacme göre
            </p>
          </div>
        </div>
        <InfoTip
          title="Ürün Bazlı Tahmin"
          desc="Trader'ın en çok satılan ilk 30 ürünü için ayrı ayrı forecast koşturuldu. Her ürünün kendi modelleri var, en iyi olan seçildi."
          detail="Proportional bottom-up reconciliation: Σ ürün tahminleri = trader toplam tahmini olacak şekilde pro-rata scaling yapılır."
        />
        <div className="ml-auto flex items-center gap-2">
          {reconcile && Math.abs(reconcile.scalingFactor - 1) > 0.02 && (
            <InfoTip
              title="Reconcile (Bottom-up Düzeltme)"
              desc="Top 30 ürünün tahmin toplamı, trader toplam tahmininden farklı çıktı. Pro-rata scaling ile her ürün tahmini bu farkı kapatacak şekilde ölçeklendirildi."
              detail={`Scaling factor: ${reconcile.scalingFactor.toFixed(3)} (${((reconcile.scalingFactor - 1) * 100).toFixed(1)}%). Σ itemid forecasts × factor = trader total.`}
              iconSize={11}
            />
          )}
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="border-b border-border bg-muted/30">
            <tr className="text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 text-center">#</th>
              <SortHead col="pid" cur={sortCol} dir={sortDir} onClick={toggle} className="px-3 py-2">Itemid · Ürün</SortHead>
              <SortHead col="hist12" cur={sortCol} dir={sortDir} onClick={toggle} align="right">Son 12 Ay</SortHead>
              <SortHead col="hAhead" cur={sortCol} dir={sortDir} onClick={toggle} align="right">Tahmin {horizon} Ay</SortHead>
              <SortHead col="yoy" cur={sortCol} dir={sortDir} onClick={toggle} align="right">YoY</SortHead>
              <th className="px-3 py-2 text-left">Best Model</th>
              <SortHead col="mape" cur={sortCol} dir={sortDir} onClick={toggle} align="right">MAPE</SortHead>
              <th className="px-3 py-2">Trend</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visible.map((r, i) => {
              const rankColor = i === 0 ? '#fbbf24' : i === 1 ? '#94a3b8' : i === 2 ? '#cd7f32' : null
              const isSelected = chartView === r.pid
              const handleRowClick = onItemClick
                ? () => onItemClick(isSelected ? 'total' : r.pid)
                : undefined
              return (
                <tr
                  key={r.pid}
                  className={`group transition-colors ${onItemClick ? 'cursor-pointer' : ''} ${isSelected ? '' : 'hover:bg-muted/30'}`}
                  onClick={handleRowClick}
                  style={isSelected ? {
                    background: 'linear-gradient(90deg, rgba(59,130,246,.12), rgba(6,182,212,.05))',
                    boxShadow: 'inset 3px 0 0 0 #3b82f6',
                  } : undefined}
                  title={onItemClick ? (isSelected ? 'Tıkla → grafiği trader toplamına döndür' : 'Tıkla → grafiği bu ürünün serisine al') : undefined}
                >
                  <td className="px-3 py-2 text-center">
                    {rankColor ? (
                      <span
                        className="inline-grid h-5 w-5 place-items-center rounded-md text-[9px] font-extrabold text-white"
                        style={{
                          background: `linear-gradient(135deg, ${rankColor}, ${rankColor}cc)`,
                          boxShadow: `0 1px 3px ${rankColor}55`,
                        }}
                      >
                        {i + 1}
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground tabular-nums">{i + 1}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex min-w-0 flex-col leading-tight">
                      <span className="font-bold text-foreground" title={r.pname ? `${r.pid} • ${r.pname}` : r.pid}>{r.pid}</span>
                      {r.pname && (
                        <span className="mt-0.5 truncate text-[10.5px] font-medium text-muted-foreground" title={r.pname}>
                          {r.pname}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtCell(r.hist12)}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-foreground">{fmtCell(r.hAhead)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.yoy == null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className={`inline-flex items-center gap-0.5 ${r.yoy >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        <HugeiconsIcon icon={r.yoy >= 0 ? TradeUpIcon : TradeDownIcon} size={11} strokeWidth={2.2} />
                        {r.yoy >= 0 ? '+' : ''}{r.yoy.toFixed(1)}%
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[11px]">
                    {r.bestLabel ? (
                      <span className="font-semibold text-foreground/80">{r.bestLabel}</span>
                    ) : (
                      <span className="italic text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-extrabold ${mapeColorCls(r.mape)}`}>
                      {r.mape == null ? '—' : `%${r.mape.toFixed(1)}`}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <Sparkline values={r.sparkline} />
                  </td>
                </tr>
              )
            })}
            {longTail && longTail.count > 0 && showAll && (
              <tr className="bg-muted/20 text-[11px] text-muted-foreground">
                <td colSpan={8} className="px-3 py-2 italic">
                  + {longTail.count} uzun kuyruk ürün — toplam {fmtCell(longTail.qty)}
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="border-t-2 border-border" style={{ background: 'linear-gradient(180deg, rgba(248,250,252,0.7), rgba(241,245,249,0.5))' }}>
            <tr className="text-[11.5px]">
              <td className="px-3 py-2.5"></td>
              <td className="px-3 py-2.5 text-[10.5px] font-extrabold uppercase tracking-wider text-foreground/70">
                Toplam ({visible.length} ürün)
              </td>
              <td className="px-3 py-2.5 text-right font-extrabold tabular-nums text-foreground">{fmtCell(totalHist12)}</td>
              <td className="px-3 py-2.5 text-right font-extrabold tabular-nums text-foreground">{fmtCell(totalHAhead)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {totalYoy == null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <span className={`inline-flex items-center gap-0.5 font-bold ${totalYoy >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {totalYoy >= 0 ? '+' : ''}{totalYoy.toFixed(1)}%
                  </span>
                )}
              </td>
              <td className="px-3 py-2.5"></td>
              <td className="px-3 py-2.5"></td>
              <td className="px-3 py-2.5"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {rows.length > 10 && (
        <div className="border-t border-border bg-muted/20 px-4 py-2.5 text-center">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-[12px] font-semibold text-primary hover:underline"
          >
            {showAll ? '← İlk 10 ürünü göster' : `+ ${rows.length - 10} ürün daha göster →`}
          </button>
        </div>
      )}
    </section>
  )
}

function SortHead({ col, cur, dir, onClick, children, align = 'left', className = '' }) {
  const isActive = cur === col
  return (
    <th className={`${className} ${align === 'right' ? 'px-3 py-2 text-right' : 'px-3 py-2'} cursor-pointer select-none transition hover:text-foreground`} onClick={() => onClick(col)}>
      <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''} ${isActive ? 'text-primary' : ''}`}>
        {children}
        {isActive && (dir < 0 ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />)}
      </span>
    </th>
  )
}

function Sparkline({ values }) {
  if (!values || values.length === 0) return null
  const vals = values.map((v) => v || 0)
  const max = Math.max(1, ...vals)
  const W = 60, H = 18
  const xAt = (i) => (i * W) / Math.max(1, vals.length - 1)
  const yAt = (v) => H - (v / max) * (H - 2) - 1
  const path = vals.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`).join(' ')
  return (
    <svg width={W} height={H} aria-hidden="true">
      <path d={path} fill="none" stroke="#0a3d8f" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={xAt(vals.length - 1)} cy={yAt(vals[vals.length - 1])} r="1.8" fill="#f07a23" />
    </svg>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Phase 4: MonthlyDetailTable — Ay/Tahmin/Alt-Üst/Geçen yıl/YoY
// ════════════════════════════════════════════════════════════════════════════
function MonthlyDetailTable({ forecastKeys, forecastPts, forecastLow, forecastUp, histArr, histKeys, useValue }) {
  const histMap = useMemo(() => {
    const m = new Map()
    for (let i = 0; i < histKeys.length; i++) m.set(histKeys[i], histArr[i])
    return m
  }, [histArr, histKeys])

  const fmtCell = (v) => {
    if (v == null) return '—'
    if (useValue) return `$${Math.round(v).toLocaleString('tr-TR')}`
    return fmtTon(v)
  }

  if (!forecastKeys.length) return null

  // Toplamlar
  const totalFc = forecastPts.reduce((a, b) => a + (b || 0), 0)
  const totalLow = forecastLow?.reduce((a, b) => a + (b || 0), 0) || 0
  const totalUp = forecastUp?.reduce((a, b) => a + (b || 0), 0) || 0
  const lyValues = forecastKeys.map((k) => {
    const [yy, mm] = k.split('-')
    return histMap.get(`${+yy - 1}-${mm}`)
  })
  const totalLy = lyValues.reduce((a, b) => a + (b || 0), 0)
  const totalYoy = totalLy > 0 ? ((totalFc - totalLy) / totalLy) * 100 : null

  return (
    <section className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.10)]">
      <header
        className="flex items-center gap-2.5 border-b border-border px-4 py-3 md:px-5"
        style={{ background: 'linear-gradient(135deg, rgba(20,184,166,.05), rgba(13,148,136,.02))' }}
      >
        {/* Büyük section — teal gradient ikon kutusu */}
        <span
          className="grid h-8 w-8 place-items-center rounded-lg text-white"
          style={{
            background: 'linear-gradient(135deg, #14b8a6, #0d9488)',
            boxShadow: '0 2px 6px rgba(20,184,166,0.22)',
          }}
        >
          <HugeiconsIcon icon={CalendarAnalysisIcon} size={15} strokeWidth={2} />
        </span>
        <div className="flex-1">
          <h3 className="text-[13.5px] font-bold leading-tight text-foreground">Aylık Tahmin Detayı</h3>
          <p className="text-[11px] font-medium text-muted-foreground">{forecastKeys.length} aylık projeksiyon + geçen yıl karşılaştırma</p>
        </div>
        <InfoTip
          title="Aylık Tahmin Detayı"
          desc="Tahmin döneminin her ayı için: nokta tahmin, güven aralığı (Alt-Üst), geçen yıl aynı ay ve YoY değişim yüzdesi."
          detail="Alt-Üst koridor genelde ±2σ (yaklaşık %95 güven). Mevsimsellik düşük güvende koridor genişler. Yıllık ortalama aşağıda toplam satırında."
        />
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="border-b border-border bg-muted/30">
            <tr className="text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2">Ay</th>
              <th className="px-3 py-2 text-right">Tahmin</th>
              <th className="px-3 py-2 text-right">Alt — Üst</th>
              <th className="px-3 py-2 text-right">Geçen Yıl</th>
              <th className="px-3 py-2 text-right">YoY %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {forecastKeys.map((k, i) => {
              const [yy, mm] = k.split('-')
              const ly = histMap.get(`${+yy - 1}-${mm}`)
              const fc = forecastPts[i]
              const yoy = ly != null && ly > 0 ? ((fc - ly) / ly) * 100 : null
              return (
                <tr key={k} className="hover:bg-muted/30">
                  <td className="px-3 py-2 font-semibold text-foreground">{MONTHS_TR_FULL[+mm - 1]} {yy}</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums text-foreground">{fmtCell(fc)}</td>
                  <td className="px-3 py-2 text-right text-[11px] tabular-nums text-muted-foreground">
                    {fmtCell(forecastLow?.[i])} — {fmtCell(forecastUp?.[i])}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmtCell(ly)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {yoy == null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className={`font-semibold ${yoy >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {yoy >= 0 ? '+' : ''}{yoy.toFixed(1)}%
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="border-t-2 border-border" style={{ background: 'linear-gradient(180deg, rgba(248,250,252,0.7), rgba(241,245,249,0.5))' }}>
            <tr className="text-[11.5px]">
              <td className="px-3 py-2.5 text-[10.5px] font-extrabold uppercase tracking-wider text-foreground/70">
                Toplam ({forecastKeys.length} ay)
              </td>
              <td className="px-3 py-2.5 text-right font-extrabold tabular-nums text-foreground">{fmtCell(totalFc)}</td>
              <td className="px-3 py-2.5 text-right text-[11px] tabular-nums text-muted-foreground">
                {fmtCell(totalLow)} — {fmtCell(totalUp)}
              </td>
              <td className="px-3 py-2.5 text-right font-bold tabular-nums text-muted-foreground">{fmtCell(totalLy)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {totalYoy == null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <span className={`font-bold ${totalYoy >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {totalYoy >= 0 ? '+' : ''}{totalYoy.toFixed(1)}%
                  </span>
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Phase 4: ModelComparisonTable — Tüm modeller MAPE sıralı
// ════════════════════════════════════════════════════════════════════════════
function ModelComparisonTable({ fit, histKeys }) {
  const sorted = useMemo(() => {
    const arr = [...fit.results]
    return arr.sort((a, b) => {
      if (a.skipped && !b.skipped) return 1
      if (!a.skipped && b.skipped) return -1
      const am = a.mape == null ? Infinity : a.mape
      const bm = b.mape == null ? Infinity : b.mape
      return am - bm
    })
  }, [fit])

  const holdoutMonths = Math.min(6, Math.floor((histKeys?.length || 0) / 6))

  return (
    <section className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.10)]">
      <header
        className="flex flex-wrap items-center gap-2.5 border-b border-border px-4 py-3 md:px-5"
        style={{ background: 'linear-gradient(135deg, rgba(244,63,94,.05), rgba(236,72,153,.02))' }}
      >
        {/* Büyük section — rose gradient kutusu */}
        <span
          className="grid h-8 w-8 place-items-center rounded-lg text-white"
          style={{
            background: 'linear-gradient(135deg, #f43f5e, #ec4899)',
            boxShadow: '0 2px 6px rgba(244,63,94,0.22)',
          }}
        >
          <HugeiconsIcon icon={PercentSquareIcon} size={15} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[13.5px] font-bold leading-tight text-foreground">Model Karşılaştırma</h3>
          <p className="text-[11px] font-medium text-muted-foreground">
            Backtest MAPE · {holdoutMonths || 6} ay holdout · düşük MAPE = daha doğru
          </p>
        </div>
        <InfoTip
          title="Model Karşılaştırma"
          desc="8 model paralel koşturuldu, her birinin backtest MAPE değeri hesaplandı. En düşük MAPE'li model otomatik Best Fit olarak işaretlendi."
          detail="Kart üzerine tıklayarak istediğin modeli aktif yapabilirsin — grafik o modelin tahminini gösterir."
        />
      </header>

      <div className="grid grid-cols-1 gap-2.5 p-3.5 md:grid-cols-2 lg:grid-cols-3 md:p-4">
        {sorted.map((r) => {
          const isBest = r.id === fit.bestId
          const Icon = MODEL_ICON_MAP[r.id] || ChartLineData01Icon
          const meta = FORECAST_MODELS.find((m) => m.id === r.id)
          const mapeColor = r.mape == null
            ? '#64748b'
            : r.mape < 10
              ? '#047857'
              : r.mape < 20
                ? '#b45309'
                : r.mape < 30
                  ? '#b85216'
                  : '#be123c'
          const mapeBg = r.mape == null
            ? 'rgba(100,116,139,.10)'
            : r.mape < 10
              ? 'rgba(16,185,129,.12)'
              : r.mape < 20
                ? 'rgba(245,158,11,.12)'
                : r.mape < 30
                  ? 'rgba(240,122,35,.12)'
                  : 'rgba(244,63,94,.12)'
          return (
            <div
              key={r.id}
              className={`relative rounded-xl border p-3 transition-all ${r.skipped ? 'cursor-not-allowed opacity-55' : 'hover:-translate-y-0.5 hover:shadow-[0_4px_12px_-2px_rgba(15,23,42,0.08)]'}`}
              style={{
                borderColor: isBest ? 'rgba(4,120,87,.30)' : r.skipped ? 'rgba(0,0,0,.08)' : undefined,
                background: isBest
                  ? 'linear-gradient(135deg, rgba(16,185,129,.06), rgba(59,130,246,.04))'
                  : r.skipped
                    ? 'rgba(0,0,0,.02)'
                    : undefined,
                boxShadow: isBest ? '0 2px 8px rgba(4,120,87,.08)' : undefined,
              }}
            >
              <div className="mb-1.5 flex items-center gap-2">
                {isBest ? (
                  <span
                    className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white"
                    style={{ background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', boxShadow: '0 1px 3px rgba(251,191,36,.30)' }}
                  >
                    <Star className="h-2.5 w-2.5 fill-current" strokeWidth={0} /> Best
                  </span>
                ) : (
                  <span
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-md"
                    style={{
                      background: r.skipped ? 'rgba(0,0,0,.04)' : 'rgba(59,130,246,.08)',
                      color: r.skipped ? '#cbd5e1' : '#1d4ed8',
                    }}
                  >
                    <HugeiconsIcon icon={Icon} size={12} strokeWidth={1.9} />
                  </span>
                )}
                <div
                  className={`flex-1 truncate text-[12.5px] leading-tight ${isBest ? 'font-extrabold' : 'font-bold'}`}
                  style={{ color: r.skipped ? '#cbd5e1' : '#0f172a' }}
                >
                  {meta?.label || r.label}
                </div>
                <span
                  className="rounded px-1.5 py-0.5 text-[10.5px] font-extrabold tabular-nums"
                  style={{ background: mapeBg, color: mapeColor }}
                >
                  {r.skipped ? '—' : r.mape != null ? `MAPE %${r.mape.toFixed(1)}` : 'MAPE —'}
                </span>
              </div>
              <p className="mb-1 text-[10.5px] font-medium text-muted-foreground">{meta?.short || ''}</p>
              {r.skipped ? (
                <div
                  className="rounded px-2 py-1 text-[10.5px] italic"
                  style={{ background: 'rgba(240,122,35,.10)', color: '#b85216' }}
                >
                  ⚠ {r.reason || 'Atlandı'}
                </div>
              ) : (
                <p className="text-[10.5px] leading-relaxed text-foreground/70">{meta?.whenToUse || ''}</p>
              )}
            </div>
          )
        })}
      </div>

      {/* MAPE Nedir? açıklama bandı */}
      <footer
        className="flex items-start gap-2.5 border-t border-border px-4 py-3 md:px-5"
        style={{ background: 'linear-gradient(180deg, #fafbfc, #f5f7fa)' }}
      >
        <span
          className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md"
          style={{ background: 'rgba(59,130,246,.10)', color: '#1d4ed8' }}
        >
          <Info size={14} strokeWidth={2} />
        </span>
        <div className="text-[11.5px] leading-relaxed text-foreground/85">
          <div className="mb-0.5 text-[12px] font-extrabold text-foreground">MAPE Nedir?</div>
          <p>
            <strong className="font-bold text-foreground">Mean Absolute Percentage Error</strong> — modelin geçmiş veride yaptığı tahminlerin
            gerçek değerlerden ortalama yüzde sapması. Son{' '}
            <strong className="font-bold text-foreground tabular-nums">{holdoutMonths || 6} ay</strong> tutulup geri kalan tarihçe ile model
            eğitildi, sonra saklanan aylar tahmin edilip gerçek değerle kıyaslandı.{' '}
            <strong className="font-bold text-emerald-700">%0-10 mükemmel</strong>
            {' · '}
            <strong className="font-bold text-amber-700">%10-20 kabul edilebilir</strong>
            {' · '}
            <strong className="font-bold text-rose-700">%20+ gürültülü/güvensiz</strong>.
          </p>
        </div>
      </footer>
    </section>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Phase 5: ScenarioDrawer — floating right drawer with what-if controls
// ════════════════════════════════════════════════════════════════════════════
function ScenarioDrawer({ open, onClose, scenario, setScenario, scenarioResult, profile, useValue }) {
  if (!open) return null

  const topDest = (profile?.topDestinations || profile?.topAccounts || []).slice(0, 5)
  const topCompanies = (profile?.topCompanies || []).slice(0, 5)

  const update = (patch) => setScenario((s) => ({ ...s, ...patch }))
  const reset = () => setScenario(DEFAULT_SCENARIO)

  const baselineTotal = scenarioResult?.baselineTotal || 0
  const adjustedTotal = scenarioResult?.adjustedTotal || 0
  const deltaPct = scenarioResult?.deltaPct
  const fmtBig = (v) => {
    if (v == null) return '—'
    if (useValue) return `$${Math.round(v).toLocaleString('tr-TR')}`
    return fmtTon(v)
  }

  const volPct = Math.round((scenario.volumeMult - 1) * 100)
  const volSnaps = [-50, -25, 0, 25, 50]

  return (
    <>
      {/* Backdrop — blurred with fade-in */}
      <div
        className="fixed inset-0 z-40"
        style={{
          background: 'rgba(15,23,42,.42)',
          backdropFilter: 'blur(3px)',
          WebkitBackdropFilter: 'blur(3px)',
          animation: 'scnFade .25s ease-out',
        }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer — slide-in from right */}
      <aside
        role="dialog"
        aria-label="Simülasyon"
        className="fixed bottom-2 right-2 top-2 z-50 flex w-[min(480px,calc(100vw-1rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card"
        style={{
          boxShadow: '0 24px 64px -12px rgba(15,23,42,0.32), 0 8px 24px -6px rgba(15,23,42,0.18)',
          animation: 'scnSlideR .3s cubic-bezier(.16,1,.3,1)',
        }}
      >
        <style>{`
          @keyframes scnFade { 0% { opacity: 0 } 100% { opacity: 1 } }
          @keyframes scnSlideR { 0% { transform: translateX(105%) } 100% { transform: translateX(0) } }
          .scn-slider { appearance: none; -webkit-appearance: none; width: 100%; height: 7px; border-radius: 4px;
            background: linear-gradient(90deg, rgba(240,122,35,.18), rgba(240,122,35,.30), rgba(240,122,35,.18));
            outline: none; cursor: pointer; }
          .scn-slider::-webkit-slider-thumb { appearance: none; -webkit-appearance: none; width: 20px; height: 20px;
            border-radius: 50%; background: linear-gradient(135deg, #f07a23 0%, #ea580c 100%);
            box-shadow: 0 2px 8px rgba(240,122,35,.45), 0 1px 3px rgba(240,122,35,.30), inset 0 1px 0 rgba(255,255,255,.30);
            border: 2px solid #fff; cursor: pointer; transition: transform .15s, box-shadow .15s; }
          .scn-slider::-webkit-slider-thumb:hover { transform: scale(1.15);
            box-shadow: 0 4px 14px rgba(240,122,35,.55), 0 2px 5px rgba(240,122,35,.40); }
          .scn-slider::-moz-range-thumb { width: 20px; height: 20px; border-radius: 50%;
            background: linear-gradient(135deg, #f07a23, #ea580c); box-shadow: 0 2px 8px rgba(240,122,35,.45);
            border: 2px solid #fff; cursor: pointer; }
        `}</style>

        {/* Top accent strip */}
        <div aria-hidden="true" className="h-[3px] shrink-0" style={{ background: 'linear-gradient(90deg, #f07a23 0%, #ea580c 50%, #c2410c 100%)' }} />

        {/* Header — glassmorphism orange gradient */}
        <header
          className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-5 py-4"
          style={{ background: 'linear-gradient(135deg, rgba(240,122,35,.06) 0%, rgba(234,88,12,.02) 50%, rgba(255,255,255,0) 100%)' }}
        >
          <div className="flex min-w-0 items-center gap-3">
            {/* Hero icon — 44px orange gradient with inset highlight */}
            <span
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white"
              style={{
                background: 'linear-gradient(135deg, #f07a23 0%, #ea580c 100%)',
                boxShadow: '0 4px 14px rgba(240,122,35,.32), 0 1px 3px rgba(240,122,35,.20), inset 0 1px 0 rgba(255,255,255,.22)',
              }}
            >
              <HugeiconsIcon icon={AiLaptopIcon} size={22} strokeWidth={1.7} />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-[16px] font-extrabold leading-tight tracking-tight text-foreground">Simülasyon</h2>
              <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">What-if öngörü modeli · canlı önizleme</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            aria-label="Kapat"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={2} />
          </button>
        </header>

        {/* Summary banner (when active) */}
        {scenarioResult?.isActive && (
          <div
            className="shrink-0 border-b border-border px-5 py-3"
            style={{ background: 'linear-gradient(135deg, rgba(240,122,35,.10), rgba(234,88,12,.04))' }}
          >
            <div className="flex items-center justify-between text-[11px] font-semibold">
              <span className="uppercase tracking-wider text-orange-700/80">Baseline → Senaryo</span>
              <span
                className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10.5px] font-extrabold tabular-nums ${
                  deltaPct >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                }`}
              >
                <HugeiconsIcon icon={FlashIcon} size={9} strokeWidth={2.5} />
                Δ {deltaPct >= 0 ? '+' : ''}{deltaPct?.toFixed(1)}%
              </span>
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-2">
              <span className="text-[13px] text-muted-foreground line-through tabular-nums">{fmtBig(baselineTotal)}</span>
              <span className="text-[18px] font-extrabold tabular-nums text-foreground">{fmtBig(adjustedTotal)}</span>
            </div>
          </div>
        )}

        {/* Scroll content */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* Volume slider */}
          <FieldGroup
            label="Volume Çarpanı"
            hint={`${volPct >= 0 ? '+' : ''}${volPct}%`}
            hintEmphasis={volPct !== 0}
            info={{
              title: 'Volume Çarpanı',
              desc: 'Tüm tahmin değerlerinin yüzde değişimi — tüm aylara homojen olarak uygulanır.',
              detail: 'Pozitif değer fırsat senaryosu (yeni anlaşma, kapasite artışı). Negatif değer risk senaryosu (kapasite kısıtı, talep daralması).',
            }}
          >
            <input
              type="range"
              min={-50} max={50} step={5}
              value={volPct}
              onChange={(e) => update({ volumeMult: 1 + Number(e.target.value) / 100 })}
              className="scn-slider"
            />
            <div className="mt-2 flex justify-between gap-1">
              {volSnaps.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => update({ volumeMult: 1 + v / 100 })}
                  className={`flex-1 rounded-md px-2 py-1 text-[10.5px] font-bold tabular-nums transition ${
                    volPct === v
                      ? 'bg-orange-500 text-white shadow-sm'
                      : 'border border-border bg-card text-foreground/70 hover:border-orange-300 hover:text-orange-700'
                  }`}
                >
                  {v > 0 ? '+' : ''}{v}%
                </button>
              ))}
            </div>
          </FieldGroup>

          {/* Mevsim shift */}
          <FieldGroup
            label="Mevsim Kayması"
            hint={`${scenario.seasonalShift > 0 ? '+' : ''}${scenario.seasonalShift} ay`}
            hintEmphasis={scenario.seasonalShift !== 0}
            info={{
              title: 'Mevsim Kayması',
              desc: 'Mevsim profilini ±3 ay kaydırır. Pikler erkene/geçe alınır.',
              detail: 'Ramazan kayması, hasat geç gelmesi, mevsim normalleri dışı pattern\'lar için kullanılır.',
            }}
          >
            <input
              type="range"
              min={-3} max={3} step={1}
              value={scenario.seasonalShift}
              onChange={(e) => update({ seasonalShift: Number(e.target.value) })}
              className="scn-slider"
            />
            <div className="mt-1.5 flex justify-between text-[9.5px] font-semibold text-muted-foreground">
              <span>-3 ay erken</span><span>0</span><span>+3 ay geç</span>
            </div>
          </FieldGroup>

          {/* Müşteri kayıp */}
          {topDest.length > 0 && (
            <FieldGroup
              label="Müşteri Kaybı (Top 5)"
              hint={`${scenario.lostCustomers.length} seçili`}
              hintEmphasis={scenario.lostCustomers.length > 0}
              info={{
                title: 'Müşteri Kaybı Senaryosu',
                desc: 'Seçili müşterilerin geçmiş paylarının toplamı tahminden düşülür.',
                detail: 'Örnek: Top 1 müşteri %30 paya sahipse, kayıp durumunda tahmin %30 düşer (pro-rata).',
              }}
            >
              <div className="space-y-1">
                {topDest.map((d) => {
                  const id = d.id || d.n || d.name
                  const display = d.name && d.name !== id ? d.name : null
                  const checked = scenario.lostCustomers.includes(id)
                  return (
                    <label
                      key={id}
                      className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-[12px] transition-colors ${
                        checked ? 'border-orange-300 bg-orange-50/60' : 'border-border bg-card hover:bg-muted/40'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          update({ lostCustomers: e.target.checked ? [...scenario.lostCustomers, id] : scenario.lostCustomers.filter((x) => x !== id) })
                        }
                        className="accent-orange-500"
                      />
                      <span className="min-w-0 flex-1 truncate" title={display ? `${id} • ${display}` : id}>
                        <span className="font-bold text-foreground">{id}</span>
                        {display && <span className="font-medium text-muted-foreground"> • {display}</span>}
                      </span>
                      {d.pct != null && (
                        <span className="shrink-0 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-extrabold tabular-nums text-orange-700">
                          %{d.pct.toFixed(1)}
                        </span>
                      )}
                    </label>
                  )
                })}
              </div>
            </FieldGroup>
          )}

          {/* Origin kayıp */}
          {topCompanies.length > 0 && (
            <FieldGroup
              label="Origin Kaybı (Şirket Grubu)"
              hint={`${scenario.lostOrigins.length} seçili`}
              hintEmphasis={scenario.lostOrigins.length > 0}
              info={{
                title: 'Origin (Şirket) Kaybı',
                desc: 'Seçili şirket grubunun payı tahminden düşülür.',
                detail: 'Tedarik daralması veya bir grubun kapanması senaryosunda kullanılır.',
              }}
            >
              <div className="space-y-1">
                {topCompanies.map((c) => {
                  const id = c.id || c.n || c.name
                  const display = c.name && c.name !== id ? c.name : null
                  const checked = scenario.lostOrigins.includes(id)
                  return (
                    <label
                      key={id}
                      className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-[12px] transition-colors ${
                        checked ? 'border-orange-300 bg-orange-50/60' : 'border-border bg-card hover:bg-muted/40'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          update({ lostOrigins: e.target.checked ? [...scenario.lostOrigins, id] : scenario.lostOrigins.filter((x) => x !== id) })
                        }
                        className="accent-orange-500"
                      />
                      <span className="min-w-0 flex-1 truncate" title={display ? `${id} • ${display}` : id}>
                        <span className="font-bold text-foreground">{id}</span>
                        {display && <span className="font-medium text-muted-foreground"> • {display}</span>}
                      </span>
                      {c.pct != null && (
                        <span className="shrink-0 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-extrabold tabular-nums text-orange-700">
                          %{c.pct.toFixed(1)}
                        </span>
                      )}
                    </label>
                  )
                })}
              </div>
            </FieldGroup>
          )}

          {/* Hedef Backcast */}
          <FieldGroup
            label="Hedef Backcast"
            hint={scenario.targetVolume ? fmtBig(scenario.targetVolume) : 'Hedef yok'}
            hintEmphasis={!!scenario.targetVolume}
            info={{
              title: 'Hedef Backcast (Geri-Projeksiyon)',
              desc: 'Bir hedef toplam belirleyerek, baseline tahminin bu hedefe nasıl ölçeklenmesi gerektiğini görürsün.',
              whenToUse: 'Bütçe hedefi konuldu mu, "bu hedefe ulaşmak için aylık ne yapmalıyız?" sorusuna anında cevap verir. Hedef gerçekçi mi (easy/moderate/hard/unrealistic) skorlanır.',
              detail: 'Mevcut tahminin aylık şekli korunur, sadece total ölçeklenir: shape × (target / baseline_total). Gerekli yıllık büyüme oranı (last12\'ye göre) hesaplanır.',
              formula: 'monthly[i] = forecast[i] × (target / Σforecast)',
            }}
          >
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder={`Hedef ${useValue ? 'tutar ($)' : 'miktar (kg)'} gir…`}
                  value={scenario.targetVolume ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^\d.]/g, '')
                    const num = raw === '' ? null : Number(raw)
                    update({ targetVolume: Number.isFinite(num) && num > 0 ? num : null })
                  }}
                  className="flex-1 rounded-md border border-border bg-card px-3 py-2 text-[12.5px] font-semibold text-foreground outline-none transition focus:border-orange-300 focus:bg-card tabular-nums"
                />
                {scenario.targetVolume != null && (
                  <button
                    type="button"
                    onClick={() => update({ targetVolume: null })}
                    className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    title="Hedefi temizle"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={13} strokeWidth={2} />
                  </button>
                )}
              </div>
              {/* Hızlı önaylar — baseline'a göre %X büyüme */}
              {scenarioResult?.baselineTotal > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {[-0.10, 0, 0.10, 0.25, 0.50].map((g) => {
                    const target = Math.round(scenarioResult.baselineTotal * (1 + g))
                    const active = scenario.targetVolume === target
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => update({ targetVolume: g === 0 ? null : target })}
                        className={`rounded-md px-2 py-1 text-[10.5px] font-bold tabular-nums transition ${
                          active
                            ? 'bg-orange-500 text-white shadow-sm'
                            : 'border border-border bg-card text-foreground/70 hover:border-orange-300 hover:text-orange-700'
                        }`}
                      >
                        {g === 0 ? 'Baseline' : `${g > 0 ? '+' : ''}${(g * 100).toFixed(0)}%`}
                      </button>
                    )
                  })}
                </div>
              )}
              {/* Feasibility göstergesi */}
              {scenarioResult?.backcastInfo?.feasibilityScore && (() => {
                const fb = scenarioResult.backcastInfo
                const tone = fb.feasibilityScore === 'easy'
                  ? { label: 'Kolay erişilebilir', color: '#047857', bg: 'rgba(16,185,129,.12)', border: 'rgba(4,120,87,.22)' }
                  : fb.feasibilityScore === 'moderate'
                    ? { label: 'Orta zorluk', color: '#b45309', bg: 'rgba(245,158,11,.12)', border: 'rgba(245,158,11,.25)' }
                    : fb.feasibilityScore === 'hard'
                      ? { label: 'Zor — agresif hedef', color: '#b85216', bg: 'rgba(240,122,35,.12)', border: 'rgba(240,122,35,.25)' }
                      : { label: 'Gerçekçi değil', color: '#be123c', bg: 'rgba(244,63,94,.12)', border: 'rgba(244,63,94,.25)' }
                return (
                  <div
                    className="flex items-start gap-2 rounded-md border px-2.5 py-2 text-[10.5px] leading-relaxed"
                    style={{ background: tone.bg, borderColor: tone.border, color: tone.color }}
                  >
                    <HugeiconsIcon icon={FlashIcon} size={11} strokeWidth={2.4} className="mt-0.5 shrink-0" />
                    <div>
                      <div className="font-extrabold tracking-tight">{tone.label}</div>
                      {fb.requiredAvgGrowth != null && (
                        <div className="mt-0.5 opacity-90 tabular-nums">
                          Gerekli yıllık büyüme:{' '}
                          <strong>
                            {fb.requiredAvgGrowth >= 0 ? '+' : ''}
                            {fb.requiredAvgGrowth.toFixed(1)}%
                          </strong>
                        </div>
                      )}
                      <div className="mt-0.5 opacity-75 tabular-nums">Ölçek faktörü: ×{fb.factor.toFixed(2)}</div>
                    </div>
                  </div>
                )
              })()}
            </div>
          </FieldGroup>

          {/* Monte Carlo */}
          <FieldGroup
            label="Monte Carlo Güven Aralığı"
            hint={scenario.showMC ? 'AÇIK' : 'KAPALI'}
            hintEmphasis={!!scenario.showMC}
            info={{
              title: 'Monte Carlo Simülasyonu',
              desc: 'Geçmiş tahmin hatalarını rastgele örnekleyerek 200 senaryo koşturulur. En kötü %10 (P10) ile en iyi %10 (P90) arası bir koridor çıkarır.',
              whenToUse: 'Tek nokta tahmin yerine "olası en kötü/en iyi" senaryoları görmek için. Yatırım kararlarında risk gözetiminde kullan.',
              detail: 'Wild bootstrap residual yöntemi. Bant ne kadar dar = tahmin o kadar güvenli. Çok geniş bant = seri belirsiz, tek noktayı baz alma.',
              formula: 'P10 / P50 (medyan) / P90',
            }}
          >
            <label
              className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-[12px] transition-colors ${
                scenario.showMC ? 'border-orange-300 bg-orange-50/60' : 'border-border bg-card hover:bg-muted/40'
              }`}
            >
              <input
                type="checkbox"
                checked={!!scenario.showMC}
                onChange={(e) => update({ showMC: e.target.checked })}
                className="accent-orange-500"
              />
              <span className="flex-1 font-medium text-foreground">200 simülasyon ile P10/P90 bant</span>
              {scenario.showMC && (
                <HugeiconsIcon icon={FlashIcon} size={12} strokeWidth={2.4} className="text-orange-600" />
              )}
            </label>
          </FieldGroup>
        </div>

        {/* Footer — gradient action row */}
        <footer
          className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-5 py-3"
          style={{ background: 'linear-gradient(180deg, #fafbfc, #f5f7fa)' }}
        >
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-card px-3 py-1.5 text-[12px] font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-50"
          >
            <HugeiconsIcon icon={RotateClockwiseIcon} size={13} strokeWidth={2.2} />
            Sıfırla
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-[12px] font-bold text-white transition-all"
            style={{
              background: 'linear-gradient(135deg, #f07a23, #ea580c)',
              boxShadow: '0 2px 8px rgba(240,122,35,.32), 0 1px 2px rgba(240,122,35,.18)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)'
              e.currentTarget.style.boxShadow = '0 4px 14px rgba(240,122,35,.42), 0 2px 5px rgba(240,122,35,.25)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(240,122,35,.32), 0 1px 2px rgba(240,122,35,.18)'
            }}
          >
            <HugeiconsIcon icon={Cancel01Icon} size={13} strokeWidth={2.5} />
            Kapat
          </button>
        </footer>
      </aside>
    </>
  )
}

function FieldGroup({ label, hint, hintEmphasis, info, children }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <label className="text-[11px] font-extrabold uppercase tracking-wider text-foreground/80">{label}</label>
          {info && <InfoTip {...info} iconSize={10} />}
        </div>
        {hint && (
          <span
            className={`shrink-0 text-[10.5px] font-extrabold tabular-nums ${
              hintEmphasis ? 'rounded bg-orange-100 px-1.5 py-0.5 text-orange-700' : 'text-muted-foreground'
            }`}
          >
            {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Phase 6: Excel export — SheetJS lazy CDN load, 4-5 sheets
// ════════════════════════════════════════════════════════════════════════════
function exportExcel({ result, fit, activeResult, useValue, histLast12, histKeys, forecastKeys, forecast, scenarioResult }) {
  if (!result || !fit) { alert('Önce hesaplama yapın.'); return }

  const doIt = () => {
    const X = window.XLSX
    if (!X) { alert('Excel kütüphanesi yüklenemedi.'); return }
    const wb = X.utils.book_new()

    // ─── Sheet 1: Özet ───
    const lbl = useValue ? 'Tutar ($)' : 'Miktar (kg)'
    const fcTotal = forecast.point.reduce((a, b) => a + (b || 0), 0)
    const histTotal = histLast12.reduce((a, b) => a + (b || 0), 0)
    const monthlyAvg = fcTotal / Math.max(1, result.horizon)
    const summary = [
      ['TYRO Forecast — Satış Tahmini Raporu'],
      [],
      ['Trader', result.displayCodes?.join(', ') || result.traderCode || '—'],
      ['Kayıt sayısı', result.recordCount],
      ['Tahmin ufku', `${result.horizon} ay`],
      ['Metrik', lbl],
      ['Aktif model', activeResult?.label || '—'],
      ['Backtest MAPE', activeResult?.mape != null ? `${activeResult.mape.toFixed(2)}%` : '—'],
      ['Son 12 ay toplam', Math.round(histTotal)],
      ['Tahmin toplam', Math.round(fcTotal)],
      ['Aylık ortalama', Math.round(monthlyAvg)],
      [],
      ['Model Karşılaştırma'],
      ['Model', 'MAPE %', 'Durum'],
      ...fit.results.map((r) => [r.label, r.mape != null ? r.mape.toFixed(2) : '—', r.skipped ? 'Atlandı' : 'Aktif']),
    ]
    const ws1 = X.utils.aoa_to_sheet(summary)
    ws1['!cols'] = [{ wch: 32 }, { wch: 18 }, { wch: 18 }]
    X.utils.book_append_sheet(wb, ws1, 'Özet')

    // ─── Sheet 2: Aylık Detay ───
    const histMap = new Map(histKeys.map((k, i) => [k, result.series.qty[i]]))
    const monthRows = [['Ay', 'Tahmin', 'Alt', 'Üst', 'Geçen Yıl', 'YoY %']]
    forecastKeys.forEach((k, i) => {
      const [yy, mm] = k.split('-')
      const ly = histMap.get(`${+yy - 1}-${mm}`)
      const fc = forecast.point[i]
      const yoy = ly != null && ly > 0 ? +(((fc - ly) / ly) * 100).toFixed(2) : null
      monthRows.push([k, Math.round(fc || 0), Math.round(forecast.lower?.[i] || 0), Math.round(forecast.upper?.[i] || 0), ly != null ? Math.round(ly) : null, yoy])
    })
    const ws2 = X.utils.aoa_to_sheet(monthRows)
    ws2['!cols'] = [{ wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }]
    X.utils.book_append_sheet(wb, ws2, 'Aylık Detay')

    // ─── Sheet 3: Ürün Forecast ───
    const items = result.itemForecasts || []
    const itemRows = [['Itemid', 'Ürün Adı', 'Son 12 Ay', `Tahmin ${result.horizon} Ay`, 'YoY %', 'Best Model', 'MAPE %']]
    items.forEach((it) => {
      const hist12 = (it.qty || it.history || []).slice(-12).reduce((a, b) => a + (b || 0), 0)
      const fcSum = (it.forecast?.point || []).reduce((a, b) => a + (b || 0), 0)
      const yoy = hist12 > 0 ? +(((fcSum - hist12 * result.horizon / 12) / (hist12 * result.horizon / 12)) * 100).toFixed(2) : null
      itemRows.push([it.pid, it.name || '', Math.round(hist12), Math.round(fcSum), yoy, it.bestId, it.mape != null ? +it.mape.toFixed(2) : null])
    })
    const ws3 = X.utils.aoa_to_sheet(itemRows)
    ws3['!cols'] = [{ wch: 20 }, { wch: 36 }, { wch: 14 }, { wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 10 }]
    X.utils.book_append_sheet(wb, ws3, 'Ürün Forecast')

    // ─── Sheet 4: Itemid × Ay Matrisi ───
    if (items.length > 0) {
      const matHdr = ['Itemid', 'Ürün Adı', ...forecastKeys]
      const matRows = [matHdr]
      items.forEach((it) => {
        const row = [it.pid, it.name || '']
        ;(it.forecast?.point || []).forEach((v) => row.push(Math.round(v || 0)))
        matRows.push(row)
      })
      const ws4 = X.utils.aoa_to_sheet(matRows)
      ws4['!freeze'] = { ySplit: 1, xSplit: 2 }
      ws4['!cols'] = [{ wch: 20 }, { wch: 36 }, ...forecastKeys.map(() => ({ wch: 12 }))]
      X.utils.book_append_sheet(wb, ws4, 'Itemid × Ay')
    }

    // ─── Sheet 5: Senaryo (eğer aktif) ───
    if (scenarioResult?.isActive && scenarioResult.adjustedForecast?.point) {
      const adj = scenarioResult.adjustedForecast.point
      const baseline = scenarioResult.baselineForecast?.point || forecast.point
      const mc = scenarioResult.mcBands
      const scRows = [
        ['Senaryo Simülasyonu'],
        ['Baseline toplam', Math.round(scenarioResult.baselineTotal || 0)],
        ['Senaryo toplam', Math.round(scenarioResult.adjustedTotal || 0)],
        ['Δ %', +(scenarioResult.deltaPct || 0).toFixed(2)],
        [],
        ['Ay', 'Baseline', 'Senaryo', 'Δ %', 'P10', 'P50', 'P90'],
      ]
      forecastKeys.forEach((k, i) => {
        const b = baseline[i]
        const s = adj[i]
        const delta = b != null && b > 0 && s != null ? +(((s - b) / b) * 100).toFixed(2) : null
        scRows.push([k, Math.round(b || 0), Math.round(s || 0), delta, mc?.p10?.[i] != null ? Math.round(mc.p10[i]) : null, mc?.p50?.[i] != null ? Math.round(mc.p50[i]) : null, mc?.p90?.[i] != null ? Math.round(mc.p90[i]) : null])
      })
      const ws5 = X.utils.aoa_to_sheet(scRows)
      ws5['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }]
      X.utils.book_append_sheet(wb, ws5, 'Senaryo')
    }

    const codesArr = result.displayCodes || [result.traderCode]
    const fileName = `TYRO_SatisTahmini_${codesArr.length === 1 ? codesArr[0] : codesArr.length + 'trader'}_${new Date().toISOString().slice(0, 10)}.xlsx`
    X.writeFile(wb, fileName)
  }

  if (window.XLSX) doIt()
  else {
    const sc = document.createElement('script')
    sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
    sc.onload = doIt
    sc.onerror = () => alert('Excel kütüphanesi yüklenemedi. İnternet bağlantınızı kontrol edin.')
    document.head.appendChild(sc)
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Phase 6: PDF export — window.open + window.print pattern
// ════════════════════════════════════════════════════════════════════════════
function exportPDF({ result, fit, activeResult, useValue, histLast12, histKeys, forecastKeys, forecast, scenarioResult, monthlyAvg, fcTotal, horizon, trendPct, mape }) {
  if (!result || !fit) { alert('Önce hesaplama yapın.'); return }

  const w = window.open('', '_blank')
  if (!w) { alert('Popup engelli — bu site için popup izni verin.'); return }

  try {
    const fmt = (v) => v == null ? '—' : `${useValue ? '$' : ''}${Math.round(v).toLocaleString('tr-TR')}${useValue ? '' : ' kg'}`
    const histMap = new Map(histKeys.map((k, i) => [k, result.series.qty[i]]))
    const traderLabel = result.displayCodes?.join(', ') || result.traderCode || '—'
    const dateStr = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())
    const allKeys = [...histKeys.slice(-12), ...forecastKeys]
    const allVals = [...histLast12, ...forecast.point]
    const maxV = Math.max(1, ...allVals.filter((v) => v != null && !isNaN(v))) * 1.15

    // Mini SVG chart for PDF
    const chartW = 900, chartH = 200, padL = 50, padR = 16, padT = 14, padB = 28
    const innerW = chartW - padL - padR, innerH = chartH - padT - padB
    const xAt = (i) => padL + (i * innerW) / Math.max(1, allVals.length - 1)
    const yAt = (v) => padT + innerH - (((v || 0) / maxV) * innerH)
    const histLen = histLast12.length

    const buildPath = (vals, startIdx = 0) => {
      const pts = vals.map((v, i) => ({ x: xAt(startIdx + i), y: yAt(v) }))
      if (pts.length === 0) return ''
      let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i], p1 = pts[i + 1]
        const cpx = p0.x + (p1.x - p0.x) / 2
        d += ` C ${cpx.toFixed(1)} ${p0.y.toFixed(1)}, ${cpx.toFixed(1)} ${p1.y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`
      }
      return d
    }
    const histPath = buildPath(histLast12, 0)
    const fcPath = buildPath([histLast12[histLen - 1], ...forecast.point], histLen - 1)
    const sepX = histLen > 0 ? xAt(histLen - 1) : 0

    const xLabels = allKeys.map((k, i) => {
      if (i % 2 !== 0) return ''
      const [yy, mm] = k.split('-')
      const monthsShort = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
      return `<text x="${xAt(i).toFixed(1)}" y="${(chartH - 8).toFixed(1)}" font-size="9" fill="#64748b" text-anchor="middle">${monthsShort[+mm - 1]} '${yy.slice(2)}</text>`
    }).join('')

    const chartSvg = `<svg width="${chartW}" height="${chartH}" viewBox="0 0 ${chartW} ${chartH}" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:auto">
      <defs><linearGradient id="fcGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#0a3d8f"/><stop offset="1" stop-color="#f07a23"/>
      </linearGradient></defs>
      ${histPath ? `<path d="${histPath}" fill="none" stroke="#0a3d8f" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
      ${fcPath ? `<path d="${fcPath}" fill="none" stroke="#f07a23" stroke-width="2.4" stroke-dasharray="6 4" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
      ${histLen > 0 ? `<line x1="${sepX.toFixed(1)}" y1="${padT}" x2="${sepX.toFixed(1)}" y2="${(chartH - padB).toFixed(1)}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="3 3" opacity=".5"/>` : ''}
      ${xLabels}
    </svg>`

    const monthRowsHTML = forecastKeys.map((k, i) => {
      const [yy, mm] = k.split('-')
      const ly = histMap.get(`${+yy - 1}-${mm}`)
      const fc = forecast.point[i]
      const yoy = ly != null && ly > 0 ? ((fc - ly) / ly) * 100 : null
      return `<tr>
        <td>${MONTHS_TR_FULL[+mm - 1]} ${yy}</td>
        <td style="text-align:right;font-weight:600">${fmt(fc)}</td>
        <td style="text-align:right;color:#64748b">${fmt(forecast.lower?.[i])} — ${fmt(forecast.upper?.[i])}</td>
        <td style="text-align:right;color:#64748b">${fmt(ly)}</td>
        <td style="text-align:right;color:${yoy == null ? '#64748b' : yoy >= 0 ? '#047857' : '#be123c'}">${yoy == null ? '—' : (yoy >= 0 ? '+' : '') + yoy.toFixed(1) + '%'}</td>
      </tr>`
    }).join('')

    const escHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    const itemRowsHTML = (result.itemForecasts || []).slice(0, 30).map((it, idx) => {
      const hist12Total = (it.qty || it.history || []).slice(-12).reduce((a, b) => a + (b || 0), 0)
      const fcSum = (it.forecast?.point || []).reduce((a, b) => a + (b || 0), 0)
      const yoy = hist12Total > 0 ? ((fcSum - hist12Total * horizon / 12) / (hist12Total * horizon / 12)) * 100 : null
      const pidCell = it.name
        ? `<div style="font-family:monospace;font-weight:600">${escHtml(it.pid)}</div><div style="font-size:10px;color:#64748b;margin-top:1px">${escHtml(it.name)}</div>`
        : `<span style="font-family:monospace">${escHtml(it.pid)}</span>`
      return `<tr>
        <td>${idx + 1}</td>
        <td>${pidCell}</td>
        <td style="text-align:right">${Math.round(hist12Total).toLocaleString('tr-TR')}</td>
        <td style="text-align:right;font-weight:600">${Math.round(fcSum).toLocaleString('tr-TR')}</td>
        <td style="text-align:right;color:${yoy == null ? '#64748b' : yoy >= 0 ? '#047857' : '#be123c'}">${yoy == null ? '—' : (yoy >= 0 ? '+' : '') + yoy.toFixed(1) + '%'}</td>
        <td style="text-align:right">${it.mape != null ? '%' + it.mape.toFixed(1) : '—'}</td>
      </tr>`
    }).join('')

    const modelRowsHTML = fit.results.slice().sort((a, b) => (a.mape ?? 999) - (b.mape ?? 999)).map((r) => `
      <tr style="${r.id === fit.bestId ? 'background:#fef9c3' : ''}">
        <td>${r.label}${r.id === fit.bestId ? ' ⭐' : ''}</td>
        <td style="text-align:right">${r.mape != null ? '%' + r.mape.toFixed(2) : '—'}</td>
        <td style="text-align:right">${r.skipped ? 'Atlandı' : 'Aktif'}</td>
      </tr>
    `).join('')

    const scenarioBanner = scenarioResult?.isActive ? `
      <div style="margin:18px 0;padding:12px 16px;border-radius:8px;background:#fff7ed;border-left:4px solid #ea580c">
        <div style="font-size:11px;color:#9a3412;text-transform:uppercase;letter-spacing:.04em;font-weight:600">Senaryo aktif</div>
        <div style="margin-top:4px;display:flex;justify-content:space-between;align-items:baseline">
          <span style="font-size:13px;color:#7c2d12">Baseline ${fmt(scenarioResult.baselineTotal)} → Senaryo ${fmt(scenarioResult.adjustedTotal)}</span>
          <span style="font-size:16px;font-weight:700;color:${scenarioResult.deltaPct >= 0 ? '#047857' : '#be123c'}">Δ ${scenarioResult.deltaPct >= 0 ? '+' : ''}${scenarioResult.deltaPct.toFixed(1)}%</span>
        </div>
      </div>` : ''

    const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8"/>
  <title>TYRO Forecast — ${traderLabel}</title>
  <style>
    @page { size: A4 landscape; margin: 14mm; }
    body { font-family: -apple-system, 'Segoe UI', Inter, Arial, sans-serif; color: #1a2332; margin: 0; padding: 18px; font-size: 12px; }
    h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -.02em; }
    h2 { font-size: 14px; margin: 18px 0 8px; color: #475569; text-transform: uppercase; letter-spacing: .05em; }
    .meta { font-size: 11px; color: #64748b; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 16px 0; }
    .kpi { padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; }
    .kpi-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: .04em; font-weight: 600; }
    .kpi-value { font-size: 18px; font-weight: 700; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 6px; }
    th { text-align: left; padding: 6px 8px; background: #f1f5f9; font-weight: 600; color: #475569; border-bottom: 2px solid #cbd5e1; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
    td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; }
    .chart-wrap { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; margin: 12px 0; }
    .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <header style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0a3d8f;padding-bottom:10px">
    <div>
      <h1>TYRO Forecast — Satış Tahmini</h1>
      <div class="meta">Trader: <strong>${traderLabel}</strong> · ${result.recordCount.toLocaleString('tr-TR')} kayıt · ${horizon} ay ileri · ${useValue ? 'Tutar ($)' : 'Miktar (kg)'}</div>
    </div>
    <div class="meta" style="text-align:right">
      <div>Rapor: ${dateStr}</div>
      <div style="margin-top:2px">Aktif model: <strong>${activeResult?.label || '—'}</strong> ${mape != null ? `(MAPE %${mape.toFixed(1)})` : ''}</div>
    </div>
  </header>

  ${scenarioBanner}

  <div class="kpi-grid">
    <div class="kpi"><div class="kpi-label">Aylık Ortalama</div><div class="kpi-value">${fmt(monthlyAvg)}</div></div>
    <div class="kpi"><div class="kpi-label">${horizon} Ay Toplam</div><div class="kpi-value">${fmt(fcTotal)}</div></div>
    <div class="kpi"><div class="kpi-label">Trend %</div><div class="kpi-value" style="color:${trendPct == null ? '#1a2332' : trendPct >= 0 ? '#047857' : '#be123c'}">${trendPct == null ? '—' : (trendPct >= 0 ? '+' : '') + trendPct.toFixed(1) + '%'}</div></div>
    <div class="kpi"><div class="kpi-label">Backtest MAPE</div><div class="kpi-value">${mape == null ? '—' : '%' + mape.toFixed(1)}</div></div>
  </div>

  <h2>Tahmin Grafiği</h2>
  <div class="chart-wrap">${chartSvg}</div>

  <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:16px;margin-top:8px">
    <div>
      <h2>Aylık Tahmin Detayı</h2>
      <table>
        <thead><tr><th>Ay</th><th style="text-align:right">Tahmin</th><th style="text-align:right">Alt-Üst</th><th style="text-align:right">Geçen Yıl</th><th style="text-align:right">YoY %</th></tr></thead>
        <tbody>${monthRowsHTML}</tbody>
      </table>
    </div>
    <div>
      <h2>Model Karşılaştırma</h2>
      <table>
        <thead><tr><th>Model</th><th style="text-align:right">MAPE %</th><th style="text-align:right">Durum</th></tr></thead>
        <tbody>${modelRowsHTML}</tbody>
      </table>
    </div>
  </div>

  ${itemRowsHTML ? `
    <h2>Ürün Bazlı Tahmin (Top 30)</h2>
    <table>
      <thead><tr><th>#</th><th>Itemid</th><th style="text-align:right">Son 12 Ay</th><th style="text-align:right">Tahmin ${horizon} Ay</th><th style="text-align:right">YoY %</th><th style="text-align:right">MAPE</th></tr></thead>
      <tbody>${itemRowsHTML}</tbody>
    </table>
  ` : ''}

  <div class="footer">
    <span>TTECH Business Solutions · TYRO AI · tyroforecast</span>
    <span>${dateStr}</span>
  </div>
</body>
</html>`

    w.document.open()
    w.document.write(html)
    w.document.close()
    setTimeout(() => {
      try { w.print() } catch (_) { /* user dismissed */ }
    }, 600)
  } catch (err) {
    console.error('[exportPDF]', err)
    w.document.body.innerHTML = `<pre style="padding:20px;color:#be123c;font:14px monospace">PDF hata: ${err.message || err}</pre>`
  }
}

// ════════════════════════════════════════════════════════════════════════════
// FilterPanel — Ana Trader + Trader + Horizon + Metrik + Hesapla + (sonuç varsa Senaryo/Excel/PDF)
// ════════════════════════════════════════════════════════════════════════════
function FilterPanel({
  fcstTraderList, fcstAnaTraderList, fcstTraderListLoading,
  fcstTrader, setFcstTrader, fcstAnaTrader, setFcstAnaTrader,
  fcstHorizon, setFcstHorizon, fcstMetric, setFcstMetric,
  runForecast, fcstLoading,
  hasResult, scenarioActive, onScenarioToggle, onExportExcel, onExportPDF,
}) {
  const canRun = !fcstLoading && (fcstTrader.length > 0 || fcstAnaTrader.length > 0)
  const nothingSelected = !fcstAnaTrader.length && !fcstTrader.length
  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 md:p-6">
      {/* Top accent gradient strip */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ background: 'linear-gradient(90deg, #0a3d8f 0%, #3b82f6 50%, #f07a23 100%)' }}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto_auto_auto] lg:items-end">
        <MultiSelect
          icon={User03Icon}
          label="Ana Trader"
          placeholder="Ana trader seçin…"
          loading={fcstTraderListLoading}
          options={fcstAnaTraderList}
          selected={fcstAnaTrader}
          onChange={setFcstAnaTrader}
          info={{
            title: 'Ana Trader',
            desc: 'Bir veya birkaç ana trader seçerek altındaki tüm alt trader\'ların satışlarını birleşik tahminleyebilirsin.',
            whenToUse: 'Bölge/segment bazında konsolide tahmin istediğinde. Tek tek alt trader seçmene gerek kalmaz.',
            detail: 'Ana trader seçildiğinde Trader combobox o ana trader\'ın alt trader\'larıyla daraltılır. Trader hiç seçilmezse tahmin doğrudan ana trader satış verisi üzerinden yapılır.',
          }}
        />
        <MultiSelect
          icon={UserGroup02Icon}
          label="Trader"
          placeholder="Alt trader seçin…"
          loading={fcstTraderListLoading}
          options={fcstTraderList}
          selected={fcstTrader}
          onChange={setFcstTrader}
          info={{
            title: 'Trader (Alt)',
            desc: 'Tek bir trader veya birkaç trader\'ı birleşik olarak tahminleyebilirsin.',
            whenToUse: 'Belirli bir trader\'ın detaylı tahmini için. Ana trader scope\'una düşmeden direkt seçim yap.',
            detail: 'Çoklu seçimde tahmin seçili trader\'ların birleşik satış verisi üzerinden yapılır. Ürün bazlı tahmin de bu kombinasyon için ayrıştırılır.',
          }}
        />
        <SegmentedSelect
          label="Zaman Aralığı"
          options={[{ v: 3, l: '3 ay' }, { v: 6, l: '6 ay' }, { v: 12, l: '12 ay' }]}
          value={fcstHorizon}
          onChange={setFcstHorizon}
          info={{
            title: 'Tahmin Ufku',
            desc: 'Kaç ay ileriye tahmin yapılacağı. Kısa ufuk daha güvenli, uzun ufuk daha belirsizdir.',
            whenToUse: '3 ay — operasyonel planlama · 6 ay — taktik · 12 ay — yıllık bütçe/stratejik.',
            detail: 'Tüm modeller bu ufka kadar projeksiyon üretir. Güven aralığı (Alt-Üst) zamanla genişler — uzun ufukta belirsizlik artar.',
          }}
        />
        <SegmentedSelect
          label="Metrik"
          icon={fcstMetric === 'qty' ? WeightScale01Icon : Dollar02Icon}
          options={[{ v: 'qty', l: 'Miktar' }, { v: 'value', l: 'Tutar' }]}
          value={fcstMetric}
          onChange={setFcstMetric}
          info={{
            title: 'Tahmin Metriği',
            desc: 'Miktar (kg) — fiziksel hacim üzerinden. Tutar ($) — finansal değer üzerinden.',
            whenToUse: 'Operasyon planı için Miktar; gelir/kâr projeksiyonu için Tutar tercih et.',
            detail: 'Tutar modu sadece entity\'de fiyat alanı doluysa çalışır; aksi halde miktar moduna düşer.',
          }}
        />

        {/* Action row: Hesapla + (sonuç varsa) Senaryo + Excel + PDF */}
        <div className="flex flex-col gap-1.5">
          <span aria-hidden="true" className="h-[15px]" />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={runForecast}
              disabled={!canRun}
              className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_4px_14px_-4px_rgba(31,73,153,0.45)] transition-all disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
              style={{
                backgroundImage: canRun
                  ? 'linear-gradient(135deg, #0a3d8f 0%, #1d4ed8 50%, #3b82f6 100%)'
                  : 'linear-gradient(135deg, #9ca3af, #6b7280)',
              }}
            >
              <HugeiconsIcon icon={AiAudioIcon} size={16} strokeWidth={1.9} />
              {fcstLoading ? 'Hesaplanıyor…' : 'Hesapla'}
            </button>
            {hasResult && (
              <>
                <button
                  type="button"
                  onClick={onScenarioToggle}
                  title="Simülasyon — what-if analizi"
                  className="inline-flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-[12.5px] font-semibold transition-all"
                  style={
                    scenarioActive
                      ? {
                          background: 'linear-gradient(135deg, #f07a23 0%, #ea580c 100%)',
                          borderColor: 'rgba(240,122,35,.55)',
                          color: '#fff',
                          boxShadow: '0 4px 14px rgba(240,122,35,.30), 0 1px 3px rgba(240,122,35,.20)',
                        }
                      : {
                          background: '#fff',
                          borderColor: 'rgba(240,122,35,.35)',
                          color: '#92400e',
                          boxShadow: '0 1px 3px rgba(240,122,35,.08)',
                        }
                  }
                  onMouseEnter={(e) => {
                    if (!scenarioActive) {
                      e.currentTarget.style.background = 'linear-gradient(135deg, rgba(240,122,35,.08), rgba(234,88,12,.04))'
                      e.currentTarget.style.borderColor = 'rgba(240,122,35,.55)'
                      e.currentTarget.style.transform = 'translateY(-1px)'
                    } else {
                      e.currentTarget.style.transform = 'translateY(-1px)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!scenarioActive) {
                      e.currentTarget.style.background = '#fff'
                      e.currentTarget.style.borderColor = 'rgba(240,122,35,.35)'
                      e.currentTarget.style.transform = 'translateY(0)'
                    } else {
                      e.currentTarget.style.transform = 'translateY(0)'
                    }
                  }}
                >
                  <HugeiconsIcon icon={AiLaptopIcon} size={15} strokeWidth={1.9} />
                  Simülasyon
                  {scenarioActive && (
                    <span
                      className="ml-0.5 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9.5px] font-extrabold tabular-nums"
                      style={{ background: 'rgba(255,255,255,.25)', color: '#fff', backdropFilter: 'blur(4px)' }}
                    >
                      <HugeiconsIcon icon={FlashIcon} size={9} strokeWidth={2.5} />
                      AKTİF
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={onExportExcel}
                  title="Excel olarak indir"
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2.5 text-[12.5px] font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50"
                >
                  <HugeiconsIcon icon={File02Icon} size={14} strokeWidth={1.9} />
                  Excel
                </button>
                <button
                  type="button"
                  onClick={onExportPDF}
                  title="PDF olarak indir"
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2.5 text-[12.5px] font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-50"
                >
                  <HugeiconsIcon icon={CloudDownloadIcon} size={14} strokeWidth={1.9} />
                  PDF
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Sadece hiç seçim yokken yardımcı ipucu (count'lar artık combobox başlığında sağ üstte) */}
      {nothingSelected && (
        <div className="mt-3 text-[11px] text-muted-foreground">
          Hesaplamak için en az bir trader seçin
        </div>
      )}
    </section>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// MultiSelect — Searchable multi-select dropdown (position:fixed pattern)
// ════════════════════════════════════════════════════════════════════════════
function MultiSelect({ icon, label, placeholder, options, selected, onChange, loading, info }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)

  useEffect(() => {
    if (!open || !btnRef.current) { setPos(null); return }
    const update = () => {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ x: r.left, y: r.bottom + 6, w: r.width })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    const onDoc = (e) => { if (btnRef.current && !btnRef.current.contains(e.target) && !e.target.closest('[data-ms-menu]')) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      document.removeEventListener('mousedown', onDoc)
    }
  }, [open])

  const filtered = useMemo(() => {
    if (!search.trim()) return options
    const q = search.toLocaleLowerCase('tr-TR')
    return options.filter((o) => o.label.toLocaleLowerCase('tr-TR').includes(q))
  }, [options, search])

  const summary = selected.length === 0
    ? placeholder
    : selected.length === 1
      ? options.find((o) => o.code === selected[0])?.label || selected[0]
      : `${selected.length} seçili`

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <HugeiconsIcon icon={icon} size={13} strokeWidth={1.9} />
          {label}
          {info && <InfoTip {...info} iconSize={10} />}
        </label>
        {selected.length > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary"
            title={`${selected.length} seçili`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            {selected.length} seçili
          </span>
        )}
      </div>
      <button
        type="button"
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        disabled={loading || options.length === 0}
        className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-left text-[13px] text-foreground transition hover:border-foreground/25 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className={`flex-1 truncate ${selected.length === 0 ? 'text-muted-foreground' : ''}`}>
          {loading ? 'Yükleniyor…' : summary}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition ${open ? 'rotate-180' : ''}`} strokeWidth={1.8} />
      </button>
      {open && pos && (
        <div
          data-ms-menu
          className="rounded-lg border border-border bg-card shadow-[0_12px_40px_-12px_rgba(15,23,42,0.2)]"
          style={{ position: 'fixed', left: pos.x, top: pos.y, width: pos.w, zIndex: 50 }}
        >
          <div className="border-b border-border p-2">
            <input
              type="search"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ara…"
              className="w-full rounded-md bg-muted/40 px-3 py-2 text-[12px] outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ul className="max-h-[260px] overflow-y-auto p-1">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-[12px] text-muted-foreground">Sonuç yok</li>
            )}
            {filtered.map((o) => {
              const checked = selected.includes(o.code)
              return (
                <li key={o.code}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(checked ? selected.filter((c) => c !== o.code) : [...selected, o.code])
                    }}
                    className={`flex w-full items-start gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] transition ${checked ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50 text-foreground'}`}
                  >
                    <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border ${checked ? 'border-primary bg-primary text-white' : 'border-border'}`}>
                      {checked && <CheckMark />}
                    </span>
                    <span className="flex-1 truncate">{o.label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          {selected.length > 0 && (
            <div className="flex items-center justify-between border-t border-border px-3 py-2">
              <span className="text-[11px] text-muted-foreground">{selected.length} seçili</span>
              <button
                type="button"
                onClick={() => onChange([])}
                className="flex items-center gap-1 text-[11px] text-rose-600 hover:underline"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
                Temizle
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Inline checkmark used inside MultiSelect option rows
function CheckMark() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2 6.5L4.5 9L10 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// SegmentedSelect — Inline segmented control for Horizon / Metric
// ════════════════════════════════════════════════════════════════════════════
function SegmentedSelect({ label, options, value, onChange, icon, info }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {icon && <HugeiconsIcon icon={icon} size={13} strokeWidth={1.9} />}
        {!icon && <HugeiconsIcon icon={CalendarAdd01Icon} size={13} strokeWidth={1.9} />}
        {label}
        {info && <InfoTip {...info} iconSize={10} />}
      </label>
      <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5">
        {options.map((o) => {
          const active = value === o.v
          return (
            <button
              key={o.v}
              type="button"
              onClick={() => onChange(o.v)}
              className={`rounded-md px-3 py-2 text-[12.5px] font-medium transition ${active
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {o.l}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// AiLoader — 6-step cascade progress
// ════════════════════════════════════════════════════════════════════════════
function AiLoader({ step, stepData, horizon }) {
  const sd = stepData || {}
  const steps = [
    {
      n: 1, l: 'Satış Geçmişi Çekiliyor',
      d: sd.fetched
        ? (sd.fetched.fromCache
            ? `Cache'den ${sd.fetched.count} kayıt yüklendi`
            : `Dataverse → ${sd.fetched.loaded ?? 0}/${sd.fetched.total ?? '…'} (${sd.fetched.mode})`)
        : 'Dataverse historical sales sorgulanıyor',
    },
    {
      n: 2, l: 'Aylık Aggregate',
      d: sd.aggregate ? `${sd.aggregate.records} satır → ${sd.aggregate.months} aylık seri` : 'Satırlar yıl-ay bazında toplanıyor',
    },
    {
      n: 3, l: 'Trader Toplam Modelleri',
      d: sd.modelsRunning ? `${sd.modelsRunning} koşturuluyor…` : '8 model paralel hazırlanıyor',
    },
    {
      n: 4, l: 'Ürün Bazlı Tahminler',
      d: sd.itemBatch ? `${sd.itemBatch.processed ?? 0}/${sd.itemBatch.total} ürün${sd.itemBatch.currentPid ? ` · ${sd.itemBatch.currentPid}` : ''}` : 'Top 30 ürün için ayrı tahmin',
    },
    {
      n: 5, l: 'Backtest MAPE',
      d: sd.backtest ? `${sd.backtest.models} model holdout testi tamamlandı` : 'Son 6 ay tutulup geri kalanla doğrulanıyor',
    },
    {
      n: 6, l: 'Best Fit Seçimi',
      d: sd.bestFit
        ? `${FORECAST_MODELS.find((m) => m.id === sd.bestFit.id)?.label || sd.bestFit.id} kazandı (MAPE ${sd.bestFit.mape?.toFixed(1)}%)`
        : 'En düşük hata oranlı model seçiliyor',
    },
  ]

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-border bg-card p-7"
      style={{ backgroundImage: 'linear-gradient(135deg, rgba(10,61,143,.03), rgba(59,130,246,.03), rgba(240,122,35,.03))' }}
    >
      {/* Background pulse */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-50 blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(10,61,143,.12), transparent 70%)' }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full opacity-40 blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(240,122,35,.12), transparent 70%)' }}
      />

      {/* Brain card */}
      <div className="relative flex flex-col items-center">
        <div
          className="mb-3 grid h-20 w-20 place-items-center rounded-[20px] text-white animate-pulse"
          style={{
            background: 'linear-gradient(135deg, #0a3d8f 0%, #1d4ed8 50%, #f07a23 100%)',
            boxShadow: '0 12px 32px -8px rgba(10,61,143,.45)',
          }}
        >
          <HugeiconsIcon icon={AiBrain03Icon} size={42} strokeWidth={1.6} />
        </div>
        <div className="text-[15px] font-bold tracking-tight text-foreground">
          TYRO AI Tahmin Motoru
          <span className="ml-1.5 inline-flex gap-0.5 align-middle">
            <Dot delay={0} />
            <Dot delay={0.2} />
            <Dot delay={0.4} />
          </span>
        </div>
        <div className="mt-1 text-[12px] text-muted-foreground">
          <strong className="text-foreground/80">{horizon} ay</strong> ileri tahmin oluşturuluyor
        </div>
      </div>

      {/* Steps */}
      <div className="relative mx-auto mt-6 flex max-w-[640px] flex-col gap-2">
        {steps.map((s) => {
          const done = step > s.n
          const active = step === s.n
          const pending = step < s.n
          return (
            <div
              key={s.n}
              className={`flex items-center gap-3 rounded-lg px-3.5 py-2.5 transition-all ${active
                ? 'border border-primary/25 bg-card shadow-[0_2px_8px_-2px_rgba(10,61,143,.08)]'
                : done
                  ? 'border border-primary/15 bg-primary/[0.04]'
                  : 'border border-border/60 bg-muted/20'
              } ${pending ? 'opacity-45' : ''}`}
            >
              <div
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-white"
                style={{
                  background: done
                    ? 'linear-gradient(135deg, #0a3d8f, #3b82f6)'
                    : active
                      ? 'linear-gradient(135deg, #1d4ed8, #f07a23)'
                      : '#e5e7eb',
                  boxShadow: active ? '0 0 0 4px rgba(59,130,246,.15)' : 'none',
                }}
              >
                {done ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M3 7.5L6 10.5L11 4.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : active ? (
                  <span
                    className="inline-block h-3 w-3 rounded-full border-2 border-white/60 border-t-white"
                    style={{ animation: 'spin 0.8s linear infinite' }}
                  />
                ) : (
                  <span className="text-[11px] font-semibold text-foreground/45">{s.n}</span>
                )}
              </div>
              <div className="flex-1">
                <div className={`text-[13px] font-semibold ${active ? 'text-foreground' : done ? 'text-primary' : 'text-foreground/65'}`}>
                  {s.l}
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{s.d}</div>
              </div>
            </div>
          )
        })}
      </div>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes aiDot{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-2px)}}
      `}</style>
    </div>
  )
}

function Dot({ delay }) {
  return (
    <span
      className="inline-block h-1 w-1 rounded-full bg-primary"
      style={{
        animation: 'aiDot 1.4s ease-in-out infinite',
        animationDelay: `${delay}s`,
      }}
    />
  )
}

// ════════════════════════════════════════════════════════════════════════════
// EmptyState — Bir trader seçin
// ════════════════════════════════════════════════════════════════════════════
function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/40 p-10 text-center">
      <div
        className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl text-primary"
        style={{ background: 'linear-gradient(135deg, rgba(10,61,143,.08), rgba(59,130,246,.08))' }}
      >
        <HugeiconsIcon icon={AiBrain03Icon} size={32} strokeWidth={1.6} />
      </div>
      <h3 className="text-[15px] font-semibold text-foreground">İlk tahmin için trader seçin</h3>
      <p className="mx-auto mt-2 max-w-md text-[12.5px] text-muted-foreground">
        Ana trader veya alt trader filtresinden seçim yapıp <strong>Hesapla</strong> butonuna basın.
        Sistem 8 forecast modelini koşturur, en iyi modeli backtest ile seçer ve ürün bazlı tahmin üretir.
      </p>
    </div>
  )
}

