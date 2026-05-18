import { Calendar, Download } from 'lucide-react'

const Y_TICKS = [1000, 900, 800, 700, 600, 500, 400, 300]
const X_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const MAIN = [430, 500, 480, 670, 850, 880, 890]
const COMP = [420, 500, 470, 580, 640, 720, 740]

const CHART_W = 360
const CHART_H = 170
const X_PAD = 8
const STEP = (CHART_W - X_PAD * 2) / (X_DAYS.length - 1)
const Y_MIN = 300
const Y_MAX = 1000

function toY(val: number) {
  return CHART_H - ((val - Y_MIN) / (Y_MAX - Y_MIN)) * CHART_H
}

function smoothPath(values: number[]) {
  const pts = values.map((v, i) => ({ x: X_PAD + i * STEP, y: toY(v) }))
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i]
    const p1 = pts[i + 1]
    const cp1x = p0.x + (p1.x - p0.x) / 2
    const cp2x = p0.x + (p1.x - p0.x) / 2
    d += ` C ${cp1x} ${p0.y}, ${cp2x} ${p1.y}, ${p1.x} ${p1.y}`
  }
  return { d, points: pts }
}

export function WeeklySummaryCard({ className = '' }: { className?: string }) {
  const main = smoothPath(MAIN)
  const comp = smoothPath(COMP)
  const mainLast = main.points[main.points.length - 1]
  const compLast = comp.points[comp.points.length - 1]

  return (
    <section
      className={`rounded-2xl border border-border bg-card p-4 text-card-foreground md:rounded-3xl md:p-6 ${className}`}
    >
      <header className="flex items-start justify-between">
        <h3 className="text-[17px] font-semibold md:text-[20px]">Weekly Summary</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-full bg-muted text-foreground/70 transition hover:text-foreground"
            aria-label="calendar"
          >
            <Calendar className="h-4 w-4" strokeWidth={1.8} />
          </button>
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-full bg-muted text-foreground/70 transition hover:text-foreground"
            aria-label="download"
          >
            <Download className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </div>
      </header>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-2 md:gap-3">
        <div className="flex items-center gap-2">
          <p className="text-[22px] font-semibold leading-none tracking-tight md:text-[26px]">
            $3,397
          </p>
          <span className="flex items-center gap-0.5 text-[12px] font-semibold text-emerald-600">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
              <path d="M5 1L9 8H1L5 1Z" />
            </svg>
            +4.2%
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground">Apr 28 - May 3</p>
      </div>

      <div className="mt-4 flex gap-2 md:mt-5">
        <div
          className="flex flex-col justify-between text-right text-[9px] text-muted-foreground md:text-[10px]"
          style={{ height: 'clamp(120px, 18vw, 170px)' }}
        >
          {Y_TICKS.map((t) => (
            <span key={t}>${t}</span>
          ))}
        </div>

        <div className="relative flex-1 min-w-0">
          <svg
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            width="100%"
            preserveAspectRatio="none"
            style={{ height: 'clamp(120px, 18vw, 170px)' }}
            aria-hidden="true"
          >
            {Y_TICKS.map((t) => {
              const y = toY(t)
              return (
                <line
                  key={t}
                  x1="0"
                  x2={CHART_W}
                  y1={y}
                  y2={y}
                  stroke="hsl(var(--border))"
                  strokeWidth="1"
                  strokeDasharray="2 3"
                />
              )
            })}

            <path
              d={comp.d}
              fill="none"
              stroke="hsl(var(--muted-foreground))"
              strokeWidth="1.6"
              strokeDasharray="4 4"
              strokeLinecap="round"
            />
            <circle cx={compLast.x} cy={compLast.y} r="3" fill="hsl(var(--foreground))" />

            <path
              d={main.d}
              fill="none"
              stroke="#eab308"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            <circle cx={mainLast.x} cy={mainLast.y} r="3.5" fill="var(--color-orange-1)" />
          </svg>

          <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
            {X_DAYS.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
