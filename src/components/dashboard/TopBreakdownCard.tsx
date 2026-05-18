// ════════════════════════════════════════════════════════════════════════════
// TopBreakdownCard — Anasayfa Row 3 için ortak component (3 yerde kullanılır)
// ────────────────────────────────────────────────────────────────────────────
// Müşteri / Ürün / Şirket — hepsi aynı pattern:
// gold/silver/bronze rank badge + ID + name + accent yüzde + progress bar
// Hover: kart lift, satır highlight, progress shimmer.
// ════════════════════════════════════════════════════════════════════════════

import { useMemo, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'

type Item = { id: string; name: string | null; qty: number; pct: number }

type Props = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any
  accent: string  // hex
  title: string
  subtitle?: string
  items: Item[]
}

const RANK_COLORS = ['#fbbf24', '#94a3b8', '#cd7f32', '#cbd5e1', '#cbd5e1']

export function TopBreakdownCard({ icon, accent, title, subtitle, items }: Props) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const total = useMemo(
    () => items.reduce((s, x) => s + (x.qty || 0), 0) || 1,
    [items],
  )

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
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                className="group/row relative rounded-lg px-2 py-1.5 transition-colors duration-150"
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
                        title={displayName ? `${it.id} • ${displayName}` : it.id}
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
    </section>
  )
}
