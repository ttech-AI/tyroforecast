import { useState } from 'react'
import { Login } from './components/Login'
import { TopNav } from './components/TopNav'
import { Sidebar } from './components/Sidebar'
import { ExecutiveKpiCards } from './components/dashboard/ExecutiveKpiCards'
import { ExecutiveSummaryHero } from './components/dashboard/ExecutiveSummaryHero'
import { ForecastMiniChart } from './components/dashboard/ForecastMiniChart'
import { TopBreakdownCard } from './components/dashboard/TopBreakdownCard'
import { SeasonalActivityStrip } from './components/dashboard/SeasonalActivityStrip'
import { EmptyDashboard } from './components/dashboard/EmptyDashboard'
import { CrownIcon, Crown02Icon, Crown03Icon } from '@hugeicons/core-free-icons'
import { SalesForecastPage } from './components/SalesForecastPage.jsx'
import { useMsal } from './lib/forecast/msalContext.jsx'
import { useHomeSnapshot } from './lib/forecast/homeSnapshot.js'

type PageKey = 'home' | 'forecast' | 'data' | 'settings'

function App() {
  const { ready, account } = useMsal()
  const [activePage, setActivePage] = useState<PageKey>('home')

  // MSAL still bootstrapping — show a thin loader to avoid auth flicker
  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center bg-page">
        <div className="text-sm text-foreground/60">Yükleniyor…</div>
      </div>
    )
  }

  // Not logged in → show login page
  if (!account) {
    return <Login />
  }

  return (
    <div className="min-h-screen bg-page p-2 sm:p-3 lg:p-4">
      {/* Fixed sidebar — always visible, expands on hover (lg+) */}
      <aside
        className="peer group fixed bottom-2 left-2 top-2 z-30 sm:bottom-3 sm:left-3 sm:top-3 lg:bottom-4 lg:left-4 lg:top-4"
      >
        <div
          className="flex h-full w-[60px] flex-col overflow-hidden rounded-xl border border-border bg-shell px-2 py-3 shadow-sm transition-[width] duration-300 ease-out sm:w-[64px] sm:rounded-2xl sm:px-2.5 sm:py-5 lg:py-6 lg:hover:w-[220px] lg:hover:shadow-lg"
        >
          <Sidebar
            activePage={activePage}
            onPageChange={(k) => setActivePage(k as PageKey)}
          />
        </div>
      </aside>

      {/* Main content — offset for fixed sidebar, shifts right when sidebar expands */}
      <div className="ml-[68px] transition-[margin] duration-300 ease-out sm:ml-[76px] lg:ml-[80px] lg:peer-hover:ml-[236px]">
        <div className="rounded-xl border border-border bg-shell p-3 shadow-sm sm:rounded-2xl sm:p-5 lg:p-6">
          <TopNav activePage={activePage} onNavigate={(k) => setActivePage(k as PageKey)} />

          <main className="mt-5 lg:mt-7">
            {activePage === 'home' && (
              <DashboardHome onGoToForecast={() => setActivePage('forecast')} />
            )}
            {activePage === 'forecast' && <SalesForecastPage />}
            {activePage === 'data' && <ComingSoon title="Veri yönetimi" />}
            {activePage === 'settings' && <ComingSoon title="Ayarlar" />}
          </main>
        </div>
      </div>
    </div>
  )
}

function DashboardHome({ onGoToForecast }: { onGoToForecast: () => void }) {
  const snapshot = useHomeSnapshot()

  // Snapshot yok → boş durum + Satış Tahmini CTA
  if (!snapshot) {
    return <EmptyDashboard onGoToForecast={onGoToForecast} />
  }

  return (
    <div className="space-y-4 md:space-y-5">
      {/* Row 1 — 4 üst KPI */}
      <ExecutiveKpiCards snapshot={snapshot} />

      {/* Row 2 — Executive Summary hero (full-width) */}
      <ExecutiveSummaryHero snapshot={snapshot} />

      {/* Row 3 — Forecast chart (full-width, geniş, model selector header'da) */}
      <ForecastMiniChart snapshot={snapshot} />

      {/* Row 3 — 3 top breakdown kartı (taç ikonları, 3 farklı varyant + renk) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-5">
        <TopBreakdownCard
          icon={CrownIcon}
          accent="#8b5cf6"
          title="Top Müşteriler"
          subtitle={`${snapshot.topCustomers.length} müşteri · hacim sırasına göre`}
          items={snapshot.topCustomers}
        />
        <TopBreakdownCard
          icon={Crown02Icon}
          accent="#f07a23"
          title="Top Ürünler"
          subtitle={`${snapshot.topProducts.length} ürün · toplam paydan`}
          items={snapshot.topProducts}
        />
        <TopBreakdownCard
          icon={Crown03Icon}
          accent="#0a3d8f"
          title="Top Şirketler"
          subtitle={`${snapshot.topCompanies.length} grup · origin payı`}
          items={snapshot.topCompanies}
        />
      </div>

      {/* Row 4 — Mevsim Profili + Aktivite Gauge */}
      <SeasonalActivityStrip snapshot={snapshot} />
    </div>
  )
}

function ComingSoon({ title }: { title: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Bu modül yakında geliyor.
      </p>
    </div>
  )
}

export default App
