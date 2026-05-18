import type { ReactNode } from 'react'

export type MsalAccount = {
  username?: string
  name?: string
  homeAccountId?: string
  localAccountId?: string
  tenantId?: string
  // MSAL AccountInfo has more fields; keep an escape hatch
  [key: string]: unknown
}

export type MsalContextValue = {
  ready: boolean
  account: MsalAccount | null
  error: Error | null
  enabled: boolean
  login: () => Promise<MsalAccount | undefined>
  logout: () => Promise<void>
}

export function MsalProvider(props: { children: ReactNode }): JSX.Element
export function useMsal(): MsalContextValue
