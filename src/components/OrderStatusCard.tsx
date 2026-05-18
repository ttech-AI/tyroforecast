import { ArrowUpRight } from 'lucide-react'

const segments = [
  { label: 'Earnings', value: '$48,620', color: 'var(--color-orange-1)', flex: 50 },
  { label: 'Preparing', value: '$6,820', color: 'var(--color-orange-2)', flex: 30 },
  { label: 'Served', value: '$6,820', color: 'var(--color-orange-3)', flex: 20 },
]

export function OrderStatusCard({ className = '' }: { className?: string }) {
  return (
    <section
      className={`rounded-2xl border border-border bg-card p-4 text-card-foreground md:rounded-3xl md:p-6 ${className}`}
    >
      <h3 className="text-[17px] font-semibold md:text-[20px]">Order Status</h3>

      <div className="mt-4 flex items-center gap-3 md:mt-5">
        <div className="flex flex-1 items-center justify-between rounded-full bg-muted px-4 py-2.5">
          <span className="text-[13px] text-foreground/80">New Orders:</span>
          <span className="text-[15px] font-semibold">120</span>
        </div>
        <button
          type="button"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted text-foreground/70 transition hover:text-foreground"
          aria-label="open"
        >
          <ArrowUpRight className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>

      <div className="mt-4 flex h-[72px] gap-1.5 md:mt-5 md:h-[88px]">
        {segments.map((s, i) => (
          <div
            key={s.label}
            className={`relative overflow-hidden ${
              i === 0
                ? 'rounded-l-[14px] rounded-r-md md:rounded-l-[16px]'
                : i === segments.length - 1
                  ? 'rounded-l-md rounded-r-[14px] md:rounded-r-[16px]'
                  : 'rounded-md'
            }`}
            style={{ flex: s.flex, background: s.color }}
          >
            <div className="hatch-light absolute inset-0" />
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 md:mt-5">
        {segments.map((s) => (
          <div key={s.label} className="flex min-w-0 flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: s.color }}
              />
              <span className="truncate text-[11px] text-foreground/70 md:text-[12px]">
                {s.label}
              </span>
            </div>
            <span className="pl-4 text-[13px] font-semibold md:text-[15px]">{s.value}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
