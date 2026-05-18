import { type ComponentType } from 'react'
import { Database, Settings } from 'lucide-react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Home01Icon, AiBrain04Icon } from '@hugeicons/core-free-icons'
import { TyroMark, TyroWordmark } from './TyroLogo'

type NavItem = {
  key: string
  label: string
  Icon: ComponentType<{ className?: string; strokeWidth?: number }>
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

const TOP_ITEMS: NavItem[] = [
  { key: 'home', label: 'Ana sayfa', Icon: HomeHugeIcon },
  { key: 'forecast', label: 'Satış Tahmini', Icon: ForecastHugeIcon },
  { key: 'data', label: 'Veri yönetimi', Icon: Database },
]

const BOTTOM_ITEMS: NavItem[] = [
  { key: 'settings', label: 'Ayarlar', Icon: Settings },
]

type SidebarProps = {
  activePage: string
  onPageChange: (key: string) => void
}

export function Sidebar({ activePage, onPageChange }: SidebarProps) {
  return (
    <nav
      aria-label="Primary"
      className="flex h-full w-full flex-col"
    >
      {/* Logo row — aligned with TopNav row in the main shell */}
      <div className="mb-4 flex h-10 items-center gap-2.5 px-2 lg:mb-6">
        <TyroMark size={30} />
        <TyroWordmark className="overflow-hidden whitespace-nowrap !text-[16px] opacity-0 transition-opacity duration-150 lg:group-hover:opacity-100" />
      </div>

      {/* Top items */}
      <div className="flex flex-col gap-0.5">
        {TOP_ITEMS.map((item) => (
          <SidebarItem
            key={item.key}
            item={item}
            isActive={item.key === activePage}
            onSelect={() => onPageChange(item.key)}
          />
        ))}
      </div>

      {/* Bottom items (Settings) */}
      <div className="mt-auto flex flex-col gap-0.5">
        {BOTTOM_ITEMS.map((item) => (
          <SidebarItem
            key={item.key}
            item={item}
            isActive={item.key === activePage}
            onSelect={() => onPageChange(item.key)}
          />
        ))}
      </div>
    </nav>
  )
}

function SidebarItem({
  item,
  isActive,
  onSelect,
}: {
  item: NavItem
  isActive: boolean
  onSelect: () => void
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
        className={`overflow-hidden whitespace-nowrap text-[13px] opacity-0 transition-opacity duration-150 lg:group-hover:opacity-100 ${
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
