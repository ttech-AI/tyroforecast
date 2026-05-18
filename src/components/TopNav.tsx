import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Search,
  Clock,
  LogOut,
  UserRound,
  Database,
  Settings as SettingsIcon,
  X,
} from 'lucide-react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Home01Icon,
  AiBrain04Icon,
} from '@hugeicons/core-free-icons'
import { useMsal } from '../lib/forecast/msalContext.jsx'

// ─── Page meta (başlık + gradient subtitle + ikon + accent rengi) ───────────
// renderIcon: başlığın solundaki stroke-bordered ikon kutusu için
const PAGE_META: Record<string, {
  title: string
  subtitle: string
  accent: string
  renderIcon: () => ReactNode
}> = {
  home: {
    title: 'Ana Sayfa',
    subtitle: 'Yönetici Özeti · Tahmin Sonuçları',
    accent: '#0a3d8f',
    renderIcon: () => <HugeiconsIcon icon={Home01Icon} size={18} strokeWidth={1.9} color="#0a3d8f" />,
  },
  forecast: {
    title: 'Satış Tahmini',
    subtitle: 'AI destekli zaman serisi modelleri',
    accent: '#f07a23',
    renderIcon: () => <HugeiconsIcon icon={AiBrain04Icon} size={18} strokeWidth={1.9} color="#f07a23" />,
  },
  data: {
    title: 'Veri Yönetimi',
    subtitle: 'Trader ve ürün katalogları',
    accent: '#10b981',
    renderIcon: () => <Database size={18} strokeWidth={1.8} className="text-emerald-600" />,
  },
  settings: {
    title: 'Ayarlar',
    subtitle: 'Sistem ve hesap tercihleri',
    accent: '#8b5cf6',
    renderIcon: () => <SettingsIcon size={18} strokeWidth={1.8} className="text-violet-600" />,
  },
}

// İkonlar Sidebar ile birebir eşitlendi — kullanıcı arama sonuçlarında aynı
// görsel dili görüyor (Home01Icon ve AiBrain04Icon HugeIcons; data/settings
// lucide ile devam — Sidebar da bu kombinasyonu kullanıyor).
const NAV_OPTIONS: Array<{
  key: string
  label: string
  renderIcon: () => ReactNode
}> = [
  {
    key: 'home',
    label: 'Ana Sayfa',
    renderIcon: () => <HugeiconsIcon icon={Home01Icon} className="h-4 w-4 text-foreground/70" strokeWidth={1.8} />,
  },
  {
    key: 'forecast',
    label: 'Satış Tahmini',
    renderIcon: () => <HugeiconsIcon icon={AiBrain04Icon} className="h-4 w-4 text-foreground/70" strokeWidth={1.8} />,
  },
  {
    key: 'data',
    label: 'Veri Yönetimi',
    renderIcon: () => <Database className="h-4 w-4 text-foreground/70" strokeWidth={1.8} />,
  },
  {
    key: 'settings',
    label: 'Ayarlar',
    renderIcon: () => <SettingsIcon className="h-4 w-4 text-foreground/70" strokeWidth={1.8} />,
  },
]

type TopNavProps = {
  activePage: string
  onNavigate: (key: string) => void
}

export function TopNav({ activePage, onNavigate }: TopNavProps) {
  const meta = PAGE_META[activePage]
  return (
    <header className="flex items-center gap-3 sm:gap-4 lg:gap-6">
      <div className="flex shrink-0 items-center gap-3">
        {/* Stroke-bordered icon kutusu — sayfa ikonu, accent renkli yumuşak çerçeve */}
        {meta && (
          <span
            className="grid h-10 w-10 place-items-center rounded-xl border-[1.5px] bg-card transition-all"
            style={{
              borderColor: `${meta.accent}38`,
              boxShadow: `0 1px 2px rgba(15,23,42,0.04), 0 4px 12px -6px ${meta.accent}22, inset 0 1px 0 rgba(255,255,255,0.5)`,
            }}
          >
            {meta.renderIcon()}
          </span>
        )}
        <div className="flex flex-col gap-1">
          <h1 className="text-[17px] font-semibold leading-none tracking-tight text-foreground md:text-[19px]">
            {meta?.title || 'Overview'}
          </h1>
          {meta?.subtitle && (
            <p
              className="text-[10.5px] font-semibold leading-none tracking-wide"
              style={{
                backgroundImage: 'linear-gradient(90deg, #0a3d8f 0%, #3b82f6 50%, #f07a23 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              {meta.subtitle}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center">
        <SearchBar onNavigate={onNavigate} />
      </div>

      <DateTimeDisplay />

      <ProfileMenu />
    </header>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// SearchBar — Cmd+K command palette with page navigation
// ════════════════════════════════════════════════════════════════════════════
function SearchBar({ onNavigate }: { onNavigate: (k: string) => void }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Cmd+K (Ctrl+K) global shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      } else if (e.key === 'Escape') {
        setOpen(false)
        inputRef.current?.blur()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // Outside click → close
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const matches = useMemo(() => {
    if (!query.trim()) return NAV_OPTIONS
    const q = query.toLocaleLowerCase('tr-TR')
    return NAV_OPTIONS.filter((o) => o.label.toLocaleLowerCase('tr-TR').includes(q))
  }, [query])

  function pick(key: string) {
    onNavigate(key)
    setQuery('')
    setOpen(false)
    inputRef.current?.blur()
  }

  return (
    <div ref={wrapRef} className="relative flex w-full max-w-md">
      <label className="flex w-full items-center gap-2.5 rounded-full border border-border/60 bg-card px-3.5 py-2 transition-all duration-150 hover:border-foreground/20 focus-within:border-primary/35 focus-within:shadow-[0_0_0_4px_rgba(10,61,143,0.08)] sm:px-4 sm:py-2.5">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.8} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matches.length > 0) pick(matches[0].key)
          }}
          placeholder="Sayfa veya komut ara…"
          aria-label="Sayfa ara"
          className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-foreground outline-none ring-0 placeholder:text-muted-foreground focus:outline-none focus:ring-0 focus-visible:outline-none sm:text-sm"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="grid h-5 w-5 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            aria-label="Temizle"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        )}
      </label>

      {open && (
        <div
          className="absolute left-0 right-0 top-[calc(100%+8px)] z-40 overflow-hidden rounded-xl border border-border/60 bg-card shadow-[0_12px_40px_-12px_rgba(15,23,42,0.18)]"
          role="listbox"
        >
          <div
            aria-hidden="true"
            className="h-[2px]"
            style={{ background: 'linear-gradient(90deg, #0a3d8f 0%, #3b82f6 50%, #f07a23 100%)' }}
          />
          <div className="border-b border-border/60 px-3 py-2 text-[9.5px] font-extrabold uppercase tracking-wider text-muted-foreground">
            Sayfalar
          </div>
          <ul className="max-h-[300px] overflow-y-auto py-1">
            {matches.length === 0 && (
              <li className="px-3 py-4 text-center text-[12px] italic text-muted-foreground">
                "{query}" için sonuç yok
              </li>
            )}
            {matches.map((m) => (
              <li key={m.key}>
                <button
                  type="button"
                  onClick={() => pick(m.key)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-foreground transition-colors hover:bg-muted/50"
                >
                  {m.renderIcon()}
                  <span className="flex-1">{m.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// DateTimeDisplay — Live Turkish datetime, updates every minute
// ════════════════════════════════════════════════════════════════════════════
function DateTimeDisplay() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    // Align to the next minute boundary, then tick every minute
    const msToNextMinute = 60_000 - (Date.now() % 60_000)
    let interval: number | undefined
    const timeout = window.setTimeout(() => {
      setNow(new Date())
      interval = window.setInterval(() => setNow(new Date()), 60_000)
    }, msToNextMinute)
    return () => {
      window.clearTimeout(timeout)
      if (interval) window.clearInterval(interval)
    }
  }, [])

  // Friday, 17 May 2026 → Cuma, 17 Mayıs 2026
  const fullDate = useMemo(
    () =>
      new Intl.DateTimeFormat('tr-TR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(now),
    [now],
  )
  const time = useMemo(
    () =>
      new Intl.DateTimeFormat('tr-TR', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(now),
    [now],
  )

  return (
    <div className="hidden items-center gap-2 text-[12.5px] text-foreground/75 md:flex">
      <Clock className="h-4 w-4" strokeWidth={1.8} />
      <span className="hidden lg:inline">
        {fullDate} — {time}
      </span>
      <span className="lg:hidden">{time}</span>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// ProfileMenu — Avatar with dropdown (logout)
// ════════════════════════════════════════════════════════════════════════════
function ProfileMenu() {
  const { account, logout } = useMsal()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const displayName = String(account?.name || account?.username || 'Kullanıcı')
  const email = String(account?.username || '')
  const initial = (displayName.trim().charAt(0) || 'K').toUpperCase()

  async function handleLogout() {
    if (busy) return
    setBusy(true)
    try {
      await logout()
    } catch (e) {
      console.error('[Logout] failed', e)
    } finally {
      setBusy(false)
      setOpen(false)
    }
  }

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Profil menüsü"
        className="grid h-9 w-9 place-items-center rounded-full border border-border text-[13px] font-semibold text-white shadow-sm transition hover:scale-[1.04] sm:h-10 sm:w-10"
        style={{
          backgroundImage:
            'linear-gradient(135deg, #f4c08a 0%, #d18454 45%, #8b5a3c 100%)',
        }}
      >
        {initial}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-40 w-[240px] overflow-hidden rounded-xl border border-border bg-card shadow-[0_12px_40px_-12px_rgba(15,23,42,0.18)]"
        >
          <div className="flex items-start gap-3 border-b border-border px-3.5 py-3">
            <span
              aria-hidden="true"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[14px] font-semibold text-white"
              style={{
                backgroundImage:
                  'linear-gradient(135deg, #f4c08a 0%, #d18454 45%, #8b5a3c 100%)',
              }}
            >
              {initial}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-foreground">{displayName}</div>
              {email && email !== displayName && (
                <div className="truncate text-[11px] text-muted-foreground">{email}</div>
              )}
            </div>
          </div>

          <div className="p-1">
            <button
              type="button"
              role="menuitem"
              disabled
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] text-foreground/45 transition"
            >
              <UserRound className="h-4 w-4" strokeWidth={1.8} />
              <span className="flex-1">Profil ayarları</span>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground/60">
                yakında
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              disabled={busy}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.8} />
              <span>{busy ? 'Çıkış yapılıyor…' : 'Çıkış yap'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
