// ════════════════════════════════════════════════════════════════════════════
// SeasonalActivityStrip — Anasayfa Row 4
// ────────────────────────────────────────────────────────────────────────────
// Sol 2/3: Mevsim profili (12 ay bar chart) + pik/düşük ay insight'ı
// Sağ 1/3: Aktivite (intermittence) yarım daire gauge + karakter etiketi
// ════════════════════════════════════════════════════════════════════════════

import { useMemo, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { CalendarAnalysisIcon, FlashIcon } from '@hugeicons/core-free-icons'
import { MONTHS_TR_SHORT, MONTHS_TR_FULL, fmtTon } from '../../lib/forecast/format.js'

type Snapshot = {
  historyKeys: string[]
  historyQty: number[]
  intermittenceIndex: number | null
  character: string
}

export function SeasonalActivityStrip({ snapshot }: { snapshot: Snapshot }) {
  // ── Mevsim profili: aylara göre ortalama (geçmiş 24 ay) ──
  const seasonality = useMemo(() => {
    const sums = Array(12).fill(0) as number[]
    const counts = Array(12).fill(0) as number[]
    for (let i = 0; i < snapshot.historyKeys.length; i++) {
      const k = snapshot.historyKeys[i]
      const v = snapshot.historyQty[i]
      const month = parseInt(String(k).split('-')[1] || '0', 10) - 1
      if (month < 0 || month > 11) continue
      if (Number.isFinite(v) && v > 0) {
        sums[month] += v
        counts[month]++
      }
    }
    const avgs = sums.map((s, i) => counts[i] > 0 ? s / counts[i] : 0)
    const validAvgs = avgs.filter((v) => v > 0)
    const overall = validAvgs.length > 0 ? validAvgs.reduce((a, b) => a + b, 0) / validAvgs.length : 0
    const indices = avgs.map((a) => overall > 0 ? (a / overall - 1) * 100 : 0)
    const max = Math.max(...avgs, 1)
    return { avgs, indices, max, overall }
  }, [snapshot.historyKeys, snapshot.historyQty])

  // Pik / düşük aylar
  const peakIdxs = [...seasonality.indices.keys()]
    .filter((i) => seasonality.avgs[i] > 0)
    .sort((a, b) => seasonality.indices[b] - seasonality.indices[a])
    .slice(0, 2)
  const lowIdxs = [...seasonality.indices.keys()]
    .filter((i) => seasonality.avgs[i] > 0)
    .sort((a, b) => seasonality.indices[a] - seasonality.indices[b])
    .slice(0, 2)

  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
      {/* Sol — Mevsim Profili */}
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.10)] lg:col-span-2">
        <header className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3 md:px-5">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={CalendarAnalysisIcon} size={16} strokeWidth={1.9} color="#14b8a6" />
            <div>
              <h3 className="text-[12.5px] font-bold leading-tight text-foreground">Mevsim Profili</h3>
              <p className="mt-0.5 text-[10.5px] font-medium text-muted-foreground">
                Aylık ortalamaların genel ortalamadan sapma yüzdesi
              </p>
            </div>
          </div>
        </header>
        <div className="px-4 py-4 md:px-5">
          {/* 12 ay bar chart */}
          <SeasonalBars seasonality={seasonality} />
          {/* Pik / düşük insight */}
          <div className="mt-3 grid grid-cols-1 gap-2 text-[11.5px] leading-relaxed text-foreground/80 sm:grid-cols-2">
            <div>
              <span className="font-extrabold text-emerald-700">Pik aylar:</span>{' '}
              {peakIdxs.length === 0 ? '—' : peakIdxs.map((i) => MONTHS_TR_SHORT[i]).join(', ')}
              {peakIdxs.length > 0 && (
                <span className="ml-1 text-muted-foreground">
                  (+%{seasonality.indices[peakIdxs[0]].toFixed(0)} ortalamadan)
                </span>
              )}
            </div>
            <div>
              <span className="font-extrabold text-rose-700">Düşük aylar:</span>{' '}
              {lowIdxs.length === 0 ? '—' : lowIdxs.map((i) => MONTHS_TR_SHORT[i]).join(', ')}
              {lowIdxs.length > 0 && (
                <span className="ml-1 text-muted-foreground">
                  (%{seasonality.indices[lowIdxs[0]].toFixed(0)} ortalamadan)
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sağ — Aktivite Gauge */}
      <ActivityGauge snapshot={snapshot} />
    </section>
  )
}

// ────────────────────────────────────────────────────────────────────────────

function SeasonalBars({ seasonality }: {
  seasonality: { avgs: number[]; indices: number[]; max: number }
}) {
  const [hoveredM, setHoveredM] = useState<number | null>(null)

  return (
    <div className="relative">
      <div className="flex items-end gap-1.5" style={{ height: 80 }}>
        {seasonality.avgs.map((v, i) => {
          const idx = seasonality.indices[i]
          const heightPct = seasonality.max > 0 ? Math.max(4, (v / seasonality.max) * 100) : 4
          const color = v === 0
            ? '#e2e8f0'
            : idx >= 10
              ? '#10b981'  // peak — emerald
              : idx <= -10
                ? '#cbd5e1'  // low — gray
                : '#3b82f6'  // average — blue
          const isHovered = hoveredM === i
          return (
            <button
              key={i}
              type="button"
              onMouseEnter={() => setHoveredM(i)}
              onMouseLeave={() => setHoveredM(null)}
              className="group/bar relative flex-1 cursor-pointer rounded-t transition-all duration-200"
              style={{
                height: `${heightPct}%`,
                background: v === 0
                  ? color
                  : `linear-gradient(180deg, ${color}, ${color}cc)`,
                transform: isHovered ? 'scaleY(1.06)' : 'scaleY(1)',
                transformOrigin: 'bottom',
                boxShadow: isHovered ? `0 -2px 8px ${color}66` : 'none',
              }}
              aria-label={`${MONTHS_TR_FULL[i]}: ortalama ${fmtTon(seasonality.avgs[i])}`}
            />
          )
        })}
      </div>
      {/* Ay etiketleri */}
      <div className="mt-2 flex gap-1.5">
        {MONTHS_TR_SHORT.map((m, i) => (
          <div
            key={i}
            className={`flex-1 text-center text-[9.5px] font-extrabold tracking-wider transition-colors ${
              hoveredM === i ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            {m[0]}
          </div>
        ))}
      </div>
      {/* Hover detail */}
      {hoveredM != null && seasonality.avgs[hoveredM] > 0 && (
        <div className="mt-2 rounded-md bg-muted/40 px-2 py-1 text-[10.5px] leading-snug">
          <strong className="text-foreground">{MONTHS_TR_FULL[hoveredM]}</strong>
          {' — ortalama '}
          <span className="tabular-nums font-semibold text-foreground">{fmtTon(seasonality.avgs[hoveredM])}</span>
          {' · '}
          <span className={seasonality.indices[hoveredM] >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
            {seasonality.indices[hoveredM] >= 0 ? '+' : ''}{seasonality.indices[hoveredM].toFixed(0)}% ortalamadan
          </span>
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────

function ActivityGauge({ snapshot }: { snapshot: Snapshot }) {
  const idx = snapshot.intermittenceIndex ?? 0
  const pct = Math.max(0, Math.min(1, idx)) * 100
  const character = String(snapshot.character || '').toLowerCase()
  const tone = character.includes('stabil')
    ? { color: '#047857', bg: 'rgba(16,185,129,0.10)', border: 'rgba(4,120,87,0.22)' }
    : character.includes('düzensiz')
      ? { color: '#b45309', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.25)' }
      : { color: '#be123c', bg: 'rgba(244,63,94,0.10)', border: 'rgba(244,63,94,0.22)' }

  // Yarım daire path
  const cx = 80, cy = 80, r = 60
  const angle = Math.PI * (1 - pct / 100)  // 180° → 0°
  const endX = cx + r * Math.cos(angle)
  const endY = cy - r * Math.sin(angle)
  const arcSweep = pct >= 50 ? 1 : 0

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.10)]">
      <header className="flex items-center gap-2 border-b border-border/60 px-4 py-3 md:px-5">
        <HugeiconsIcon icon={FlashIcon} size={16} strokeWidth={1.9} color={tone.color} />
        <div>
          <h3 className="text-[12.5px] font-bold leading-tight text-foreground">Aktivite (Süreklilik)</h3>
          <p className="mt-0.5 text-[10.5px] font-medium text-muted-foreground">
            Satış yapılan ayların oranı
          </p>
        </div>
      </header>
      <div className="flex flex-col items-center px-4 py-4 md:px-5">
        <svg viewBox="0 0 160 90" className="w-full max-w-[180px]">
          {/* Background arc */}
          <path
            d={`M 20 80 A 60 60 0 0 1 140 80`}
            fill="none"
            stroke="rgba(148,163,184,0.18)"
            strokeWidth="10"
            strokeLinecap="round"
          />
          {/* Filled arc */}
          {pct > 0 && (
            <path
              d={`M 20 80 A 60 60 0 ${arcSweep} 1 ${endX.toFixed(2)} ${endY.toFixed(2)}`}
              fill="none"
              stroke={tone.color}
              strokeWidth="10"
              strokeLinecap="round"
              style={{ transition: 'all 0.6s cubic-bezier(0.16,1,0.3,1)' }}
            />
          )}
          {/* Center value */}
          <text
            x="80" y="65"
            textAnchor="middle"
            fontSize="24"
            fontWeight="800"
            fill={tone.color}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            %{pct.toFixed(0)}
          </text>
        </svg>
        <span
          className="mt-2 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-bold"
          style={{ background: tone.bg, borderColor: tone.border, color: tone.color }}
        >
          {snapshot.character || '—'}
        </span>
      </div>
    </div>
  )
}
