// ════════════════════════════════════════════════════════════════════════════
// <H> — Executive Highlight (gradient text + optional rich tooltip)
// ────────────────────────────────────────────────────────────────────────────
// Executive summary cümlelerinde anahtar kelimeleri gradient ile vurgulamak
// için. tooltip prop verilirse hover'da dark navy popover açar (portal).
// ════════════════════════════════════════════════════════════════════════════

import { useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type Tone = 'default' | 'pos' | 'neg' | 'info' | 'warn' | 'accent' | 'name'

type HProps = {
  children: ReactNode
  tone?: Tone
  tooltip?: ReactNode
}

const GRADIENTS: Record<Tone, string> = {
  default: 'linear-gradient(135deg, #ffffff, #e2e8f0)',
  pos:     'linear-gradient(135deg, #6ee7b7, #10b981)',
  neg:     'linear-gradient(135deg, #fb7185, #f43f5e)',
  info:    'linear-gradient(135deg, #93c5fd, #3b82f6)',
  warn:    'linear-gradient(135deg, #fcd34d, #f59e0b)',
  accent:  'linear-gradient(135deg, #fbbf24, #f07a23)',
  name:    'linear-gradient(135deg, #ffd29a, #f07a23)',
}

export function H({ children, tone = 'info', tooltip }: HProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const [tipPos, setTipPos] = useState<{ x: number; y: number; placement: 'top' | 'bottom' } | null>(null)

  const baseStyle = {
    backgroundImage: GRADIENTS[tone],
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    color: 'transparent',
  } as const

  if (!tooltip) {
    return (
      <span className="font-extrabold tracking-tight" style={baseStyle}>
        {children}
      </span>
    )
  }

  const handleEnter = () => {
    if (!ref.current) return
    const r = ref.current.getBoundingClientRect()
    const tipW = 280
    const margin = 8
    const fitsTop = r.top > 180
    setTipPos({
      x: Math.min(window.innerWidth - tipW - margin, Math.max(margin, r.left + r.width / 2 - tipW / 2)),
      y: fitsTop ? r.top - 10 : r.bottom + 10,
      placement: fitsTop ? 'top' : 'bottom',
    })
  }
  const handleLeave = () => setTipPos(null)

  return (
    <>
      <span
        ref={ref}
        className="cursor-help font-extrabold tracking-tight underline decoration-dotted decoration-1 underline-offset-[3px]"
        style={baseStyle}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        {children}
      </span>
      {tipPos && typeof document !== 'undefined' && createPortal(
        <div
          role="tooltip"
          className="pointer-events-none"
          style={{
            position: 'fixed',
            left: tipPos.x,
            top: tipPos.y,
            width: 280,
            zIndex: 9999,
            transform: tipPos.placement === 'top' ? 'translateY(-100%)' : 'none',
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
          {tooltip}
        </div>,
        document.body,
      )}
    </>
  )
}
