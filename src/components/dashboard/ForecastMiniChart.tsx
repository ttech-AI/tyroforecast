// ════════════════════════════════════════════════════════════════════════════
// ForecastMiniChart — Anasayfa Row 2 sağında compact line chart
// ────────────────────────────────────────────────────────────────────────────
// Son 12 ay hist + sonraki H ay forecast. Inline SVG, datapoint hover tooltip.
// ════════════════════════════════════════════════════════════════════════════

import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { ChartLineData01Icon, AiBrain03Icon } from '@hugeicons/core-free-icons'
import { fmtTon, fmtMonthKey } from '../../lib/forecast/format.js'

type Snapshot = {
  bestModelId: string | null
  bestModelMape: number | null
  horizon: number
  historyKeys: string[]
  historyQty: number[]
  forecastMonths: Array<{ key: string; qty: number; lower: number | null; upper: number | null }>
}

const MODEL_LABELS: Record<string, string> = {
  hw: 'Holt-Winters',
  stl: 'STL+ETS',
  stlOut: 'Outlier STL+ETS',
  theta: 'Theta',
  holtLin: "Holt's Linear",
  snaive: 'Seasonal Naive',
  croston: 'Croston',
  ma3: 'Moving Avg',
}

export function ForecastMiniChart({ snapshot }: { snapshot: Snapshot }) {
  const modelLabel = snapshot.bestModelId ? MODEL_LABELS[snapshot.bestModelId] || snapshot.bestModelId : '—'

  // Son 12 ay hist + sonraki H ay forecast
  const histRecent = useMemo(() => {
    const n = Math.min(12, snapshot.historyKeys.length)
    return {
      keys: snapshot.historyKeys.slice(-n),
      qty: snapshot.historyQty.slice(-n),
    }
  }, [snapshot.historyKeys, snapshot.historyQty])

  const fcKeys = snapshot.forecastMonths.map((m) => m.key)
  const fcQty = snapshot.forecastMonths.map((m) => m.qty)
  const fcLower = snapshot.forecastMonths.map((m) => m.lower ?? m.qty)
  const fcUpper = snapshot.forecastMonths.map((m) => m.upper ?? m.qty)

  const allKeys = [...histRecent.keys, ...fcKeys]
  const allVals = [...histRecent.qty, ...fcQty]
  const allUpper = [...histRecent.qty, ...fcUpper]
  const maxVal = Math.max(1, ...allUpper)

  // SVG geometri
  const W = 380
  const H = 140
  const padT = 16, padB = 22, padL = 12, padR = 12
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const xAt = (i: number) => padL + (allKeys.length <= 1 ? 0 : (i / (allKeys.length - 1)) * innerW)
  const yAt = (v: number) => padT + innerH - (v / maxVal) * innerH

  // Cubic bezier (half-distance control points) — yumuşak çizgi
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

  // Forecast confidence band
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

  // Separator line (hist sonu)
  const sepIdx = histRecent.keys.length - 1
  const sepX = xAt(sepIdx)

  // Tooltip state
  const [hover, setHover] = useState<{ x: number; y: number; key: string; qty: number; isForecast: boolean } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * W
    // En yakın index'i bul
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

  return (
    <section className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.10)]">
      {/* Header */}
      <header className="flex items-start justify-between gap-2 border-b border-border/60 px-4 py-3 md:px-5">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={ChartLineData01Icon} size={18} strokeWidth={1.9} color="#0a3d8f" />
          <div>
            <h3 className="text-[13px] font-bold leading-tight text-foreground">Tahmin Grafiği</h3>
            <p className="text-[10.5px] text-muted-foreground">Son 12 ay + sonraki {snapshot.horizon} ay</p>
          </div>
        </div>
        <span
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-extrabold tabular-nums"
          style={{
            background: 'linear-gradient(135deg, rgba(10,61,143,0.10), rgba(240,122,35,0.06))',
            color: '#0a3d8f',
            border: '1px solid rgba(10,61,143,0.18)',
          }}
        >
          <HugeiconsIcon icon={AiBrain03Icon} size={9} strokeWidth={2.4} />
          {modelLabel}
          {snapshot.bestModelMape != null && <span className="opacity-70">· %{snapshot.bestModelMape.toFixed(1)}</span>}
        </span>
      </header>

      {/* Chart */}
      <div className="relative px-2 py-2">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full"
          style={{ height: H }}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          aria-label="Forecast mini chart"
        >
          {/* Confidence band */}
          {bandPath && (
            <path d={bandPath} fill="rgba(240,122,35,0.10)" />
          )}
          {/* History line */}
          {histPath && (
            <path d={histPath} fill="none" stroke="#0a3d8f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          )}
          {/* Forecast line (dashed) */}
          {fcPath && (
            <path d={fcPath} fill="none" stroke="#f07a23" strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" />
          )}
          {/* Separator (today) */}
          {sepIdx >= 0 && (
            <line
              x1={sepX} x2={sepX} y1={padT} y2={H - padB}
              stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 3" opacity="0.5"
            />
          )}
          {/* Data points (forecast only — emphasize) */}
          {fcQty.map((v, i) => (
            <circle
              key={`fc-${i}`}
              cx={xAt(histRecent.keys.length + i)}
              cy={yAt(v)}
              r={hover && hover.key === fcKeys[i] ? 4 : 2.5}
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
              r="3" fill="#0a3d8f" stroke="#fff" strokeWidth="1.5"
            />
          )}
          {/* X axis sparse labels */}
          {allKeys.map((k, i) => {
            if (i !== 0 && i !== histRecent.keys.length - 1 && i !== allKeys.length - 1) return null
            const label = fmtMonthKey(k, { year: false })
            return (
              <text
                key={`lbl-${i}`}
                x={xAt(i)} y={H - 6}
                fontSize="9" fill="#64748b" textAnchor={i === 0 ? 'start' : i === allKeys.length - 1 ? 'end' : 'middle'}
              >
                {label}
              </text>
            )
          })}
        </svg>
      </div>

      {/* Hover tooltip portal */}
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
