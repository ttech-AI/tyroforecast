import { type ComponentType, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Database, Settings, Pin, LogOut, UserRound } from 'lucide-react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Home01Icon, AiBrain04Icon } from '@hugeicons/core-free-icons'
import { TyroMark, TyroWordmark } from './TyroLogo'
import { useMsal } from '../lib/forecast/msalContext.jsx'

type NavItem = {
  key: string
  label: string
  Icon: ComponentType<{ className?: string; strokeWidth?: number }>
}

type NavGroup = {
  title: string
  items: NavItem[]
}

function HomeHugeIcon({
  className,
  strokeWidth = 1.8,
}: {
  className?: string
  strokeWidth?: number
}) {
  return (
    <HugeiconsIcon
      icon={Home01Icon}
      className={className}
      strokeWidth={strokeWidth}
    />
  )
}

function ForecastHugeIcon({
  className,
  strokeWidth = 1.8,
}: {
  className?: string
  strokeWidth?: number
}) {
  return (
    <HugeiconsIcon
      icon={AiBrain04Icon}
      className={className}
      strokeWidth={strokeWidth}
    />
  )
}

const TOP_GROUPS: NavGroup[] = [
  {
    title: 'Pano',
    items: [
      { key: 'home', label: 'Ana Sayfa', Icon: HomeHugeIcon },
    ],
  },
  {
    title: 'Operasyon',
    items: [
      { key: 'forecast', label: 'Satış Tahmini', Icon: ForecastHugeIcon },
      { key: 'data', label: 'Veri Yönetimi', Icon: Database },
    ],
  },
]

const BOTTOM_GROUPS: NavGroup[] = [
  {
    title: 'Sistem',
    items: [
      { key: 'settings', label: 'Ayarlar', Icon: Settings },
    ],
  },
]

type SidebarProps = {
  activePage: string
  onPageChange: (key: string) => void
  pinned: boolean
  onTogglePin: () => void
}

// Pinned ise her zaman, değilse sadece hover'da görünür CSS class'ı.
// Inline conditional Tailwind purger için literal kalıyor.
function visibilityCls(pinned: boolean): string {
  return pinned
    ? 'opacity-100'
    : 'opacity-0 transition-opacity duration-150 lg:group-hover:opacity-100'
}

export function Sidebar({ activePage, onPageChange, pinned, onTogglePin }: SidebarProps) {
  return (
    <nav
      aria-label="Primary"
      className="flex h-full w-full flex-col"
    >
      {/* Logo row — aligned with TopNav row in the main shell */}
      <div className="mb-4 flex h-10 items-center gap-2.5 px-2 lg:mb-6">
        <TyroMark size={30} />
        <TyroWordmark
          className={`overflow-hidden whitespace-nowrap !text-[16px] ${visibilityCls(pinned)}`}
        />
        {/* Pin button — sidebar sabitleme */}
        <button
          type="button"
          onClick={onTogglePin}
          aria-label={pinned ? 'Sabitlemeyi kaldır' : 'Sidebar\'ı sabitle'}
          title={pinned ? 'Sabitlemeyi kaldır' : 'Sidebar\'ı sabitle'}
          className={`ml-auto grid h-7 w-7 shrink-0 place-items-center rounded-md transition-all duration-200 ${visibilityCls(pinned)} ${
            pinned
              ? 'text-primary shadow-[0_0_0_1px_rgba(10,61,143,0.25),inset_0_1px_0_rgba(255,255,255,0.5)]'
              : 'text-foreground/50 hover:bg-muted/60 hover:text-foreground'
          }`}
          style={pinned ? {
            background: 'linear-gradient(135deg, rgba(10,61,143,0.08), rgba(240,122,35,0.06))',
          } : undefined}
        >
          <Pin
            className={`h-3.5 w-3.5 transition-transform duration-200 ${pinned ? 'rotate-0' : 'rotate-45'}`}
            strokeWidth={2}
            fill={pinned ? 'currentColor' : 'none'}
          />
        </button>
      </div>

      {/* Top groups */}
      <div className="flex flex-col gap-3">
        {TOP_GROUPS.map((group) => (
          <NavGroupBlock
            key={group.title}
            group={group}
            activePage={activePage}
            onPageChange={onPageChange}
            pinned={pinned}
          />
        ))}
      </div>

      {/* Bottom block — settings + profile + copyright, hepsi alta yapışık */}
      <div className="mt-auto flex flex-col">
        <div className="flex flex-col gap-3">
          {BOTTOM_GROUPS.map((group) => (
            <NavGroupBlock
              key={group.title}
              group={group}
              activePage={activePage}
              onPageChange={onPageChange}
              pinned={pinned}
            />
          ))}
        </div>

        {/* Profile button */}
        <ProfileItem pinned={pinned} />

        {/* Copyright */}
        <FooterBrand pinned={pinned} />
      </div>
    </nav>
  )
}

function NavGroupBlock({
  group,
  activePage,
  onPageChange,
  pinned,
}: {
  group: NavGroup
  activePage: string
  onPageChange: (key: string) => void
  pinned: boolean
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {/* Group label — pinned ise her zaman, değilse hover'da */}
      <div className="relative h-3 px-2.5">
        {/* Collapse durumunda merkez minik tire */}
        <span
          aria-hidden="true"
          className={`absolute left-1/2 top-1/2 h-px w-3 -translate-x-1/2 -translate-y-1/2 bg-foreground/15 transition-opacity duration-150 ${
            pinned ? 'opacity-0' : 'lg:group-hover:opacity-0'
          }`}
        />
        {/* Expand'da grup adı */}
        <span
          className={`absolute inset-0 flex items-center px-2.5 text-[9.5px] font-extrabold uppercase tracking-[0.14em] text-foreground/35 ${visibilityCls(pinned)}`}
        >
          {group.title}
        </span>
      </div>
      {/* Items */}
      {group.items.map((item) => (
        <SidebarItem
          key={item.key}
          item={item}
          isActive={item.key === activePage}
          onSelect={() => onPageChange(item.key)}
          pinned={pinned}
        />
      ))}
    </div>
  )
}

function SidebarItem({
  item,
  isActive,
  onSelect,
  pinned,
}: {
  item: NavItem
  isActive: boolean
  onSelect: () => void
  pinned: boolean
}) {
  const { label, Icon } = item
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={label}
      title={label}
      aria-current={isActive ? 'page' : undefined}
      className="relative flex h-10 w-full items-center gap-3 rounded-lg px-2.5 transition-colors hover:bg-muted/60"
    >
      {/* Polished LED-style accent strip — pinned to sidebar's inner left edge */}
      {isActive && (
        <span
          aria-hidden="true"
          className="absolute -left-2.5 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-gradient-to-b from-primary/60 via-primary to-primary/60 shadow-[1px_0_6px_-1px_rgba(31,73,153,0.55)]"
        />
      )}
      <Icon
        className={`h-[18px] w-[18px] shrink-0 transition-colors ${
          isActive ? 'text-primary' : 'text-foreground/55'
        }`}
        strokeWidth={1.8}
      />
      <span
        className={`overflow-hidden whitespace-nowrap text-[13px] ${visibilityCls(pinned)} ${
          isActive
            ? 'font-semibold text-primary'
            : 'font-medium text-foreground/70'
        }`}
      >
        {label}
      </span>
    </button>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// ProfileItem — Sidebar alt bölümünde avatar + isim + dropdown (Çıkış yap)
// ────────────────────────────────────────────────────────────────────────────
function ProfileItem({ pinned }: { pinned: boolean }) {
  const { account, logout } = useMsal()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)

  const displayName = String(account?.name || account?.username || 'Kullanıcı')
  const email = String(account?.username || '')
  const initial = (displayName.trim().charAt(0) || 'K').toUpperCase()

  // Menu pozisyonu — sidebar'ın sağına portal olarak açılır
  useEffect(() => {
    if (!open || !btnRef.current) { setMenuPos(null); return }
    const update = () => {
      const r = btnRef.current!.getBoundingClientRect()
      setMenuPos({ x: r.right + 8, y: r.top - 100 })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (btnRef.current?.contains(t)) return
      if (t.closest('[data-sidebar-profile-menu]')) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

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
    <div className="mt-2 border-t border-border/40 pt-2">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Profil: ${displayName}`}
        title={displayName}
        aria-haspopup="menu"
        aria-expanded={open}
        className="relative flex h-10 w-full items-center gap-3 rounded-lg px-1 transition-colors hover:bg-muted/60"
      >
        {/* Avatar — initial circle, accent orange ring */}
        <span
          aria-hidden="true"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11.5px] font-bold text-white shadow-[0_2px_6px_-2px_rgba(240,122,35,0.45),inset_0_1px_0_rgba(255,255,255,0.30)] ring-1 ring-orange-300/40"
          style={{
            backgroundImage: 'linear-gradient(135deg, #f4c08a 0%, #d18454 45%, #8b5a3c 100%)',
          }}
        >
          {initial}
        </span>
        <span
          className={`min-w-0 flex-1 overflow-hidden text-left ${visibilityCls(pinned)}`}
        >
          <span className="block truncate text-[12.5px] font-semibold text-foreground/85">
            {displayName}
          </span>
          {email && email !== displayName && (
            <span className="mt-0.5 block truncate text-[9.5px] text-muted-foreground">
              {email}
            </span>
          )}
        </span>
      </button>

      {/* Dropdown — portal, sidebar'ın sağına yerleşir */}
      {open && menuPos && typeof document !== 'undefined' && createPortal(
        <div
          data-sidebar-profile-menu
          role="menu"
          className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_12px_40px_-12px_rgba(15,23,42,0.18)]"
          style={{ position: 'fixed', left: menuPos.x, top: menuPos.y, width: 240, zIndex: 60 }}
        >
          <div
            aria-hidden="true"
            className="h-[2px]"
            style={{ background: 'linear-gradient(90deg, #f07a23 0%, #fbbf24 50%, #f07a23 100%)' }}
          />
          <div className="flex items-start gap-3 border-b border-border px-3.5 py-3">
            <span
              aria-hidden="true"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[14px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.30)] ring-2 ring-orange-300/40"
              style={{
                backgroundImage: 'linear-gradient(135deg, #f4c08a 0%, #d18454 45%, #8b5a3c 100%)',
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
        </div>,
        document.body,
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// FooterBrand — Sidebar altında copyright (premium, gradient ayraçlı)
// ────────────────────────────────────────────────────────────────────────────
function FooterBrand({ pinned }: { pinned: boolean }) {
  const year = new Date().getFullYear()
  return (
    <div className={`mt-2 ${visibilityCls(pinned)}`}>
      {/* Gradient ayraç */}
      <div
        aria-hidden="true"
        className="mx-1 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(10,61,143,0.18) 30%, rgba(240,122,35,0.22) 70%, transparent)',
        }}
      />
      {/* Copyright satırları */}
      <div className="mt-2 flex flex-col items-center gap-0.5 px-2 pb-1 text-center">
        <span className="text-[8.5px] font-semibold text-foreground/40">
          © {year} TTECH Business Solutions
        </span>
        <span
          className="text-[9px] font-extrabold uppercase tracking-[0.18em]"
          style={{
            backgroundImage: 'linear-gradient(135deg, #0a3d8f 0%, #3b82f6 45%, #f07a23 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          TYRO · AI
        </span>
      </div>
    </div>
  )
}
