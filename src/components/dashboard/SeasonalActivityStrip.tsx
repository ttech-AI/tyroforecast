// ════════════════════════════════════════════════════════════════════════════
// SeasonalActivityStrip — Anasayfa Row 4
// ────────────────────────────────────────────────────────────────────────────
// Sol 2/3: Mevsim profili (12 ay bar chart) + pik/düşük ay insight'ı
// Sağ 1/3: Tahmin Özet Performans kartı (seçili horizon için projeksiyon özeti)
// ════════════════════════════════════════════════════════════════════════════

import { useMemo, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  CalendarAnalysisIcon,
  ChartIncreaseIcon,
  TradeUpIcon,
  TradeDownIcon,
  Target02Icon,
  CheckmarkBadge02Icon,
} from '@hugeicons/core-free-icons'
// intermittenceIndex + character artık ForecastSummaryCard'da kullanılmıyor —
// snapshot tipinde tutuldu (geriye uyum için), ama UI'da yer almıyor.
import { MONTHS_TR_SHORT, MONTHS_TR_FULL, fmtTon, fmtMonthKey, fmtPct } from '../../lib/forecast/format.js'

type ForecastMonth = { key: string; qty: number; lower: number | null; upper: number | null }

type Snapshot = {
  historyKeys: string[]
  historyQty: number[]
  intermittenceIndex: number | null
  character: string
  // Tahmin özeti için gerekli alanlar
  horizon: number
  forecastTotal: number
  forecastMonths: ForecastMonth[]
  bestModelMape: number | null
  yoy: number | null
  totalQtyLast12: number
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

      {/* Sağ — Tahmin Özet Performans kartı */}
      <ForecastSummaryCard snapshot={snapshot} />
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

// ────────────────────────────────────────────────────────────────────────────
// ForecastSummaryCard — Seçilen horizon için tahmin özet performans kartı
// ────────────────────────────────────────────────────────────────────────────
// Metrikler:
//   • Aylık Ortalama (forecastTotal / horizon)
//   • Toplam Tahmin (X ay için)
//   • Trend (forecast / last12 → büyüme oranı)
//   • Pik Ay (en yüksek tahminli ay + value)
//   • Güven (MAPE → doğruluk yüzdesi)
// ────────────────────────────────────────────────────────────────────────────

function ForecastSummaryCard({ snapshot }: { snapshot: Snapshot }) {
  const horizon = snapshot.horizon || 12
  const total = snapshot.forecastTotal || 0
  const monthlyAvg = horizon > 0 ? total / horizon : 0

  // Pik ay — en yüksek qty'li forecast ayı
  const peakMonth = useMemo(() => {
    if (!snapshot.forecastMonths || snapshot.forecastMonths.length === 0) return null
    let peak = snapshot.forecastMonths[0]
    for (const m of snapshot.forecastMonths) {
      if (m.qty > peak.qty) peak = m
    }
    return peak
  }, [snapshot.forecastMonths])

  // Forecast trend % — tahmin döneminin geçmiş 12 ay aynı uzunluğa karşılığıyla kıyas
  // (annualized: total × 12/h vs totalQtyLast12)
  const trendPct = useMemo(() => {
    if (!snapshot.totalQtyLast12 || snapshot.totalQtyLast12 <= 0 || !total) return null
    const annualized = total * (12 / horizon)
    return ((annualized - snapshot.totalQtyLast12) / snapshot.totalQtyLast12) * 100
  }, [total, horizon, snapshot.totalQtyLast12])

  // Doğruluk: 100 - MAPE
  const accuracy = snapshot.bestModelMape != null
    ? Math.max(0, Math.min(100, 100 - snapshot.bestModelMape))
    : null
  const accuracyTone = accuracy == null
    ? { color: '#64748b', label: 'Bilinmiyor', bg: 'rgba(148,163,184,0.10)' }
    : accuracy >= 80
      ? { color: '#047857', label: 'Yüksek güven', bg: 'rgba(16,185,129,0.10)' }
      : accuracy >= 60
        ? { color: '#b45309', label: 'Orta güven', bg: 'rgba(245,158,11,0.10)' }
        : { color: '#be123c', label: 'Düşük güven', bg: 'rgba(244,63,94,0.10)' }

  // Trend ikonu + rengi
  const trendUp = trendPct != null && trendPct > 0
  const trendDown = trendPct != null && trendPct < 0
  const trendColor = trendUp ? '#047857' : trendDown ? '#be123c' : '#64748b'

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.10)]"
    >
      {/* Gradient şerit */}
      <div
        aria-hidden="true"
        className="h-[3px]"
        style={{ background: 'linear-gradient(90deg, #f07a23 0%, #0a3d8f 100%)' }}
      />
      {/* Header */}
      <header className="flex items-center gap-2 border-b border-border/60 px-4 py-3 md:px-5">
        <HugeiconsIcon icon={Target02Icon} size={16} strokeWidth={1.9} color="#f07a23" />
        <div className="min-w-0">
          <h3 className="truncate text-[12.5px] font-bold leading-tight text-foreground">Tahmin Özet Performans</h3>
          <p className="mt-0.5 truncate text-[10.5px] font-medium text-muted-foreground">
            Önümüzdeki <span className="font-bold text-foreground/80">{horizon} ay</span> için projeksiyon
          </p>
        </div>
      </header>

      <div className="space-y-3 px-4 py-4 md:px-5">
        {/* Üst sıra — 2 büyük metrik */}
        <div className="grid grid-cols-2 gap-2.5">
          {/* Aylık Ortalama */}
          <div
            className="rounded-xl border border-border/60 p-2.5 transition-colors hover:border-foreground/15"
            style={{ background: 'linear-gradient(135deg, rgba(10,61,143,0.04), rgba(59,130,246,0.02))' }}
          >
            <div className="flex items-center gap-1 text-[9.5px] font-extrabold uppercase tracking-wider text-muted-foreground">
              <HugeiconsIcon icon={ChartIncreaseIcon} size={10} strokeWidth={2.4} color="#0a3d8f" />
              Aylık Ortalama
            </div>
            <div className="mt-1.5 text-[15px] font-extrabold leading-tight tracking-tight tabular-nums text-foreground">
              {fmtTon(monthlyAvg)}
            </div>
          </div>
          {/* Toplam Tahmin */}
          <div
            className="rounded-xl border border-border/60 p-2.5 transition-colors hover:border-foreground/15"
            style={{ background: 'linear-gradient(135deg, rgba(240,122,35,0.05), rgba(234,88,12,0.02))' }}
          >
            <div className="flex items-center gap-1 text-[9.5px] font-extrabold uppercase tracking-wider text-muted-foreground">
              <HugeiconsIcon icon={Target02Icon} size={10} strokeWidth={2.4} color="#f07a23" />
              {horizon} Ay Toplam
            </div>
            <div className="mt-1.5 text-[15px] font-extrabold leading-tight tracking-tight tabular-nums text-foreground">
              {fmtTon(total)}
            </div>
          </div>
        </div>

        {/* Trend satırı */}
        <div className="flex items-center justify-between gap-2 rounded-xl border border-border/60 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span
              className="grid h-7 w-7 place-items-center rounded-lg"
              style={{ background: `${trendColor}15`, color: trendColor }}
            >
              <HugeiconsIcon
                icon={trendUp ? TradeUpIcon : trendDown ? TradeDownIcon : ChartIncreaseIcon}
                size={14}
                strokeWidth={2}
              />
            </span>
            <div>
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                Geçmişe Göre Trend
              </div>
              <div className="text-[10px] font-medium text-muted-foreground">
                Geçen 12 ay vs proj. yıllık
              </div>
            </div>
          </div>
          <span
            className="rounded-md px-2.5 py-1 text-[12.5px] font-extrabold tabular-nums"
            style={{
              color: trendColor,
              background: `${trendColor}12`,
              border: `1px solid ${trendColor}30`,
            }}
          >
            {trendPct == null ? '—' : fmtPct(trendPct)}
          </span>
        </div>

        {/* Pik ay + Güven 2'li grid */}
        <div className="grid grid-cols-2 gap-2.5">
          {peakMonth && (
            <div className="rounded-xl border border-border/60 px-2.5 py-2">
              <div className="text-[9.5px] font-extrabold uppercase tracking-wider text-muted-foreground">
                Pik Ay
              </div>
              <div className="mt-0.5 text-[12.5px] font-bold tracking-tight text-foreground">
                {fmtMonthKey(peakMonth.key, { year: false })}
              </div>
              <div className="text-[10.5px] tabular-nums text-muted-foreground">
                {fmtTon(peakMonth.qty)}
              </div>
            </div>
          )}
          <div
            className="rounded-xl border px-2.5 py-2"
            style={{ background: accuracyTone.bg, borderColor: `${accuracyTone.color}22` }}
          >
            <div className="flex items-center gap-1 text-[9.5px] font-extrabold uppercase tracking-wider" style={{ color: accuracyTone.color }}>
              <HugeiconsIcon icon={CheckmarkBadge02Icon} size={10} strokeWidth={2.4} />
              Güven
            </div>
            <div className="mt-0.5 text-[12.5px] font-extrabold tabular-nums" style={{ color: accuracyTone.color }}>
              {accuracy != null ? `%${accuracy.toFixed(0)}` : '—'}
            </div>
            <div className="text-[10px] font-semibold" style={{ color: accuracyTone.color }}>
              {accuracyTone.label}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
