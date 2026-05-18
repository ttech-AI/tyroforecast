import { useState } from 'react'
import { Login } from './components/Login'
import { TopNav } from './components/TopNav'
import { Sidebar } from './components/Sidebar'
import { OverviewHeader } from './components/OverviewHeader'
import { ReportsCard } from './components/ReportsCard'
import { OrderStatusCard } from './components/OrderStatusCard'
import { CustomersCard } from './components/CustomersCard'
import { OccupationCard } from './components/OccupationCard'
import { WeeklySummaryCard } from './components/WeeklySummaryCard'
import { SalesForecastPage } from './components/SalesForecastPage.jsx'
import { useMsal } from './lib/forecast/msalContext.jsx'

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
            {activePage === 'home' && <DashboardHome />}
            {activePage === 'forecast' && <SalesForecastPage />}
            {activePage === 'data' && <ComingSoon title="Veri yönetimi" />}
            {activePage === 'settings' && <ComingSoon title="Ayarlar" />}
          </main>
        </div>
      </div>
    </div>
  )
}

function DashboardHome() {
  return (
    <>
      <OverviewHeader />

      <div className="mt-5 grid grid-cols-1 gap-3 md:gap-4 lg:mt-7 lg:grid-cols-3 lg:gap-5">
        <ReportsCard className="lg:col-span-2" />
        <OrderStatusCard />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 lg:mt-5 lg:grid-cols-3 lg:gap-5">
        <CustomersCard />
        <OccupationCard />
        <WeeklySummaryCard className="sm:col-span-2 lg:col-span-1" />
      </div>
    </>
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
