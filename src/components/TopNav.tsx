import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import {
  Search,
  SlidersHorizontal,
  Clock,
  LogOut,
  UserRound,
  Home,
  Database,
  Settings as SettingsIcon,
  X,
  RotateCcw,
  Check,
} from 'lucide-react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  AiBrain04Icon,
  User03Icon,
  UserGroup02Icon,
  PackageIcon,
  Calendar03Icon,
  DeliveryTruck01Icon,
  FactoryIcon,
} from '@hugeicons/core-free-icons'
import { useMsal } from '../lib/forecast/msalContext.jsx'

// ─── Page meta (başlık + gradient subtitle) ─────────────────────────────────
const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  home:     { title: 'Ana Sayfa',     subtitle: 'Yönetici Özeti · Tahmin Sonuçları' },
  forecast: { title: 'Satış Tahmini', subtitle: 'AI destekli zaman serisi modelleri' },
  data:     { title: 'Veri Yönetimi', subtitle: 'Trader ve ürün katalogları' },
  settings: { title: 'Ayarlar',       subtitle: 'Sistem ve hesap tercihleri' },
}

const NAV_OPTIONS: Array<{
  key: string
  label: string
  Icon: ComponentType<{ className?: string; strokeWidth?: number }>
}> = [
  { key: 'home', label: 'Ana Sayfa', Icon: Home },
  { key: 'forecast', label: 'Satış Tahmini', Icon: ForecastIconWrapper },
  { key: 'data', label: 'Veri Yönetimi', Icon: Database },
  { key: 'settings', label: 'Ayarlar', Icon: SettingsIcon },
]

function ForecastIconWrapper({ className, strokeWidth }: { className?: string; strokeWidth?: number }) {
  return <HugeiconsIcon icon={AiBrain04Icon} className={className} strokeWidth={strokeWidth ?? 1.8} />
}

type TopNavProps = {
  activePage: string
  onNavigate: (key: string) => void
}

export function TopNav({ activePage, onNavigate }: TopNavProps) {
  const meta = PAGE_META[activePage] || { title: 'Overview', subtitle: '' }
  return (
    <header className="flex items-center gap-3 sm:gap-4 lg:gap-6">
      <div className="flex shrink-0 flex-col gap-1">
        <h1 className="text-[17px] font-semibold leading-none tracking-tight text-foreground md:text-[19px]">
          {meta.title}
        </h1>
        {meta.subtitle && (
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

      <div className="flex flex-1 items-center justify-center gap-2">
        <SearchBar onNavigate={onNavigate} />
        <AdvancedFilterButton />
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
      <label className="flex w-full items-center gap-2.5 rounded-full border border-border/70 bg-card px-3.5 py-2 transition-all duration-150 hover:border-border focus-within:border-primary/30 focus-within:shadow-[0_0_0_4px_rgba(10,61,143,0.08)] sm:px-4 sm:py-2.5">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.8} />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matches.length > 0) pick(matches[0].key)
          }}
          placeholder="Sayfa ara, komut çalıştır… (⌘K)"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground sm:text-sm"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="grid h-5 w-5 place-items-center rounded text-muted-foreground hover:text-foreground"
            aria-label="Temizle"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        )}
        <kbd className="hidden shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-flex">
          ⌘K
        </kbd>
      </label>

      {open && (
        <div
          className="absolute left-0 right-0 top-[calc(100%+8px)] z-40 overflow-hidden rounded-xl border border-border bg-card shadow-[0_12px_40px_-12px_rgba(15,23,42,0.18)]"
          role="listbox"
        >
          <div className="border-b border-border px-3 py-2 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
            Sayfalar
          </div>
          <ul className="max-h-[280px] overflow-y-auto p-1">
            {matches.length === 0 && (
              <li className="px-3 py-3 text-center text-[12px] text-muted-foreground">
                "{query}" için sonuç yok
              </li>
            )}
            {matches.map((m) => (
              <li key={m.key}>
                <button
                  type="button"
                  onClick={() => pick(m.key)}
                  className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px] text-foreground transition hover:bg-muted/50"
                >
                  <m.Icon className="h-4 w-4 text-foreground/70" strokeWidth={1.8} />
                  <span className="flex-1">{m.label}</span>
                  <kbd className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    Enter
                  </kbd>
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-border px-3 py-2 text-[10.5px] text-muted-foreground">
            <kbd className="mr-1 rounded border border-border px-1 font-mono">↵</kbd>
            seç ·
            <kbd className="mx-1 rounded border border-border px-1 font-mono">Esc</kbd>
            kapat
          </div>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// AdvancedFilterButton — Popover with entity-field comboboxes
// ════════════════════════════════════════════════════════════════════════════
type AdvancedFilters = {
  anaTrader: string
  trader: string
  product: string
  customer: string
  company: string
  orderType: string
  dateRange: '30g' | '90g' | '6ay' | '1yil' | 'tum' | string
}

const EMPTY_FILTERS: AdvancedFilters = {
  anaTrader: '',
  trader: '',
  product: '',
  customer: '',
  company: '',
  orderType: '',
  dateRange: 'tum',
}

const DATE_PRESETS: Array<{ v: AdvancedFilters['dateRange']; l: string }> = [
  { v: '30g', l: 'Son 30 gün' },
  { v: '90g', l: 'Son 90 gün' },
  { v: '6ay', l: 'Son 6 ay' },
  { v: '1yil', l: 'Son 1 yıl' },
  { v: 'tum', l: 'Tümü' },
]

const ORDER_TYPES = ['Tümü', 'Domestic', 'Export', 'Re-export', 'Stoktan satış']
const COMPANY_OPTIONS = ['Tümü', 'TIRYAKI', 'DANE', 'ASYA', 'SUNAR']

function AdvancedFilterButton() {
  const [open, setOpen] = useState(false)
  const [filters, setFilters] = useState<AdvancedFilters>(EMPTY_FILTERS)
  const [applied, setApplied] = useState<AdvancedFilters>(EMPTY_FILTERS)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  // Active filter count for the badge
  const activeCount = useMemo(() => {
    let n = 0
    if (applied.anaTrader) n++
    if (applied.trader) n++
    if (applied.product) n++
    if (applied.customer) n++
    if (applied.company && applied.company !== 'Tümü') n++
    if (applied.orderType && applied.orderType !== 'Tümü') n++
    if (applied.dateRange && applied.dateRange !== 'tum') n++
    return n
  }, [applied])

  // Outside click + Escape
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (popRef.current?.contains(t) || btnRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function reset() {
    setFilters(EMPTY_FILTERS)
  }
  function apply() {
    setApplied(filters)
    setOpen(false)
    // TODO: emit to global filter context when wired
  }

  return (
    <div className="relative shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Gelişmiş filtreler"
        className={`relative grid h-10 w-10 place-items-center rounded-full border bg-card transition ${
          open || activeCount > 0
            ? 'border-primary/40 text-primary'
            : 'border-border text-foreground/80 hover:text-foreground'
        }`}
      >
        <SlidersHorizontal className="h-4 w-4" strokeWidth={1.8} />
        {activeCount > 0 && (
          <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={popRef}
          role="dialog"
          className="absolute right-0 top-[calc(100%+10px)] z-40 w-[360px] overflow-hidden rounded-2xl border border-border bg-card shadow-[0_24px_60px_-20px_rgba(15,23,42,0.22)]"
        >
          {/* Top accent strip */}
          <div
            aria-hidden="true"
            className="h-[3px]"
            style={{ background: 'linear-gradient(90deg, #0a3d8f 0%, #3b82f6 50%, #f07a23 100%)' }}
          />

          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="text-[13px] font-semibold text-foreground">Gelişmiş Filtre</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                Veri kaynağı: <code className="font-mono">historicalsalesdemand</code>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              aria-label="Kapat"
            >
              <X className="h-4 w-4" strokeWidth={1.8} />
            </button>
          </div>

          <div className="space-y-4 px-4 pb-4">
            <FilterRow
              icon={<HugeiconsIcon icon={User03Icon} size={14} strokeWidth={1.8} />}
              label="Ana Trader"
            >
              <input
                type="text"
                value={filters.anaTrader}
                onChange={(e) => setFilters((f) => ({ ...f, anaTrader: e.target.value }))}
                placeholder="TRD-… veya isim"
                className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-[12.5px] outline-none transition focus:border-foreground/30"
              />
            </FilterRow>

            <FilterRow
              icon={<HugeiconsIcon icon={UserGroup02Icon} size={14} strokeWidth={1.8} />}
              label="Trader"
            >
              <input
                type="text"
                value={filters.trader}
                onChange={(e) => setFilters((f) => ({ ...f, trader: e.target.value }))}
                placeholder="TRD-… veya isim"
                className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-[12.5px] outline-none transition focus:border-foreground/30"
              />
            </FilterRow>

            <FilterRow
              icon={<HugeiconsIcon icon={PackageIcon} size={14} strokeWidth={1.8} />}
              label="Ürün ID"
            >
              <input
                type="text"
                value={filters.product}
                onChange={(e) => setFilters((f) => ({ ...f, product: e.target.value }))}
                placeholder="SKU / ürün kodu"
                className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-[12.5px] outline-none transition focus:border-foreground/30"
              />
            </FilterRow>

            <FilterRow
              icon={<HugeiconsIcon icon={DeliveryTruck01Icon} size={14} strokeWidth={1.8} />}
              label="Müşteri (To Account)"
            >
              <input
                type="text"
                value={filters.customer}
                onChange={(e) => setFilters((f) => ({ ...f, customer: e.target.value }))}
                placeholder="Müşteri kodu / adı"
                className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-[12.5px] outline-none transition focus:border-foreground/30"
              />
            </FilterRow>

            <FilterRow
              icon={<HugeiconsIcon icon={FactoryIcon} size={14} strokeWidth={1.8} />}
              label="Şirket"
            >
              <ComboboxSelect
                value={filters.company || 'Tümü'}
                options={COMPANY_OPTIONS}
                onChange={(v) => setFilters((f) => ({ ...f, company: v }))}
              />
            </FilterRow>

            <FilterRow
              icon={<HugeiconsIcon icon={UserGroup02Icon} size={14} strokeWidth={1.8} />}
              label="Sipariş Tipi"
            >
              <ComboboxSelect
                value={filters.orderType || 'Tümü'}
                options={ORDER_TYPES}
                onChange={(v) => setFilters((f) => ({ ...f, orderType: v }))}
              />
            </FilterRow>

            <FilterRow
              icon={<HugeiconsIcon icon={Calendar03Icon} size={14} strokeWidth={1.8} />}
              label="Tarih Aralığı"
            >
              <div className="flex flex-wrap gap-1.5">
                {DATE_PRESETS.map((p) => {
                  const active = filters.dateRange === p.v
                  return (
                    <button
                      key={p.v}
                      type="button"
                      onClick={() => setFilters((f) => ({ ...f, dateRange: p.v }))}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${active
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-foreground/70 hover:border-foreground/30 hover:text-foreground'
                      }`}
                    >
                      {p.l}
                    </button>
                  )
                })}
              </div>
            </FilterRow>
          </div>

          {/* Sticky footer */}
          <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/30 px-4 py-3">
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-foreground/80 transition hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
              Temizle
            </button>
            <button
              type="button"
              onClick={apply}
              className="inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-[12px] font-semibold text-white shadow-sm transition"
              style={{ background: 'linear-gradient(135deg, #0a3d8f 0%, #1d4ed8 100%)' }}
            >
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
              Uygula
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function FilterRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
        <span className="text-foreground/55">{icon}</span>
        {label}
      </label>
      {children}
    </div>
  )
}

function ComboboxSelect({
  value,
  options,
  onChange,
}: {
  value: string
  options: string[]
  onChange: (v: string) => void
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full appearance-none rounded-md border border-border bg-card px-2.5 py-1.5 text-[12.5px] text-foreground outline-none transition focus:border-foreground/30"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
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
