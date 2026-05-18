import { ChevronDown, ArrowDownLeft, FileText } from 'lucide-react'

const X_LABELS = ['Jan 10', 'Jan 11', 'Jan 12', 'Jan 13', 'Jan 14', 'Jan 15', 'Jan 16']

const POINTS = [
  { x: 60, y: 110 },
  { x: 175, y: 80 },
  { x: 290, y: 120 },
  { x: 405, y: 90 },
  { x: 520, y: 140 },
  { x: 635, y: 105 },
  { x: 750, y: 95 },
]

function buildAreaPath() {
  const baseline = 200
  let d = `M ${POINTS[0].x} ${baseline} L ${POINTS[0].x} ${POINTS[0].y}`
  for (let i = 0; i < POINTS.length - 1; i++) {
    const p0 = POINTS[i]
    const p1 = POINTS[i + 1]
    const cp1x = p0.x + (p1.x - p0.x) / 2
    const cp1y = p0.y
    const cp2x = p0.x + (p1.x - p0.x) / 2
    const cp2y = p1.y
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p1.x} ${p1.y}`
  }
  d += ` L ${POINTS[POINTS.length - 1].x} ${baseline} Z`
  return d
}

function buildLinePath() {
  let d = `M ${POINTS[0].x} ${POINTS[0].y}`
  for (let i = 0; i < POINTS.length - 1; i++) {
    const p0 = POINTS[i]
    const p1 = POINTS[i + 1]
    const cp1x = p0.x + (p1.x - p0.x) / 2
    const cp1y = p0.y
    const cp2x = p0.x + (p1.x - p0.x) / 2
    const cp2y = p1.y
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p1.x} ${p1.y}`
  }
  return d
}

export function ReportsCard({ className = '' }: { className?: string }) {
  return (
    <section
      className={`rounded-2xl border border-border bg-card p-4 text-card-foreground md:rounded-3xl md:p-6 ${className}`}
    >
      <header className="flex items-center justify-between">
        <h3 className="text-[17px] font-semibold md:text-[20px]">Reports</h3>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-foreground/80"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 4h7M3 8h7M3 12h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="12.5" cy="4" r="1.2" fill="currentColor" />
            <circle cx="12.5" cy="12" r="1.2" fill="currentColor" />
          </svg>
          Weekly
          <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </header>

      <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-3 md:mt-5 md:gap-x-12">
        <div>
          <p className="text-xs text-muted-foreground">Earnings</p>
          <p className="mt-1 text-[22px] font-semibold leading-none tracking-tight md:text-[26px]">
            $48,620
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Bills</p>
          <p className="mt-1 text-[22px] font-semibold leading-none tracking-tight md:text-[26px]">
            $6,820
          </p>
        </div>
      </div>

      <div className="relative mt-5 md:mt-6">
        <svg
          viewBox="0 0 800 230"
          preserveAspectRatio="none"
          className="block w-full"
          style={{ height: 'clamp(140px, 22vw, 200px)' }}
          aria-hidden="true"
        >
          <defs>
            <pattern
              id="hatchTheme"
              patternUnits="userSpaceOnUse"
              width="7"
              height="7"
              patternTransform="rotate(45)"
            >
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="7"
                stroke="hsl(var(--muted-foreground))"
                strokeOpacity="0.4"
                strokeWidth="2"
              />
            </pattern>
          </defs>

          <path d={buildAreaPath()} fill="url(#hatchTheme)" />
          <path
            d={buildLinePath()}
            fill="none"
            stroke="hsl(var(--muted-foreground))"
            strokeWidth="1.5"
          />
          {POINTS.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="hsl(var(--foreground))" />
          ))}
        </svg>

        <div
          className="absolute z-10 flex flex-col gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-card-foreground shadow-[0_8px_24px_-12px_rgba(0,0,0,0.18)] md:px-3.5 md:py-2.5"
          style={{ left: '42%', top: 4 }}
        >
          <p className="text-[11px] font-medium text-foreground/70">Jan 12, 2026</p>
          <p className="flex items-center justify-between gap-4 text-[11px] text-foreground/80 md:gap-6">
            <span className="flex items-center gap-1.5">
              <ArrowDownLeft className="h-3 w-3" strokeWidth={2} />
              Earnings:
            </span>
            <span className="font-semibold text-foreground">$6,820</span>
          </p>
          <p className="flex items-center justify-between gap-4 text-[11px] text-foreground/80 md:gap-6">
            <span className="flex items-center gap-1.5">
              <FileText className="h-3 w-3" strokeWidth={2} />
              Biils:
            </span>
            <span className="font-semibold text-foreground">$48,620</span>
          </p>
        </div>

        <div className="mt-3 flex justify-between px-1 text-[10px] text-muted-foreground md:text-[11px]">
          {X_LABELS.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
      </div>
    </section>
  )
}
