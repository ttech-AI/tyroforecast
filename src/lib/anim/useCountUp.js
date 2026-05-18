// ════════════════════════════════════════════════════════════════════════════
// useCountUp — sayı animasyon hook'u
// ────────────────────────────────────────────────────────────────────────────
// İlk mount'ta veya değer değiştikçe hedef değere doğru animate eder.
// requestAnimationFrame ile, dependency-free.
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from 'react'

// ease-out cubic: hızlı başlar, yumuşak biter
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3)
}

/**
 * @param {number} target — animate edilecek hedef sayı
 * @param {object} opts
 *   - duration: ms (default 600)
 *   - start: başlangıç değeri (default 0)
 * @returns {number} mevcut animasyonun ara değeri
 */
export function useCountUp(target, opts = {}) {
  const { duration = 600, start = 0 } = opts
  const safeTarget = Number.isFinite(Number(target)) ? Number(target) : 0
  const [value, setValue] = useState(start)
  const rafRef = useRef(null)
  const startTsRef = useRef(null)
  const fromRef = useRef(start)

  useEffect(() => {
    // Animasyona mevcut değerden başla (önceki ara değer)
    fromRef.current = value
    startTsRef.current = null

    const tick = (ts) => {
      if (startTsRef.current == null) startTsRef.current = ts
      const elapsed = ts - startTsRef.current
      const progress = Math.min(1, elapsed / duration)
      const eased = easeOutCubic(progress)
      const next = fromRef.current + (safeTarget - fromRef.current) * eased
      setValue(next)
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        setValue(safeTarget)
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeTarget, duration])

  return value
}
