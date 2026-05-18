import { Calendar } from 'lucide-react'

const bars = [
  { day: 'Sun', value: 30 },
  { day: 'Mon', value: 55 },
  { day: 'Tue', value: 45 },
  { day: 'Wed', value: 80, active: true },
  { day: 'Thu', value: 35 },
  { day: 'Fri', value: 60 },
  { day: 'Sat', value: 50 },
]

export function OccupationCard({ className = '' }: { className?: string }) {
  return (
    <section
      className={`rounded-2xl border border-border bg-card p-4 text-card-foreground md:rounded-3xl md:p-6 ${className}`}
    >
      <header className="flex items-start justify-between">
        <h3 className="text-[17px] font-semibold md:text-[20px]">Occupation</h3>
        <button
          type="button"
          className="grid h-9 w-9 place-items-center rounded-full bg-muted text-foreground/70 transition hover:text-foreground"
          aria-label="calendar"
        >
          <Calendar className="h-4 w-4" strokeWidth={1.8} />
        </button>
      </header>

      <div className="mt-3">
        <p className="text-[12px] text-muted-foreground md:text-[13px]">Avarage</p>
        <p className="mt-1 text-[24px] font-semibold leading-none tracking-tight md:text-[28px]">
          45%
        </p>
      </div>

      <div className="mt-5">
        <div className="flex h-[120px] items-end gap-1.5 md:h-[150px] md:gap-2.5">
          {bars.map((b) => {
            const heightPct = Math.max(15, b.value)
            return (
              <div
                key={b.day}
                className="relative flex flex-1 items-end justify-center"
                style={{ height: '100%' }}
              >
                {b.active && (
                  <div className="absolute -top-1 left-1/2 -translate-x-1/2 rounded-md bg-primary px-1.5 py-1 text-[10px] font-semibold text-primary-foreground">
                    {b.value}%
                  </div>
                )}
                <div
                  className={`relative w-full overflow-hidden rounded-[8px] md:rounded-[10px] ${
                    b.active ? '' : 'bg-muted'
                  }`}
                  style={{
                    height: `${heightPct}%`,
                    background: b.active ? 'var(--color-orange-2)' : undefined,
                  }}
                >
                  <div className="hatch-light absolute inset-0" />
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-2 flex gap-1.5 md:gap-2.5">
          {bars.map((b) => (
            <span
              key={b.day}
              className="flex-1 text-center text-[10px] text-muted-foreground md:text-[11px]"
            >
              {b.day}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
