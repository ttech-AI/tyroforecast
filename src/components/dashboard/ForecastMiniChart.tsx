// ════════════════════════════════════════════════════════════════════════════
// ForecastMiniChart — Anasayfa tahmin grafiği (full-width)
// ────────────────────────────────────────────────────────────────────────────
// Son 12 ay hist + sonraki H ay forecast. Sağ üstte model selector dropdown.
// Default: Best Fit (snapshot.bestModelId). Kullanıcı 8 model arasında değiş-
// tirebilir, chart anında refresh olur.
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { ChartAnalysisIcon, AiBrain03Icon, ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { Star } from 'lucide-react'
import { fmtTon, fmtMonthKey } from '../../lib/forecast/format.js'
import { FORECAST_MODELS } from '../../lib/forecast/salesForecast.js'

// FORECAST_MODELS'i id → meta haritasına çevir (tooltip için)
type ModelMeta = {
  id: string
  label: string
  short?: string
  description?: string
  strength?: string
  weakness?: string
  whenToUse?: string
}
const MODEL_META: Record<string, ModelMeta> = (FORECAST_MODELS as ModelMeta[]).reduce(
  (acc, m) => { acc[m.id] = m; return acc },
  {} as Record<string, ModelMeta>,
)

type Model = {
  id: string
  label: string
  mape: number | null
  skipped: boolean
  point: number[]
  lower: number[]
  upper: number[]
}

type Snapshot = {
  bestModelId: string | null
  bestModelMape: number | null
  horizon: number
  historyKeys: string[]
  historyQty: number[]
  models?: Model[]
  // Geriye uyumluluk: eski snapshot'larda models yoksa forecastMonths var
  forecastMonths: Array<{ key: string; qty: number; lower: number | null; upper: number | null }>
}

export function ForecastMiniChart({ snapshot }: { snapshot: Snapshot }) {
  // ── Aktif model state ── default = bestModelId
  const [activeId, setActiveId] = useState<string | null>(snapshot.bestModelId)
  const [menuOpen, setMenuOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [menuPos, setMenuPos] = useState<{ x: number; y: number; w: number } | null>(null)
  // Model hover tooltip — menü kapanınca sıfırlanır
  const [hoveredModelId, setHoveredModelId] = useState<string | null>(null)
  const [modelTipPos, setModelTipPos] = useState<{ x: number; y: number; alignRight: boolean } | null>(null)

  // Snapshot değişirse (yeni hesaplama) bestModel'e dön
  useEffect(() => {
    setActiveId(snapshot.bestModelId)
  }, [snapshot.bestModelId])

  // Menu konumu (position:fixed portal)
  useEffect(() => {
    if (!menuOpen || !btnRef.current) { setMenuPos(null); return }
    const update = () => {
      const r = btnRef.current!.getBoundingClientRect()
      setMenuPos({ x: r.right - 260, y: r.bottom + 6, w: 260 })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (btnRef.current?.contains(t)) return
      if (t.closest('[data-fcst-model-menu]')) return
      setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      document.removeEventListener('mousedown', onDoc)
    }
  }, [menuOpen])

  // Menü kapandığında hover tooltip'i de sıfırla
  useEffect(() => {
    if (!menuOpen) { setHoveredModelId(null); setModelTipPos(null) }
  }, [menuOpen])

  // Aktif model + geriye uyumluluk (snapshot.models yoksa forecastMonths fallback)
  const sortedModels = useMemo(() => {
    if (!snapshot.models || snapshot.models.length === 0) return null
    const arr = [...snapshot.models]
    arr.sort((a, b) => {
      if (a.skipped !== b.skipped) return a.skipped ? 1 : -1
      const am = a.mape == null ? Infinity : a.mape
      const bm = b.mape == null ? Infinity : b.mape
      return am - bm
    })
    return arr
  }, [snapshot.models])

  const activeModel: Model | null = useMemo(() => {
    if (!sortedModels) return null
    return sortedModels.find((m) => m.id === activeId) || sortedModels[0]
  }, [sortedModels, activeId])

  // Çizim verisi (aktif modelden veya forecastMonths fallback'ten)
  const fcKeys = useMemo(() => {
    if (activeModel) {
      const last = snapshot.historyKeys[snapshot.historyKeys.length - 1] || ''
      const keys: string[] = []
      if (last) {
        let cur = last
        for (let i = 0; i < activeModel.point.length; i++) {
          cur = addMonths(cur, 1)
          keys.push(cur)
        }
      }
      return keys
    }
    return snapshot.forecastMonths.map((m) => m.key)
  }, [activeModel, snapshot.forecastMonths, snapshot.historyKeys])

  const fcQty = activeModel ? activeModel.point : snapshot.forecastMonths.map((m) => m.qty)
  const fcLower = activeModel ? activeModel.lower : snapshot.forecastMonths.map((m) => m.lower ?? m.qty)
  const fcUpper = activeModel ? activeModel.upper : snapshot.forecastMonths.map((m) => m.upper ?? m.qty)

  const histRecent = useMemo(() => {
    const n = Math.min(12, snapshot.historyKeys.length)
    return {
      keys: snapshot.historyKeys.slice(-n),
      qty: snapshot.historyQty.slice(-n),
    }
  }, [snapshot.historyKeys, snapshot.historyQty])

  const allKeys = [...histRecent.keys, ...fcKeys]
  const allVals = [...histRecent.qty, ...fcQty]
  const allUpper = [...histRecent.qty, ...fcUpper.map((v, i) => v ?? fcQty[i] ?? 0)]
  const maxVal = Math.max(1, ...allUpper)

  // SVG geometri — 1/3 col için compact (preserveAspectRatio='none' ile w-full'a stretch)
  const W = 500
  const H = 180
  const padT = 14, padB = 26, padL = 10, padR = 10
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const xAt = (i: number) => padL + (allKeys.length <= 1 ? 0 : (i / (allKeys.length - 1)) * innerW)
  const yAt = (v: number) => padT + innerH - (v / maxVal) * innerH

  // Bezier path
  const buildPath = (vals: Array<number | null>, startIdx = 0): string => {
    const pts: Array<[number, number]> = []
    vals.forEach((v, i) => {
      if (v == null) return
      pts.push([xAt(startIdx + i), yAt(v)])
    })
    if (pts.length === 0) return ''
    if (pts.length === 1) return `M ${pts[0][0]} ${pts[0][1]}`
    let d = `M ${pts[0][0]} ${pts[0][1]}`
    for (let i = 1; i < pts.length; i++) {
      const [px, py] = pts[i - 1]
      const [cx, cy] = pts[i]
      const mx = (px + cx) / 2
      d += ` Q ${mx} ${py}, ${mx} ${(py + cy) / 2} T ${cx} ${cy}`
    }
    return d
  }

  const histPath = buildPath(histRecent.qty, 0)
  const fcPath = buildPath(fcQty, histRecent.keys.length)

  // Confidence band
  const bandUpper = buildPath(fcUpper, histRecent.keys.length)
  const bandLowerRev = (() => {
    const pts: Array<[number, number]> = []
    fcLower.forEach((v, i) => {
      pts.push([xAt(histRecent.keys.length + i), yAt(v)])
    })
    let d = ''
    for (let i = pts.length - 1; i >= 0; i--) {
      d += i === pts.length - 1 ? `L ${pts[i][0]} ${pts[i][1]}` : ` L ${pts[i][0]} ${pts[i][1]}`
    }
    return d
  })()
  const bandPath = bandUpper && bandLowerRev ? `${bandUpper} ${bandLowerRev} Z` : ''

  // Separator (today)
  const sepIdx = histRecent.keys.length - 1
  const sepX = xAt(sepIdx)

  // Hover tooltip
  const [hover, setHover] = useState<{ x: number; y: number; key: string; qty: number; isForecast: boolean } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * W
    let bestI = 0, bestD = Infinity
    for (let i = 0; i < allKeys.length; i++) {
      const d = Math.abs(xAt(i) - x)
      if (d < bestD) { bestD = d; bestI = i }
    }
    setHover({
      x: e.clientX,
      y: e.clientY,
      key: allKeys[bestI],
      qty: allVals[bestI],
      isForecast: bestI >= histRecent.keys.length,
    })
  }

  // Aktif model label/MAPE
  const activeLabel = activeModel?.label || '—'
  const activeMape = activeModel?.mape ?? snapshot.bestModelMape
  const isBest = activeModel?.id === snapshot.bestModelId

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.10)]">
      {/* Header */}
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border/60 px-4 py-3 md:px-5">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={ChartAnalysisIcon} size={18} strokeWidth={1.9} color="#0a3d8f" />
          <div>
            <h3 className="text-[13px] font-bold leading-tight text-foreground">Tahmin Grafiği</h3>
            <p className="text-[10.5px] text-muted-foreground">Son 12 ay + sonraki {snapshot.horizon} ay</p>
          </div>
        </div>

        {/* Model selector dropdown */}
        {sortedModels && sortedModels.length > 0 && (
          <button
            ref={btnRef}
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-card px-3 py-1.5 text-[11.5px] font-bold tabular-nums transition-all hover:-translate-y-0.5 hover:border-foreground/25 hover:shadow-[0_2px_8px_-2px_rgba(15,23,42,0.10)]"
            style={{
              background: 'linear-gradient(135deg, rgba(10,61,143,0.06), rgba(240,122,35,0.04))',
              color: '#0a3d8f',
              borderColor: 'rgba(10,61,143,0.18)',
            }}
          >
            <HugeiconsIcon icon={AiBrain03Icon} size={11} strokeWidth={2.2} />
            <span>{activeLabel}</span>
            {isBest && <Star className="h-3 w-3 fill-current text-amber-500" strokeWidth={0} />}
            {activeMape != null && (
              <span className="opacity-70">· %{activeMape.toFixed(1)}</span>
            )}
            <HugeiconsIcon icon={ArrowDown01Icon} size={10} strokeWidth={2.4} className={menuOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </button>
        )}

        {/* Dropdown menu — position:fixed portal */}
        {menuOpen && menuPos && typeof document !== 'undefined' && createPortal(
          <div
            data-fcst-model-menu
            className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_12px_36px_-12px_rgba(15,23,42,0.18)]"
            style={{ position: 'fixed', left: menuPos.x, top: menuPos.y, width: menuPos.w, zIndex: 60 }}
          >
            <div
              aria-hidden="true"
              className="h-[3px]"
              style={{ background: 'linear-gradient(90deg, #0a3d8f, #3b82f6, #f07a23)' }}
            />
            <div className="border-b border-border/60 bg-muted/30 px-3 py-2 text-[9.5px] font-extrabold uppercase tracking-wider text-muted-foreground">
              Model Seçin · MAPE'ye göre sıralı
            </div>
            <ul className="max-h-[320px] overflow-y-auto py-1">
              {(sortedModels || []).map((m) => {
                const isActive = m.id === activeId
                const isBestModel = m.id === snapshot.bestModelId
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      disabled={m.skipped}
                      onClick={() => { setActiveId(m.id); setMenuOpen(false) }}
                      onMouseEnter={(e) => {
                        const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
                        const tipW = 320
                        const gap = 10
                        // Tercih: solda göster (dropdown sağ üst köşede); sığmıyorsa sağa
                        const fitsLeft = r.left - tipW - gap > 8
                        setHoveredModelId(m.id)
                        setModelTipPos({
                          x: fitsLeft ? r.left - tipW - gap : r.right + gap,
                          y: Math.max(8, r.top),
                          alignRight: !fitsLeft,
                        })
                      }}
                      onMouseLeave={() => { setHoveredModelId(null); setModelTipPos(null) }}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                        isActive
                          ? 'bg-primary/8 font-bold text-primary'
                          : 'text-foreground/85 hover:bg-muted/50'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        {m.label}
                        {isBestModel && <Star className="h-3 w-3 fill-current text-amber-500" strokeWidth={0} aria-label="Best Fit" />}
                        {m.skipped && (
                          <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                            Atlandı
                          </span>
                        )}
                      </span>
                      {m.mape != null && (
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${mapeColorCls(m.mape)}`}>
                          %{m.mape.toFixed(1)}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>,
          document.body,
        )}

        {/* Model detay tooltip — hover'da model meta bilgisi */}
        {hoveredModelId && modelTipPos && MODEL_META[hoveredModelId] && typeof document !== 'undefined' && createPortal(
          (() => {
            const meta = MODEL_META[hoveredModelId]
            return (
              <div
                role="tooltip"
                className="pointer-events-none"
                style={{
                  position: 'fixed',
                  left: modelTipPos.x,
                  top: modelTipPos.y,
                  width: 320,
                  zIndex: 70,
                  background: 'linear-gradient(180deg, #1e293b, #0f172a)',
                  color: '#fff',
                  borderRadius: 12,
                  padding: '12px 14px',
                  boxShadow: '0 16px 36px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.06)',
                  border: '1px solid rgba(148,163,184,0.18)',
                  fontSize: 11.5,
                  lineHeight: 1.5,
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-extrabold tracking-tight text-white">{meta.label}</span>
                  {meta.short && (
                    <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-amber-200">
                      {meta.short}
                    </span>
                  )}
                </div>
                {meta.description && (
                  <p className="mt-2 text-[11px] text-slate-200/85">{meta.description}</p>
                )}
                {meta.strength && (
                  <div className="mt-2">
                    <div className="text-[9.5px] font-extrabold uppercase tracking-wider text-emerald-300">Güçlü Yön</div>
                    <p className="mt-0.5 text-[11px] text-slate-200/85">{meta.strength}</p>
                  </div>
                )}
                {meta.weakness && (
                  <div className="mt-2">
                    <div className="text-[9.5px] font-extrabold uppercase tracking-wider text-rose-300">Zayıf Yön</div>
                    <p className="mt-0.5 text-[11px] text-slate-200/85">{meta.weakness}</p>
                  </div>
                )}
                {meta.whenToUse && (
                  <div className="mt-2">
                    <div className="text-[9.5px] font-extrabold uppercase tracking-wider text-amber-300">Ne Zaman?</div>
                    <p className="mt-0.5 text-[11px] text-slate-200/85">{meta.whenToUse}</p>
                  </div>
                )}
              </div>
            )
          })(),
          document.body,
        )}
      </header>

      {/* Chart — flex-1 ile hero kartının yüksekliğine kadar uzar (taşma yok) */}
      <div className="flex min-h-0 flex-1 flex-col px-3 py-3 md:px-4 md:py-4">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="block w-full flex-1"
          style={{ minHeight: 160 }}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          aria-label="Forecast chart"
        >
          {/* Y-axis grid (compact: 2 satır) */}
          {[0.33, 0.66].map((p) => (
            <line
              key={p}
              x1={padL} x2={W - padR}
              y1={padT + innerH * p} y2={padT + innerH * p}
              stroke="rgba(148,163,184,0.18)" strokeWidth="1" strokeDasharray="2 3"
            />
          ))}
          {/* Confidence band */}
          {bandPath && (
            <path d={bandPath} fill="rgba(240,122,35,0.10)" />
          )}
          {/* History line */}
          {histPath && (
            <path d={histPath} fill="none" stroke="#0a3d8f" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          )}
          {/* Forecast line (dashed) */}
          {fcPath && (
            <path d={fcPath} fill="none" stroke="#f07a23" strokeWidth="2.4" strokeDasharray="6 4" strokeLinecap="round" strokeLinejoin="round" />
          )}
          {/* Separator (today) */}
          {sepIdx >= 0 && (
            <line
              x1={sepX} x2={sepX} y1={padT} y2={H - padB}
              stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 3" opacity="0.55"
            />
          )}
          {/* Forecast data points */}
          {fcQty.map((v, i) => (
            <circle
              key={`fc-${i}`}
              cx={xAt(histRecent.keys.length + i)}
              cy={yAt(v)}
              r={hover && hover.key === fcKeys[i] ? 5 : 3}
              fill="#f07a23"
              stroke="#fff"
              strokeWidth="1.5"
            />
          ))}
          {/* Last hist point */}
          {histRecent.qty.length > 0 && (
            <circle
              cx={xAt(histRecent.keys.length - 1)}
              cy={yAt(histRecent.qty[histRecent.qty.length - 1])}
              r="3.5" fill="#0a3d8f" stroke="#fff" strokeWidth="1.5"
            />
          )}
          {/* X axis labels — compact'ta sadece ilk / separator / son */}
          {allKeys.map((k, i) => {
            const isFirst = i === 0
            const isLast = i === allKeys.length - 1
            const isSep = i === histRecent.keys.length - 1
            if (!isFirst && !isLast && !isSep) return null
            const label = fmtMonthKey(k, { year: false }) + ' ' + String(k).slice(2, 4)
            return (
              <text
                key={`lbl-${i}`}
                x={xAt(i)} y={H - 8}
                fontSize="11" fill="#64748b"
                textAnchor={isFirst ? 'start' : isLast ? 'end' : 'middle'}
              >
                {label}
              </text>
            )
          })}
        </svg>

        {/* Legend */}
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 px-2 text-[10.5px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-[3px] w-4 rounded-full" style={{ background: '#0a3d8f' }} />
            <span>Geçmiş 12 ay</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-[3px] w-4 rounded-full" style={{ background: 'repeating-linear-gradient(90deg, #f07a23 0 4px, transparent 4px 7px)' }} />
            <span>Tahmin ({snapshot.horizon} ay)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-[10px] w-4 rounded" style={{ background: 'rgba(240,122,35,0.10)' }} />
            <span>Güven aralığı</span>
          </span>
        </div>
      </div>

      {/* Hover tooltip */}
      {hover && typeof document !== 'undefined' && createPortal(
        <div
          role="tooltip"
          className="pointer-events-none"
          style={{
            position: 'fixed',
            left: hover.x + 12,
            top: hover.y - 12,
            zIndex: 9999,
            background: 'linear-gradient(180deg, #1e293b, #0f172a)',
            color: '#fff',
            borderRadius: 10,
            padding: '8px 12px',
            boxShadow: '0 12px 28px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.06)',
            border: '1px solid rgba(148,163,184,0.18)',
            fontSize: 11,
          }}
        >
          <div className="font-extrabold tracking-tight">{fmtMonthKey(hover.key)}</div>
          <div className="mt-0.5 tabular-nums text-slate-200">{fmtTon(hover.qty)}</div>
          <div
            className="mt-0.5 text-[9.5px] font-extrabold uppercase tracking-wider"
            style={{ color: hover.isForecast ? '#fcd34d' : '#93c5fd' }}
          >
            {hover.isForecast ? 'Tahmin' : 'Gerçek'}
          </div>
        </div>,
        document.body,
      )}
    </section>
  )
}

// ────────────────────────────────────────────────────────────────────────────

function mapeColorCls(m: number | null): string {
  if (m == null) return 'bg-muted text-muted-foreground'
  if (m < 15) return 'bg-emerald-100 text-emerald-700'
  if (m < 30) return 'bg-amber-100 text-amber-700'
  if (m < 60) return 'bg-orange-100 text-orange-700'
  return 'bg-rose-100 text-rose-700'
}

function addMonths(key: string, n: number): string {
  const [yStr, mStr] = String(key).split('-')
  let y = parseInt(yStr, 10)
  let m = parseInt(mStr, 10) - 1 + n
  while (m >= 12) { y++; m -= 12 }
  while (m < 0) { y--; m += 12 }
  return `${y}-${String(m + 1).padStart(2, '0')}`
}
