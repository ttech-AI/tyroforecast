// ════════════════════════════════════════════════════════════════════════════
// <H> — Executive Highlight (gradient text)
// ────────────────────────────────────────────────────────────────────────────
// Executive summary cümlelerinde anahtar kelimeleri gradient ile vurgulamak
// için. Premium hissini destekler — son kullanıcı (yönetici) cümle içindeki
// önemli kısmı gözle hemen ayırt eder.
// ════════════════════════════════════════════════════════════════════════════

import type { ReactNode } from 'react'

type Tone = 'default' | 'pos' | 'neg' | 'info' | 'warn' | 'accent' | 'name'

type HProps = {
  children: ReactNode
  tone?: Tone
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

export function H({ children, tone = 'info' }: HProps) {
  return (
    <span
      className="font-extrabold tracking-tight"
      style={{
        backgroundImage: GRADIENTS[tone],
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
        color: 'transparent',
      }}
    >
      {children}
    </span>
  )
}
