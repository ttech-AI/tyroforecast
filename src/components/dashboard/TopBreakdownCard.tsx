// ════════════════════════════════════════════════════════════════════════════
// TopBreakdownCard — Anasayfa Row 3 için ortak component (3 yerde kullanılır)
// ────────────────────────────────────────────────────────────────────────────
// Müşteri / Ürün / Şirket — hepsi aynı pattern:
// gold/silver/bronze rank badge + ID + name + accent yüzde + progress bar
// Hover: kart lift, satır highlight, progress shimmer, detay tooltip portal.
// ════════════════════════════════════════════════════════════════════════════

import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { fmtTon, fmtNumber } from '../../lib/forecast/format.js'

type Item = { id: string; name: string | null; qty: number; pct: number }

type Props = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any
  accent: string  // hex
  title: string
  subtitle?: string
  items: Item[]
  /** "müşteri" | "ürün" | "şirket" — tooltip metinleri için */
  entityLabel?: string
}

const RANK_COLORS = ['#fbbf24', '#94a3b8', '#cd7f32', '#cbd5e1', '#cbd5e1']
const RANK_LABELS = ['Lider', '2. sırada', '3. sırada', '4. sırada', '5. sırada']

type TooltipState = {
  idx: number
  x: number
  y: number
  placement: 'right' | 'left'
}

export function TopBreakdownCard({ icon, accent, title, subtitle, items, entityLabel = 'kayıt' }: Props) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const [tip, setTip] = useState<TooltipState | null>(null)
  const rowRefs = useRef<Array<HTMLLIElement | null>>([])
  const total = useMemo(
    () => items.reduce((s, x) => s + (x.qty || 0), 0) || 1,
    [items],
  )

  const onEnterRow = (i: number) => {
    setHoveredIdx(i)
    const el = rowRefs.current[i]
    if (!el) return
    const r = el.getBoundingClientRect()
    const tipW = 280
    const gap = 12
    const fitsRight = r.right + tipW + gap < window.innerWidth
    setTip({
      idx: i,
      x: fitsRight ? r.right + gap : r.left - tipW - gap,
      y: Math.max(8, r.top + r.height / 2),
      placement: fitsRight ? 'right' : 'left',
    })
  }
  const onLeaveRow = () => { setHoveredIdx(null); setTip(null) }

  return (
    <section className="group/card overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.10)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_12px_-2px_rgba(15,23,42,0.08),0_16px_36px_-12px_rgba(15,23,42,0.14)]">
      {/* Header */}
      <header className="flex items-center gap-2 border-b border-border/60 px-4 py-3 md:px-5">
        <HugeiconsIcon icon={icon} size={16} strokeWidth={1.9} color={accent} />
        <div className="min-w-0">
          <h3 className="text-[12.5px] font-bold leading-tight text-foreground">{title}</h3>
          {subtitle && (
            <p className="mt-0.5 text-[10.5px] font-medium text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </header>

      {/* Items */}
      {items.length === 0 ? (
        <div className="px-5 py-6 text-center text-[11.5px] italic text-muted-foreground">
          Veri yok
        </div>
      ) : (
        <ul className="space-y-2 px-4 py-3 md:px-5 md:py-4">
          {items.map((it, i) => {
            const rankColor = RANK_COLORS[i] || '#cbd5e1'
            const pct = it.pct != null ? it.pct : (total > 0 ? (it.qty / total) * 100 : 0)
            const isHovered = hoveredIdx === i
            const displayName = it.name && it.name !== it.id ? it.name : null
            return (
              <li
                key={`${it.id}-${i}`}
                ref={(el) => { rowRefs.current[i] = el }}
                onMouseEnter={() => onEnterRow(i)}
                onMouseLeave={onLeaveRow}
                className="group/row relative cursor-help rounded-lg px-2 py-1.5 transition-colors duration-150"
                style={isHovered ? {
                  background: 'linear-gradient(90deg, transparent, rgba(148,163,184,0.10) 50%, transparent)',
                } : undefined}
              >
                <div className="flex items-center gap-2.5">
                  {/* Rank badge */}
                  <div
                    className="inline-flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-md text-[10px] font-extrabold text-white transition-transform duration-200"
                    style={{
                      background: `linear-gradient(135deg, ${rankColor}, ${rankColor}cc)`,
                      boxShadow: isHovered
                        ? `0 0 0 3px ${rankColor}33, 0 2px 6px ${rankColor}55`
                        : `0 1px 3px ${rankColor}55`,
                      transform: isHovered ? 'scale(1.10)' : 'scale(1)',
                    }}
                  >
                    {i + 1}
                  </div>
                  {/* ID + name */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className="min-w-0 truncate text-[11.5px] font-bold text-foreground"
                      >
                        {it.id}
                        {displayName && (
                          <span className="ml-1 font-normal text-muted-foreground">• {displayName}</span>
                        )}
                      </span>
                      <span
                        className="shrink-0 text-[11px] font-extrabold tabular-nums"
                        style={{ color: accent }}
                      >
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div className="relative mt-1 h-[5px] overflow-hidden rounded-full bg-muted/60">
                      <div
                        className="h-full rounded-full transition-[width] duration-500"
                        style={{
                          width: `${Math.min(100, pct)}%`,
                          background: `linear-gradient(90deg, ${accent}aa, ${accent})`,
                        }}
                      />
                      {/* Shimmer (hover'da) */}
                      {isHovered && (
                        <div
                          aria-hidden="true"
                          className="absolute inset-y-0 w-1/3"
                          style={{
                            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.50), transparent)',
                            animation: 'shimmer-bar 1.4s linear infinite',
                          }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* Detay tooltip — hover satırın yanında portal olarak açılır */}
      {tip && items[tip.idx] && typeof document !== 'undefined' && createPortal(
        (() => {
          const it = items[tip.idx]
          const pct = it.pct != null ? it.pct : (total > 0 ? (it.qty / total) * 100 : 0)
          const displayName = it.name && it.name !== it.id ? it.name : null
          const rankColor = RANK_COLORS[tip.idx] || '#cbd5e1'
          const rankLabel = RANK_LABELS[tip.idx] || `${tip.idx + 1}. sırada`
          const remaining = total - it.qty
          return (
            <div
              role="tooltip"
              className="pointer-events-none"
              style={{
                position: 'fixed',
                left: tip.x,
                top: tip.y,
                width: 280,
                zIndex: 9999,
                transform: 'translateY(-50%)',
                background: 'linear-gradient(180deg, #1e293b, #0f172a)',
                color: '#fff',
                borderRadius: 12,
                padding: '12px 14px',
                boxShadow: '0 16px 36px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.06)',
                border: '1px solid rgba(148,163,184,0.18)',
                fontSize: 11.5,
                lineHeight: 1.55,
              }}
            >
              {/* Üst — rank rozet + ID + isim */}
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-extrabold text-slate-900"
                  style={{ background: `linear-gradient(135deg, ${rankColor}, ${rankColor}cc)` }}
                >
                  {tip.idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-extrabold text-white">{it.id}</div>
                  <div
                    className="text-[9.5px] font-extrabold uppercase tracking-wider"
                    style={{ color: rankColor }}
                  >
                    {rankLabel}
                  </div>
                </div>
              </div>
              {displayName && (
                <div className="mt-2 text-[11px] text-slate-200/85">
                  <span className="opacity-70">İsim: </span>
                  <span className="font-semibold text-white">{displayName}</span>
                </div>
              )}
              {/* Metrik tablosu */}
              <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-200/85">
                <div className="opacity-70">Toplam Miktar</div>
                <div className="font-semibold tabular-nums text-amber-200">{fmtTon(it.qty)}</div>
                <div className="opacity-70">Toplam Payı</div>
                <div className="font-semibold tabular-nums text-white">%{pct.toFixed(2)}</div>
                <div className="opacity-70">Filtre Toplamı</div>
                <div className="font-semibold tabular-nums text-white">{fmtTon(total)}</div>
                <div className="opacity-70">Diğer {entityLabel}ler</div>
                <div className="font-semibold tabular-nums text-white">{fmtTon(remaining)}</div>
              </div>
              {/* Mini bar visualisation */}
              <div className="mt-3">
                <div className="flex h-[6px] overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full"
                    style={{
                      width: `${Math.min(100, pct)}%`,
                      background: `linear-gradient(90deg, ${accent}aa, ${accent})`,
                    }}
                  />
                </div>
                <div className="mt-1 flex items-center justify-between text-[9.5px] font-semibold text-slate-300">
                  <span>Bu {entityLabel}</span>
                  <span>{fmtNumber(items.length)} {entityLabel} toplam</span>
                </div>
              </div>
            </div>
          )
        })(),
        document.body,
      )}
    </section>
  )
}
