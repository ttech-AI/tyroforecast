// ════════════════════════════════════════════════════════════════════════════
// AdvancedFilterDropdown — Tahmin sayfasında "Gelişmiş Filtre" butonu
// ────────────────────────────────────────────────────────────────────────────
// Mavi gradient CTA buton + position:fixed popover. Trader Toplamı veya tek
// ürün seçimi ile grafiği filtreler. State (chartView) parent'tan kontrollü.
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  MagicWand02Icon,
  UserGroup02Icon,
  User03Icon,
  PackageIcon,
  RotateClockwiseIcon,
  Cancel01Icon,
} from '@hugeicons/core-free-icons'
import { fmtTon } from '../../lib/forecast/format.js'

export function AdvancedFilterDropdown({ items = [], chartView = 'total', onChartViewChange }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const btnRef = useRef(null)
  const [pos, setPos] = useState(null)

  useEffect(() => {
    if (!open || !btnRef.current) { setPos(null); return }
    const update = () => {
      const r = btnRef.current.getBoundingClientRect()
      const w = 320
      setPos({ right: window.innerWidth - r.right, top: r.bottom + 6, w })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    const onDoc = (e) => {
      if (btnRef.current && !btnRef.current.contains(e.target) && !e.target.closest('[data-fcst-filter-menu]')) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      document.removeEventListener('mousedown', onDoc)
    }
  }, [open])

  const filteredItems = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR')
    if (!q) return items
    return items.filter((it) =>
      it.pid.toLocaleLowerCase('tr-TR').includes(q) ||
      (it.name || '').toLocaleLowerCase('tr-TR').includes(q),
    )
  }, [items, search])

  const isItemView = chartView !== 'total'
  const activeItem = isItemView ? items.find((it) => it.pid === chartView) : null

  if (!items || items.length === 0 || !onChartViewChange) return null

  return (
    <div className="relative inline-flex">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2.5 text-[12.5px] font-semibold transition-all"
        style={
          isItemView
            ? {
                background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                borderColor: 'rgba(59,130,246,.55)',
                color: '#fff',
                boxShadow: '0 2px 8px rgba(59,130,246,.30), 0 1px 3px rgba(59,130,246,.20)',
              }
            : {
                background: '#fff',
                borderColor: 'rgba(59,130,246,.30)',
                color: '#1d4ed8',
                boxShadow: '0 1px 3px rgba(59,130,246,.08)',
              }
        }
      >
        <HugeiconsIcon icon={MagicWand02Icon} size={14} strokeWidth={1.9} />
        Gelişmiş Filtre
        {isItemView && activeItem && (
          <span
            className="ml-0.5 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-extrabold"
            style={{ background: 'rgba(255,255,255,.25)', color: '#fff', backdropFilter: 'blur(4px)' }}
          >
            {activeItem.pid}
          </span>
        )}
        <ChevronDown size={11} className={`transition ${open ? 'rotate-180' : ''}`} strokeWidth={2.2} />
      </button>

      {open && pos && (
        <div
          data-fcst-filter-menu
          className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_12px_36px_rgba(0,0,0,0.14),0_4px_12px_rgba(0,0,0,0.06)]"
          style={{
            position: 'fixed',
            right: pos.right,
            top: pos.top,
            width: pos.w,
            maxWidth: 'calc(100vw - 24px)',
            maxHeight: `min(560px, calc(100vh - ${pos.top + 20}px))`,
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Üst gradient şerit */}
          <div aria-hidden="true" className="h-[3px] shrink-0" style={{ background: 'linear-gradient(90deg, #3b82f6, #6366f1, #8b5cf6)' }} />

          {/* Header */}
          <div
            className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3"
            style={{ background: 'linear-gradient(135deg, rgba(59,130,246,.05), rgba(99,102,241,.02))' }}
          >
            <HugeiconsIcon icon={MagicWand02Icon} size={14} strokeWidth={2} className="text-primary" />
            <div className="flex-1">
              <div className="text-[12.5px] font-extrabold tracking-tight text-foreground">Gelişmiş Filtre</div>
              <div className="text-[10px] font-medium text-muted-foreground">Görüntüleme kapsamını seçin</div>
            </div>
          </div>

          {/* Trader Total */}
          <div className="shrink-0 border-b border-border px-3 py-3">
            <div className="mb-2 flex items-center gap-1 text-[9.5px] font-extrabold uppercase tracking-wider text-muted-foreground">
              <HugeiconsIcon icon={UserGroup02Icon} size={11} strokeWidth={2.2} />
              Trader Kapsamı
            </div>
            <button
              type="button"
              onClick={() => { onChartViewChange('total'); setOpen(false); setSearch('') }}
              className="flex w-full items-center gap-2.5 rounded-lg border p-2.5 transition"
              style={
                !isItemView
                  ? {
                      background: 'linear-gradient(135deg, rgba(59,130,246,.10), rgba(139,92,246,.04))',
                      borderColor: 'rgba(59,130,246,.30)',
                    }
                  : { background: '#fafbfc', borderColor: 'rgba(226,232,240,.8)' }
              }
            >
              <span
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
                style={
                  !isItemView
                    ? { background: 'linear-gradient(135deg, #3b82f6, #6366f1)', color: '#fff', boxShadow: '0 2px 6px rgba(59,130,246,.25)' }
                    : { background: 'rgba(59,130,246,.10)', color: '#1d4ed8' }
                }
              >
                <HugeiconsIcon icon={User03Icon} size={15} strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1 text-left">
                <div className={`truncate text-[12.5px] font-extrabold ${!isItemView ? 'text-primary' : 'text-foreground'}`}>
                  Trader Toplamı
                </div>
                <div className="truncate text-[10.5px] font-medium text-muted-foreground">Tüm ürünlerin birleşik tahmini</div>
              </div>
              {!isItemView && (
                <span
                  className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-white"
                  style={{ background: 'linear-gradient(135deg, #047857, #10b981)' }}
                >
                  ● Aktif
                </span>
              )}
            </button>
          </div>

          {/* Tek Ürün */}
          <div className="shrink-0 border-b border-border px-3 py-3">
            <div className="mb-2 flex items-center gap-1 text-[9.5px] font-extrabold uppercase tracking-wider text-muted-foreground">
              <HugeiconsIcon icon={PackageIcon} size={11} strokeWidth={2.2} />
              Tek Ürün <span className="ml-1 font-medium normal-case tracking-normal">· Top {items.length}</span>
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ürün kodu veya adı ara…"
              autoFocus
              className="w-full rounded-md border border-border bg-card px-3 py-1.5 text-[11.5px] font-medium text-foreground outline-none transition focus:border-primary/50 focus:bg-card"
            />
          </div>

          {/* List */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filteredItems.slice(0, 30).map((it) => {
              const sel = chartView === it.pid
              return (
                <button
                  key={it.pid}
                  type="button"
                  onClick={() => { onChartViewChange(it.pid); setOpen(false); setSearch('') }}
                  className="relative flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left transition hover:bg-muted/30"
                  style={sel ? { background: 'linear-gradient(135deg, rgba(59,130,246,.08), rgba(139,92,246,.04))' } : undefined}
                >
                  {sel && (
                    <span className="absolute left-0 top-0 h-full w-[3px]" style={{ background: 'linear-gradient(180deg, #3b82f6, #6366f1)' }} />
                  )}
                  <span
                    className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: sel ? 'linear-gradient(135deg, #3b82f6, #6366f1)' : '#cbd5e1' }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-[11.5px] font-bold ${sel ? 'text-primary' : 'text-foreground'}`}>{it.pid}</div>
                    {it.name && (
                      <div className="truncate text-[10px] font-medium text-muted-foreground">{it.name}</div>
                    )}
                  </div>
                  <span className="shrink-0 text-[10.5px] font-semibold tabular-nums text-muted-foreground">{fmtTon(it.last12)}</span>
                  {it.isStable === false && (
                    <span className="shrink-0 rounded bg-orange-100 px-1 py-0.5 text-[9px] font-extrabold tracking-wider text-orange-700">
                      DÜZENSİZ
                    </span>
                  )}
                </button>
              )
            })}
            {filteredItems.length === 0 && (
              <div className="py-6 text-center text-[11px] italic text-muted-foreground">Eşleşme yok</div>
            )}
          </div>

          {/* Footer */}
          <div
            className="flex shrink-0 gap-2 border-t border-border px-3 py-2.5"
            style={{ background: 'linear-gradient(180deg, #fafbfc, #f5f7fa)' }}
          >
            <button
              type="button"
              onClick={() => { onChartViewChange('total'); setSearch(''); setOpen(false) }}
              disabled={!isItemView && !search}
              className="flex-1 rounded-md border border-rose-200 bg-card px-2.5 py-1.5 text-[11.5px] font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <HugeiconsIcon icon={RotateClockwiseIcon} size={11} strokeWidth={2} className="mr-1 inline" />
              Filtreyi Temizle
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 rounded-md px-2.5 py-1.5 text-[11.5px] font-semibold text-white transition"
              style={{
                background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                boxShadow: '0 2px 6px rgba(59,130,246,.20)',
              }}
            >
              <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2.4} className="mr-1 inline" />
              Kapat
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
