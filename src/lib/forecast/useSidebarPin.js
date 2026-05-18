// ════════════════════════════════════════════════════════════════════════════
// useSidebarPin — sidebar sabit/hover modu, localStorage'da kalıcı
// ────────────────────────────────────────────────────────────────────────────
// Kullanıcı pin tıklarsa sidebar 220px'te sabitlenir; tekrar tıklanırsa
// 60px collapse + hover-expand davranışına döner. Tercih localStorage'da
// `tyroforecast_sidebar_pinned_v1` anahtarında tutulur.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react'

const KEY = 'tyroforecast_sidebar_pinned_v1'

export function useSidebarPin() {
  const [pinned, setPinned] = useState(() => {
    try {
      return localStorage.getItem(KEY) === 'true'
    } catch (_) {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(KEY, pinned ? 'true' : 'false')
    } catch (_) { /* quota — silent */ }
  }, [pinned])

  const togglePin = useCallback(() => setPinned((v) => !v), [])

  return [pinned, togglePin]
}
