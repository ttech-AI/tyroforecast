// ════════════════════════════════════════════════════════════════════════════
// ExecutiveSummaryHero — dark navy hero kartı (YÖNETİCİ ÖZETİ)
// ────────────────────────────────────────────────────────────────────────────
// Referans patern: orange-glow pill üstte, narrative paragraph altında,
// gradient highlight'lı kelimeler, en altta 3 stat. Premium executive feel.
// ════════════════════════════════════════════════════════════════════════════

import { HugeiconsIcon } from '@hugeicons/react'
import { AiBrain04Icon, ChartLineData01Icon, TradeUpIcon, PercentSquareIcon } from '@hugeicons/core-free-icons'
import { motion } from 'framer-motion'
import { buildExecutiveSummary } from '../../lib/forecast/buildExecutiveSummary.jsx'
import { fmtTon, fmtPct } from '../../lib/forecast/format.js'

type Snapshot = {
  traderName: string
  filterScope: string
  resolvedSubCount: number
  totalQtyLast12: number
  yoy: number | null
  horizon: number
  forecastTotal: number
  bestModelMape: number | null
  intermittenceIndex: number | null
  character: string
  topCustomers: Array<{ id: string; name: string | null; pct: number }>
  historyKeys: string[]
}

export function ExecutiveSummaryHero({ snapshot }: { snapshot: Snapshot }) {
  const summary = buildExecutiveSummary(snapshot)

  // Aktivite: kaç ay aktif / toplam ay
  const totalMonths = snapshot.historyKeys.length
  const activeMonths = snapshot.intermittenceIndex != null
    ? Math.round(snapshot.intermittenceIndex * totalMonths)
    : null

  // Doğruluk: 100 - MAPE (clamp 0-100)
  const accuracy = snapshot.bestModelMape != null
    ? Math.max(0, Math.min(100, 100 - snapshot.bestModelMape))
    : null

  return (
    <section
      className="relative overflow-hidden rounded-2xl"
      style={{
        background: 'linear-gradient(135deg, #0a1f4a 0%, #0a3d8f 50%, #1d4ed8 100%)',
      }}
    >
      {/* Subtle dot pattern overlay */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.10) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          opacity: 0.4,
        }}
      />
      {/* Orange glow blob — sağ alt köşede ambient ışık */}
      <div
        aria-hidden="true"
        className="absolute -bottom-20 -right-20 h-72 w-72 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(240,122,35,0.18) 0%, transparent 65%)' }}
      />
      {/* Üst gradient şerit */}
      <div
        aria-hidden="true"
        className="h-[3px]"
        style={{ background: 'linear-gradient(90deg, #f07a23 0%, #fbbf24 50%, #f07a23 100%)' }}
      />
      <div className="relative p-5 md:p-7">
        {/* "YÖNETİCİ ÖZETİ" pill */}
        <motion.span
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider"
          style={{
            background: 'rgba(240,122,35,0.18)',
            color: '#fcd34d',
            border: '1px solid rgba(251,191,36,0.30)',
            boxShadow: '0 0 18px rgba(240,122,35,0.20)',
          }}
        >
          <HugeiconsIcon icon={AiBrain04Icon} size={15} strokeWidth={2} />
          YÖNETİCİ ÖZETİ
        </motion.span>

        {/* Narrative paragraph */}
        <motion.p
          initial={{ y: 6, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.42, delay: 0.08, ease: 'easeOut' }}
          className="mt-4 text-[15px] font-medium leading-[1.6] text-white md:text-[17px] md:leading-[1.55]"
        >
          {summary}
        </motion.p>

        {/* 3 stat row */}
        <motion.div
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.42, delay: 0.18, ease: 'easeOut' }}
          className="mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-xl"
          style={{ background: 'rgba(255,255,255,0.08)' }}
        >
          <HeroStat
            icon={ChartLineData01Icon}
            label="Son 12 Ay"
            value={fmtTon(snapshot.totalQtyLast12)}
          />
          <HeroStat
            icon={TradeUpIcon}
            label="Aktivite"
            value={activeMonths != null && totalMonths > 0
              ? `${activeMonths}/${totalMonths} ay`
              : '—'}
          />
          <HeroStat
            icon={PercentSquareIcon}
            label="Model Doğruluk"
            value={accuracy != null ? `%${accuracy.toFixed(0)}` : '—'}
            sub={snapshot.yoy != null ? `YoY ${fmtPct(snapshot.yoy)}` : undefined}
          />
        </motion.div>
      </div>
    </section>
  )
}

// ────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function HeroStat({ icon, label, value, sub }: { icon: any; label: string; value: string; sub?: string }) {
  return (
    <div
      className="px-3 py-3.5 transition-colors hover:bg-white/[0.04] md:px-5 md:py-4"
      style={{ background: 'rgba(13,30,68,0.45)' }}
    >
      <div className="flex items-center gap-1.5 text-[9.5px] font-extrabold uppercase tracking-wider text-amber-200/85">
        <HugeiconsIcon icon={icon} size={11} strokeWidth={2.2} />
        {label}
      </div>
      <div className="mt-1.5 text-[18px] font-extrabold leading-none tracking-tight tabular-nums text-white md:text-[22px]">
        {value}
      </div>
      {sub && (
        <div className="mt-1 text-[10px] font-medium text-slate-300">{sub}</div>
      )}
    </div>
  )
}
