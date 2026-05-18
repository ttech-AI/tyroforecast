import { type ComponentType } from 'react'
import { Star } from 'lucide-react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Money02Icon,
  StarAward01Icon,
  Invoice01Icon,
  Pulse02Icon,
} from '@hugeicons/core-free-icons'

type IconProps = { className?: string; strokeWidth?: number }
type ChipColor = 'orange' | 'amber' | 'blue' | 'emerald'

const EarningsIcon = (p: IconProps) => (
  <HugeiconsIcon icon={Money02Icon} className={p.className} strokeWidth={p.strokeWidth ?? 1.9} />
)
const AssessmentIcon = (p: IconProps) => (
  <HugeiconsIcon icon={StarAward01Icon} className={p.className} strokeWidth={p.strokeWidth ?? 1.9} />
)
const OrdersIcon = (p: IconProps) => (
  <HugeiconsIcon icon={Invoice01Icon} className={p.className} strokeWidth={p.strokeWidth ?? 1.9} />
)
const ConnectionIcon = (p: IconProps) => (
  <HugeiconsIcon icon={Pulse02Icon} className={p.className} strokeWidth={p.strokeWidth ?? 1.9} />
)

type Metric = {
  label: string
  value: string
  Icon: ComponentType<IconProps>
  color: ChipColor
  badge: React.ReactNode
}

const metrics: Metric[] = [
  {
    label: 'Earnings /day',
    value: '$12,368',
    Icon: EarningsIcon,
    color: 'orange',
    badge: <Badge>20 Closed</Badge>,
  },
  {
    label: 'Assessment',
    value: '45',
    Icon: AssessmentIcon,
    color: 'amber',
    badge: (
      <Badge tone="orange">
        <Star className="h-3 w-3 fill-current" strokeWidth={0} />
        4.8
      </Badge>
    ),
  },
  {
    label: 'Orders',
    value: '138',
    Icon: OrdersIcon,
    color: 'blue',
    badge: <Badge tone="orange">40 Open</Badge>,
  },
  {
    label: 'Connection',
    value: '56',
    Icon: ConnectionIcon,
    color: 'emerald',
    badge: <Badge tone="success">20 Active</Badge>,
  },
]

const chipStyles: Record<ChipColor, string> = {
  // Restro brand orange
  orange:
    'bg-gradient-to-br from-[#ffe5cc] via-[#ffd4ad] to-[#ffb071] ring-[#f07a23]/35 text-[#b85216]',
  // Warm amber/gold for rating
  amber:
    'bg-gradient-to-br from-amber-50 via-amber-100 to-amber-200 ring-amber-400/40 text-amber-700',
  // Clay primary blue
  blue:
    'bg-gradient-to-br from-blue-50 via-blue-100 to-blue-200 ring-blue-400/40 text-blue-700',
  // Active/live emerald
  emerald:
    'bg-gradient-to-br from-emerald-50 via-emerald-100 to-emerald-200 ring-emerald-400/40 text-emerald-700',
}

export function OverviewHeader() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:gap-4 lg:gap-5">
      {metrics.map((m) => (
        <KpiCard key={m.label} metric={m} />
      ))}
    </div>
  )
}

function KpiCard({ metric }: { metric: Metric }) {
  const { label, value, Icon, color, badge } = metric
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 shadow-[0_2px_6px_-2px_rgba(15,23,42,0.06),0_4px_16px_-6px_rgba(15,23,42,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-[0_8px_16px_-6px_rgba(15,23,42,0.10),0_18px_36px_-12px_rgba(15,23,42,0.18)] md:rounded-2xl md:p-5">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-gradient-to-br from-foreground/[0.04] to-transparent"
      />

      <header className="flex items-start justify-between gap-2">
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-[10px] ring-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.75),inset_0_-1.5px_2.5px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.06)] transition-transform duration-200 group-hover:scale-105 ${chipStyles[color]}`}
        >
          <Icon className="h-4 w-4" strokeWidth={1.9} />
        </span>
        {badge}
      </header>

      <div className="mt-4">
        <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-1.5 text-[22px] font-semibold leading-none tracking-tight text-foreground md:text-[26px] lg:text-[28px]">
          {value}
        </p>
      </div>
    </div>
  )
}

function Badge({
  children,
  tone = 'gray',
}: {
  children: React.ReactNode
  tone?: 'gray' | 'orange' | 'success'
}) {
  const toneCls =
    tone === 'orange'
      ? 'bg-orange-4/55 text-orange-1'
      : tone === 'success'
        ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200/60'
        : 'bg-muted text-muted-foreground'
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${toneCls}`}
    >
      {children}
    </span>
  )
}
