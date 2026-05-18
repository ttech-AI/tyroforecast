import { ArrowUpRight } from 'lucide-react'

type Cell = { x: number; y: number; color: string }

function buildHoneycomb(): Cell[] {
  const COLORS = ['#7a2e0a', '#a8431a', '#d36322', '#f07a23', '#ffa66b', '#ffc79a', '#ffd9b8']
  const cells: Cell[] = []
  const SIZE = 13
  const W = Math.sqrt(3) * SIZE
  const H = SIZE * 1.5
  const RADIUS = 3
  const occupied: Array<[number, number]> = []
  for (let q = -RADIUS; q <= RADIUS; q++) {
    for (let r = -RADIUS; r <= RADIUS; r++) {
      const s = -q - r
      if (Math.abs(s) <= RADIUS) occupied.push([q, r])
    }
  }
  occupied.push([-4, 0], [4, 0], [0, -4], [0, 4])
  occupied.forEach(([q, r]) => {
    const x = W * (q + r / 2)
    const y = H * r
    const dist = Math.sqrt(q * q + r * r + q * r)
    const norm = Math.min(1, dist / RADIUS)
    const idx = Math.min(COLORS.length - 1, Math.floor(norm * COLORS.length))
    cells.push({ x, y, color: COLORS[idx] })
  })
  return cells
}

const HEX_POINTS = (() => {
  const r = 13
  const points: string[] = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i + Math.PI / 6
    points.push(`${r * Math.cos(angle)},${r * Math.sin(angle)}`)
  }
  return points.join(' ')
})()

const legend = [
  { city: 'Madrid', value: '6,100', color: '#8a4118' },
  { city: 'Barcelona', value: '1,600', color: '#f07a23' },
  { city: 'Seville', value: '400', color: '#e6c97a' },
]

export function CustomersCard({ className = '' }: { className?: string }) {
  const cells = buildHoneycomb()

  return (
    <section
      className={`rounded-2xl border border-border bg-card p-4 text-card-foreground md:rounded-3xl md:p-6 ${className}`}
    >
      <header className="flex items-center justify-between">
        <h3 className="text-[17px] font-semibold md:text-[20px]">Customers</h3>
        <button
          type="button"
          className="grid h-9 w-9 place-items-center rounded-full bg-muted text-foreground/70 transition hover:text-foreground"
          aria-label="open"
        >
          <ArrowUpRight className="h-4 w-4" strokeWidth={2} />
        </button>
      </header>

      <div className="mt-3 grid place-items-center md:mt-4">
        <svg
          viewBox="-90 -75 180 150"
          className="h-auto w-full max-w-[200px]"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          {cells.map((c, i) => (
            <polygon
              key={i}
              points={HEX_POINTS}
              fill={c.color}
              transform={`translate(${c.x}, ${c.y})`}
            />
          ))}
        </svg>
      </div>

      <ul className="mt-4 flex flex-col gap-2 md:gap-2.5">
        {legend.map((l) => (
          <li key={l.city} className="flex items-center justify-between">
            <span className="flex items-center gap-2.5">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: l.color }}
              />
              <span className="text-[12px] text-foreground/80 md:text-[13px]">
                {l.city}
              </span>
            </span>
            <span className="text-[12px] font-semibold md:text-[13px]">{l.value}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
