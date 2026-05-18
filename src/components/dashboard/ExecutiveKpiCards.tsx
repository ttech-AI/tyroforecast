// ════════════════════════════════════════════════════════════════════════════
// ExecutiveKpiCards — Anasayfa üst sıra (4 KPI)
// ────────────────────────────────────────────────────────────────────────────
// Toplam Sipariş · Toplam Miktar · Toplam Müşteri · Toplam Ürün
// Snapshot'tan beslenir; her kartın kendine has accent rengi + hover etkisi.
// ════════════════════════════════════════════════════════════════════════════

import { HugeiconsIcon } from '@hugeicons/react'
import {
  PackageAddIcon,
  DashboardSquareAddIcon,
  UserGroup03Icon,
  Archive02Icon,
} from '@hugeicons/core-free-icons'
import { fmtNumber, fmtTon } from '../../lib/forecast/format.js'
import { useCountUp } from '../../lib/anim/useCountUp.js'

type Snapshot = {
  recordCount: number
  totalQtyLast12: number
  yoy: number | null
  uniqueCustomers: number
  uniqueProducts: number
  topProducts: Array<{ id: string; name: string | null; pct: number }>
  topCustomers: Array<{ id: string; name: string | null; pct: number }>
}

export function ExecutiveKpiCards({ snapshot }: { snapshot: Snapshot }) {
  // ── User-friendly executive sub metinleri için hesaplar ──
  // Top-3 müşteri toplam paydası
  const top3CustomerPct = snapshot.topCustomers.slice(0, 3).reduce((s, c) => s + (c.pct || 0), 0)
  // Top-1 ürün payı (lider ürün konsantrasyonu)
  const top1ProductPct = snapshot.topProducts[0]?.pct ?? 0
  const top1ProductName = snapshot.topProducts[0]?.id ?? null

  // Toplam Sipariş alt metni — kayıt sayısına göre nüanslı
  const orderSub = snapshot.recordCount > 0
    ? 'Geçmiş satış işlem kayıtları'
    : 'Henüz işlem kaydı yok'

  // Toplam Miktar alt metni — YoY varsa kısa, yoksa açıklayıcı
  const qtySub = snapshot.yoy != null
    ? 'Son 12 ayda gerçekleşen'
    : 'Son 12 ay toplam satış'

  // Toplam Müşteri alt metni — konsantrasyon insight'ı + risk uyarısı
  let customerSub: string
  if (snapshot.uniqueCustomers === 0) {
    customerSub = 'Veri yok'
  } else if (top3CustomerPct >= 60) {
    customerSub = `Top 3 satışın %${top3CustomerPct.toFixed(0)}'i — yüksek bağımlılık`
  } else if (top3CustomerPct > 0) {
    customerSub = `Top 3 satışın %${top3CustomerPct.toFixed(0)}'ini oluşturuyor`
  } else {
    customerSub = 'Müşteri portföyü dağılımı'
  }

  // Toplam Ürün alt metni — lider ürün payı varsa onunla, yoksa portföy bilgisi
  let productSub: string
  if (snapshot.uniqueProducts === 0) {
    productSub = 'Veri yok'
  } else if (top1ProductName && top1ProductPct > 0) {
    productSub = `Lider: ${top1ProductName} (%${top1ProductPct.toFixed(0)})`
  } else {
    productSub = 'Ürün portföyü genişliği'
  }

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      <KpiCard
        accent="#0a3d8f"
        icon={<HugeiconsIcon icon={DashboardSquareAddIcon} size={18} strokeWidth={1.9} color="#0a3d8f" />}
        label="Toplam Miktar"
        valueNumber={snapshot.totalQtyLast12}
        valueFmt={fmtTon}
        sub={qtySub}
      />
      <KpiCard
        accent="#f07a23"
        icon={<HugeiconsIcon icon={Archive02Icon} size={18} strokeWidth={1.9} color="#f07a23" />}
        label="Toplam Sipariş"
        valueNumber={snapshot.recordCount}
        valueFmt={(n) => fmtNumber(Math.round(n))}
        sub={orderSub}
      />
      <KpiCard
        accent="#10b981"
        icon={<HugeiconsIcon icon={UserGroup03Icon} size={18} strokeWidth={1.9} color="#10b981" />}
        label="Toplam Müşteri"
        valueNumber={snapshot.uniqueCustomers}
        valueFmt={(n) => fmtNumber(Math.round(n))}
        sub={customerSub}
      />
      <KpiCard
        accent="#8b5cf6"
        icon={<HugeiconsIcon icon={PackageAddIcon} size={18} strokeWidth={1.9} color="#8b5cf6" />}
        label="Toplam Ürün"
        valueNumber={snapshot.uniqueProducts}
        valueFmt={(n) => fmtNumber(Math.round(n))}
        sub={productSub}
      />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────

type KpiCardProps = {
  accent: string
  icon: React.ReactNode
  label: string
  valueNumber: number
  valueFmt: (n: number) => string
  sub: string
}

function KpiCard({ accent, icon, label, valueNumber, valueFmt, sub }: KpiCardProps) {
  // Counting-up animasyonu (mount'ta veya snapshot değiştiğinde)
  const animated = useCountUp(valueNumber, { duration: 700 })

  return (
    <div
      className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_14px_-6px_rgba(15,23,42,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-[0_4px_12px_-2px_rgba(15,23,42,0.08),0_12px_28px_-8px_rgba(15,23,42,0.14)] md:p-5"
    >
      {/* Accent border-bottom (hover'da kalınlaşır) */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-[2px] origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100"
        style={{ background: `linear-gradient(90deg, ${accent}33, ${accent})` }}
      />
      <header className="flex items-center gap-2">
        {icon}
        <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </header>
      <p
        className="mt-3 text-[22px] font-extrabold leading-none tracking-tight tabular-nums text-foreground md:text-[26px]"
        style={{ textShadow: `0 0 0 ${accent}` /* placeholder for glow */ }}
      >
        {valueFmt(animated)}
      </p>
      <p className="mt-2 text-[10.5px] font-medium text-muted-foreground">
        {sub}
      </p>
    </div>
  )
}

