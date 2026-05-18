import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import {
  initMsal,
  getActiveAccount,
  loginRedirect,
  logout as msalLogout,
  MSAL_ENABLED,
} from './dataverseService.js'

const MsalCtx = createContext(null)

export function MsalProvider({ children }) {
  const [ready, setReady] = useState(false)
  const [account, setAccount] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let mounted = true
    console.log('[MSAL] Provider mounting. enabled =', MSAL_ENABLED, '| origin =', window.location.origin)
    if (!MSAL_ENABLED) {
      console.warn('[MSAL] Disabled — VITE_AZURE_CLIENT_ID / VITE_AZURE_TENANT_ID not set')
      if (mounted) setReady(true)
      return
    }
    initMsal()
      .then(() => {
        if (!mounted) return
        const acc = getActiveAccount()
        console.log('[MSAL] Init OK. activeAccount =', acc?.username || '(none)')
        setAccount(acc)
        setReady(true)
      })
      .catch((e) => {
        console.error('[MSAL] init failed', e)
        if (mounted) {
          setError(e)
          setReady(true)
        }
      })
    return () => {
      mounted = false
    }
  }, [])

  const login = useCallback(async () => {
    if (!MSAL_ENABLED) {
      throw new Error('MSAL is not configured. Check VITE_AZURE_* env vars.')
    }
    setError(null)
    console.log('[MSAL] login() → redirecting to Microsoft sign-in…')
    try {
      // Full-page redirect flow — matches the working TYRO-WMSAgent pattern.
      // Microsoft will redirect back to redirectUri with #code=… and
      // handleRedirectPromise() (called in initMsal) will pick it up.
      await loginRedirect()
      // This promise resolves only if redirect was cancelled
      return undefined
    } catch (e) {
      console.error('[MSAL] loginRedirect FAILED:', e)
      const code = e?.errorCode || e?.name || 'unknown'
      const msg = e?.errorMessage || e?.message || String(e)
      const wrapped = new Error(`[${code}] ${msg}`)
      setError(wrapped)
      throw wrapped
    }
  }, [])

  const logout = useCallback(async () => {
    if (!account) return
    try {
      await msalLogout(account)
    } finally {
      setAccount(null)
    }
  }, [account])

  return (
    <MsalCtx.Provider value={{ ready, account, login, logout, error, enabled: MSAL_ENABLED }}>
      {children}
    </MsalCtx.Provider>
  )
}

export function useMsal() {
  const ctx = useContext(MsalCtx)
  if (!ctx) {
    throw new Error('useMsal must be used inside <MsalProvider>')
  }
  return ctx
}
