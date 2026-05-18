// ════════════════════════════════════════════════════════════════════════════
// SettingsPage — Uygulama künyesi + localStorage yönetimi + tercihler + hesap
// ────────────────────────────────────────────────────────────────────────────
// 4 bölüm:
//   1. Uygulama Künyesi — sürüm, ortam, URL, hesap, tarayıcı, locale
//   2. Yerel Depolama   — localStorage entry'leri tablo + boyut + sil/temizle
//   3. Tercihler        — default forecast horizon/metric, reset
//   4. Hesap            — MSAL kullanıcı bilgisi + logout
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  InformationCircleIcon,
  Database01Icon,
  Settings02Icon,
  UserAccountIcon,
  Delete01Icon,
  RotateClockwiseIcon,
  LogoutSquare01Icon,
  CheckmarkBadge02Icon,
} from '@hugeicons/core-free-icons'
import { useMsal } from '../lib/forecast/msalContext.jsx'
import { getFcstCacheStats, clearFcstCache } from '../lib/forecast/fcstCache.js'

const APP_VERSION = '1.0.0'

// Bilinen key prefix'leri için human-friendly metadata
type KeyMeta = {
  category: 'forecast' | 'snapshot' | 'filter' | 'directory' | 'other'
  label: string
  description: string
}

function classifyKey(key: string): KeyMeta {
  if (key.startsWith('tyroforecast_fcst_v')) {
    const sig = key.split('_').slice(4).join('_') || '?'
    return {
      category: 'forecast',
      label: 'Tahmin sonuç cache',
      description: sig.length > 50 ? `${sig.slice(0, 50)}…` : sig,
    }
  }
  if (key.startsWith('tyroforecast_home_snapshot')) {
    return { category: 'snapshot', label: 'Anasayfa snapshot', description: 'Son hesaplama özeti' }
  }
  if (key.startsWith('tyroforecast_filter_state')) {
    return { category: 'filter', label: 'Filtre tercihi', description: 'Son seçilen Trader / Horizon / Metrik' }
  }
  if (key.startsWith('tyroforecast_traders')) {
    return { category: 'directory', label: 'Trader dizini', description: 'Trader katalog cache' }
  }
  if (key.startsWith('msal.') || key.includes('msal')) {
    return { category: 'other', label: 'MSAL oturum', description: 'Microsoft kimlik doğrulama' }
  }
  return { category: 'other', label: key.slice(0, 40), description: 'Tanımlanmamış girdi' }
}

const CATEGORY_TONE: Record<KeyMeta['category'], { color: string; bg: string }> = {
  forecast:  { color: '#0a3d8f', bg: 'rgba(10,61,143,0.08)' },
  snapshot:  { color: '#f07a23', bg: 'rgba(240,122,35,0.10)' },
  filter:    { color: '#8b5cf6', bg: 'rgba(139,92,246,0.10)' },
  directory: { color: '#10b981', bg: 'rgba(16,185,129,0.10)' },
  other:     { color: '#64748b', bg: 'rgba(100,116,139,0.10)' },
}

type Entry = {
  key: string
  bytes: number
  meta: KeyMeta
}

function listAllEntries(): Entry[] {
  const out: Entry[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key) continue
      const val = localStorage.getItem(key) || ''
      // UTF-16 yaklaşık 2 byte/char
      const bytes = (key.length + val.length) * 2
      out.push({ key, bytes, meta: classifyKey(key) })
    }
  } catch (_) { /* SSR or disabled */ }
  out.sort((a, b) => b.bytes - a.bytes)
  return out
}

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(2)} MB`
}

// ────────────────────────────────────────────────────────────────────────────
// Top-level component
// ────────────────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const [refreshTick, setRefreshTick] = useState(0)
  const refresh = useCallback(() => setRefreshTick((n) => n + 1), [])

  return (
    <div className="space-y-4 md:space-y-5">
      <AppInfoCard />
      <LocalStorageCard refreshTick={refreshTick} onRefresh={refresh} />
      <PreferencesCard onRefresh={refresh} />
      <AccountCard />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// 1. Uygulama Künyesi
// ────────────────────────────────────────────────────────────────────────────

function AppInfoCard() {
  const { account } = useMsal()

  const info = useMemo(() => {
    const ua = navigator.userAgent
    // Tarayıcı + OS hafif parse
    let browser = 'Bilinmiyor'
    if (/Edg\//.test(ua)) browser = 'Edge'
    else if (/Chrome\//.test(ua)) browser = 'Chrome'
    else if (/Firefox\//.test(ua)) browser = 'Firefox'
    else if (/Safari\//.test(ua)) browser = 'Safari'
    const verMatch = ua.match(/(?:Edg|Chrome|Firefox|Safari)\/(\d+)/)
    if (verMatch) browser += ' ' + verMatch[1]
    let os = 'Bilinmiyor'
    if (/Windows/.test(ua)) os = 'Windows'
    else if (/Mac OS/.test(ua)) os = 'macOS'
    else if (/Linux/.test(ua)) os = 'Linux'
    else if (/Android/.test(ua)) os = 'Android'
    else if (/iPhone|iPad/.test(ua)) os = 'iOS'

    return {
      browser,
      os,
      url: window.location.origin + window.location.pathname,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '—',
      locale: navigator.language || '—',
    }
  }, [])

  const rows: Array<[string, string]> = [
    ['Uygulama', 'TYRO Forecast'],
    ['Sürüm', `v${APP_VERSION}`],
    ['Yapım ortamı', import.meta.env.PROD ? 'production' : 'development'],
    ['Yayın URL', info.url],
    ['Tarayıcı', `${info.browser} · ${info.os}`],
    ['Saat dilimi', info.timezone],
    ['Bölge', info.locale],
    ['Oturum', account?.username || '—'],
    ['Tenant ID', account?.tenantId || '—'],
  ]

  return (
    <SectionCard
      icon={InformationCircleIcon}
      accent="#0a3d8f"
      title="Uygulama Künyesi"
      subtitle="Sürüm, ortam ve oturum bilgileri"
    >
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 px-4 py-4 md:grid-cols-2 md:px-5 md:py-5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3 border-b border-border/40 pb-2 last:border-0 md:pb-2.5">
            <dt className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">{label}</dt>
            <dd
              className="min-w-0 truncate text-right text-[12.5px] font-semibold text-foreground tabular-nums"
              title={value}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </SectionCard>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// 2. Yerel Depolama
// ────────────────────────────────────────────────────────────────────────────

function LocalStorageCard({ refreshTick, onRefresh }: { refreshTick: number; onRefresh: () => void }) {
  const entries = useMemo(() => listAllEntries(), [refreshTick])
  const totalBytes = entries.reduce((s, e) => s + e.bytes, 0)
  const fcstStats = getFcstCacheStats()

  // Browser typical quota: 5 MB local. Gerçek quota tarayıcı/cihaza göre değişir.
  const QUOTA_BYTES = 5 * 1024 * 1024
  const usagePct = Math.min(100, (totalBytes / QUOTA_BYTES) * 100)

  const handleDelete = (key: string) => {
    if (!confirm(`"${key}" girdisini silmek istediğinizden emin misiniz?`)) return
    try { localStorage.removeItem(key) } catch (_) {}
    onRefresh()
  }

  const handleClearForecastCache = () => {
    if (!confirm(`${fcstStats.count} adet tahmin cache'i silinecek. Devam edilsin mi?`)) return
    clearFcstCache()
    onRefresh()
  }

  const handleClearAllApp = () => {
    if (!confirm('Tüm TYRO Forecast yerel verisi silinecek (cache + snapshot + tercihler). MSAL oturumunuz korunur. Devam edilsin mi?')) return
    try {
      const toRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith('tyroforecast_')) toRemove.push(k)
      }
      for (const k of toRemove) localStorage.removeItem(k)
      window.dispatchEvent(new CustomEvent('tyroforecast:snapshot-changed'))
    } catch (_) {}
    onRefresh()
  }

  return (
    <SectionCard
      icon={Database01Icon}
      accent="#f07a23"
      title="Yerel Depolama"
      subtitle="Tarayıcıda saklanan veri (localStorage)"
      headerRight={
        <button
          type="button"
          onClick={onRefresh}
          title="Yenile"
          className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          <HugeiconsIcon icon={RotateClockwiseIcon} size={14} strokeWidth={2} />
        </button>
      }
    >
      {/* Toplam kullanım */}
      <div className="border-b border-border/60 px-4 py-4 md:px-5">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <div className="text-[10.5px] font-extrabold uppercase tracking-wider text-muted-foreground">
              Toplam Kullanım
            </div>
            <div className="mt-0.5 text-[15px] font-extrabold tabular-nums text-foreground">
              {fmtBytes(totalBytes)} <span className="text-[11px] font-semibold text-muted-foreground">/ ~5 MB tarayıcı sınırı</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10.5px] font-extrabold uppercase tracking-wider text-muted-foreground">Girdi</div>
            <div className="mt-0.5 text-[15px] font-extrabold tabular-nums text-foreground">
              {entries.length}
            </div>
          </div>
        </div>
        {/* Progress bar */}
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted/50">
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{
              width: `${usagePct}%`,
              background: usagePct > 75
                ? 'linear-gradient(90deg, #f59e0b, #ef4444)'
                : usagePct > 40
                  ? 'linear-gradient(90deg, #fbbf24, #f07a23)'
                  : 'linear-gradient(90deg, #3b82f6, #0a3d8f)',
            }}
          />
        </div>
      </div>

      {/* Entry tablosu */}
      {entries.length === 0 ? (
        <div className="px-4 py-8 text-center text-[12px] italic text-muted-foreground">
          Yerel depolama boş.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="border-b border-border/60 bg-muted/30">
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 md:px-5">Kategori</th>
                <th className="px-3 py-2">Açıklama / Anahtar</th>
                <th className="px-3 py-2 text-right">Boyut</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {entries.map((e) => {
                const tone = CATEGORY_TONE[e.meta.category]
                return (
                  <tr key={e.key} className="hover:bg-muted/30">
                    <td className="px-4 py-2 md:px-5">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider"
                        style={{ background: tone.bg, color: tone.color }}
                      >
                        {e.meta.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[11.5px]">
                      <div className="flex flex-col leading-tight">
                        <span className="font-semibold text-foreground">{e.meta.description}</span>
                        <span className="mt-0.5 truncate text-[10.5px] text-muted-foreground" title={e.key}>
                          {e.key}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-foreground">
                      {fmtBytes(e.bytes)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(e.key)}
                        title="Bu girdiyi sil"
                        className="grid h-7 w-7 place-items-center rounded text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-600"
                        disabled={e.meta.category === 'other' && e.key.includes('msal')}
                      >
                        <HugeiconsIcon icon={Delete01Icon} size={13} strokeWidth={2} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer: temizleme aksiyonları */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-4 py-3 md:px-5"
        style={{ background: 'linear-gradient(180deg, rgba(248,250,252,0.5), rgba(241,245,249,0.3))' }}
      >
        <div className="text-[10.5px] leading-relaxed text-muted-foreground">
          <strong className="text-foreground">İpucu:</strong> Yerel depolama temizlendiğinde aktif tahmin sonuçları
          ve Anasayfa snapshot'ı silinir. Bir sonraki Hesapla'da yeniden yazılır.
        </div>
        <div className="flex shrink-0 gap-2">
          {fcstStats.count > 0 && (
            <button
              type="button"
              onClick={handleClearForecastCache}
              className="inline-flex items-center gap-1.5 rounded-md border border-orange-300/60 bg-card px-3 py-1.5 text-[11.5px] font-semibold text-orange-700 transition-colors hover:bg-orange-50"
            >
              <HugeiconsIcon icon={Delete01Icon} size={11} strokeWidth={2.2} />
              Tahmin Cache ({fcstStats.count})
            </button>
          )}
          <button
            type="button"
            onClick={handleClearAllApp}
            className="inline-flex items-center gap-1.5 rounded-md border border-rose-300/60 bg-card px-3 py-1.5 text-[11.5px] font-semibold text-rose-700 transition-colors hover:bg-rose-50"
          >
            <HugeiconsIcon icon={Delete01Icon} size={11} strokeWidth={2.2} />
            Tümünü Temizle
          </button>
        </div>
      </div>
    </SectionCard>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// 3. Tercihler
// ────────────────────────────────────────────────────────────────────────────

const PREF_KEY = 'tyroforecast_filter_state_v1'

function PreferencesCard({ onRefresh }: { onRefresh: () => void }) {
  const [horizon, setHorizon] = useState(12)
  const [metric, setMetric] = useState<'qty' | 'value'>('qty')

  // localStorage'tan oku
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREF_KEY)
      if (raw) {
        const p = JSON.parse(raw)
        if ([3, 6, 12].includes(p?.fcstHorizon)) setHorizon(p.fcstHorizon)
        if (p?.fcstMetric === 'value' || p?.fcstMetric === 'qty') setMetric(p.fcstMetric)
      }
    } catch (_) {}
  }, [])

  const savePref = (h: number, m: 'qty' | 'value') => {
    try {
      const raw = localStorage.getItem(PREF_KEY)
      const existing = raw ? JSON.parse(raw) : {}
      const next = { ...existing, fcstHorizon: h, fcstMetric: m, savedAt: Date.now() }
      localStorage.setItem(PREF_KEY, JSON.stringify(next))
    } catch (_) {}
    onRefresh()
  }

  const reset = () => {
    if (!confirm('Tüm tercihler varsayılana sıfırlanacak. Devam edilsin mi?')) return
    setHorizon(12)
    setMetric('qty')
    try { localStorage.removeItem(PREF_KEY) } catch (_) {}
    onRefresh()
  }

  return (
    <SectionCard
      icon={Settings02Icon}
      accent="#8b5cf6"
      title="Genel Tercihler"
      subtitle="Satış Tahmini varsayılan değerleri"
      headerRight={
        <button
          type="button"
          onClick={reset}
          title="Tercihleri sıfırla"
          className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card px-2.5 py-1 text-[10.5px] font-semibold text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
        >
          <HugeiconsIcon icon={RotateClockwiseIcon} size={11} strokeWidth={2} />
          Sıfırla
        </button>
      }
    >
      <div className="space-y-4 px-4 py-4 md:px-5 md:py-5">
        <PrefRow
          label="Varsayılan Tahmin Ufku"
          help="Satış Tahmini sayfası bu değerle açılır"
        >
          <SegmentBar
            value={horizon}
            options={[{ v: 3, l: '3 ay' }, { v: 6, l: '6 ay' }, { v: 12, l: '12 ay' }]}
            onChange={(v) => { setHorizon(v); savePref(v, metric) }}
          />
        </PrefRow>
        <PrefRow label="Varsayılan Metrik" help="Miktar (kg) veya parasal Tutar (₺/$)">
          <SegmentBar
            value={metric}
            options={[{ v: 'qty', l: 'Miktar' }, { v: 'value', l: 'Tutar' }]}
            onChange={(v) => { setMetric(v as 'qty' | 'value'); savePref(horizon, v as 'qty' | 'value') }}
          />
        </PrefRow>
      </div>
    </SectionCard>
  )
}

function PrefRow({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-bold text-foreground">{label}</div>
        {help && <div className="mt-0.5 text-[10.5px] font-medium text-muted-foreground">{help}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SegmentBar({ value, options, onChange }: { value: any; options: Array<{ v: any; l: string }>; onChange: (v: any) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5">
      {options.map((o) => {
        const active = o.v === value
        return (
          <button
            key={String(o.v)}
            type="button"
            onClick={() => onChange(o.v)}
            className={`rounded-md px-3 py-1.5 text-[11.5px] font-semibold transition ${
              active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {o.l}
          </button>
        )
      })}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// 4. Hesap
// ────────────────────────────────────────────────────────────────────────────

function AccountCard() {
  const { account, logout } = useMsal()
  const [busy, setBusy] = useState(false)

  if (!account) return null

  const initials = (account.name || account.username || '?')
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toLocaleUpperCase('tr-TR')

  const handleLogout = async () => {
    if (!confirm('Oturumdan çıkmak istediğinize emin misiniz?')) return
    setBusy(true)
    try { await logout() } finally { setBusy(false) }
  }

  return (
    <SectionCard
      icon={UserAccountIcon}
      accent="#10b981"
      title="Hesap"
      subtitle="Giriş yapılmış kullanıcı"
    >
      <div className="flex flex-wrap items-center gap-4 px-4 py-4 md:px-5 md:py-5">
        <div
          className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-[14px] font-extrabold text-white"
          style={{
            background: 'linear-gradient(135deg, #0a3d8f 0%, #3b82f6 55%, #f07a23 100%)',
            boxShadow: '0 4px 14px rgba(10,61,143,.25)',
          }}
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-bold text-foreground">
            {account.name || account.username}
          </div>
          <div className="mt-0.5 truncate text-[11.5px] font-medium text-muted-foreground">
            {account.username}
          </div>
          <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider text-emerald-700">
            <HugeiconsIcon icon={CheckmarkBadge02Icon} size={9} strokeWidth={2.4} />
            Aktif oturum
          </div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          disabled={busy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-rose-300/60 bg-card px-3.5 py-2 text-[12px] font-semibold text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-50"
        >
          <HugeiconsIcon icon={LogoutSquare01Icon} size={13} strokeWidth={2} />
          {busy ? 'Çıkış…' : 'Çıkış yap'}
        </button>
      </div>
    </SectionCard>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Shared section card
// ────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SectionCard({ icon, accent, title, subtitle, headerRight, children }: {
  icon: any
  accent: string
  title: string
  subtitle?: string
  headerRight?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.10)]">
      <header className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3 md:px-5">
        <div className="flex items-center gap-2.5">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border-[1.5px] bg-card"
            style={{
              borderColor: `${accent}38`,
              boxShadow: `0 1px 2px rgba(15,23,42,0.04), inset 0 1px 0 rgba(255,255,255,0.5)`,
            }}
          >
            <HugeiconsIcon icon={icon} size={16} strokeWidth={1.9} color={accent} />
          </span>
          <div>
            <h3 className="text-[13px] font-bold leading-tight text-foreground">{title}</h3>
            {subtitle && <p className="mt-0.5 text-[10.5px] font-medium text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        {headerRight}
      </header>
      {children}
    </section>
  )
}
