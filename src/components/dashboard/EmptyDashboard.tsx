// ════════════════════════════════════════════════════════════════════════════
// EmptyDashboard — Anasayfa snapshot yokken gösterilir
// ────────────────────────────────────────────────────────────────────────────
// İlk açılışta veya snapshot temizlenmişse: kullanıcıyı Satış Tahmini sayfasına
// yönlendir. Premium, gradient strip + tek CTA.
// ════════════════════════════════════════════════════════════════════════════

import { HugeiconsIcon } from '@hugeicons/react'
import { AiBrain03Icon, AiAudioIcon } from '@hugeicons/core-free-icons'

export function EmptyDashboard({ onGoToForecast }: { onGoToForecast: () => void }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.10)]">
      <div
        aria-hidden="true"
        className="h-[3px]"
        style={{ background: 'linear-gradient(90deg, #0a3d8f 0%, #3b82f6 50%, #f07a23 100%)' }}
      />
      <div className="flex flex-col items-center px-6 py-12 text-center md:py-16">
        <div
          className="grid h-16 w-16 place-items-center rounded-2xl text-white shadow-[0_8px_24px_-6px_rgba(10,61,143,0.30),inset_0_1px_0_rgba(255,255,255,0.22)]"
          style={{ background: 'linear-gradient(135deg, #0a3d8f 0%, #3b82f6 55%, #f07a23 100%)' }}
        >
          <HugeiconsIcon icon={AiBrain03Icon} size={28} strokeWidth={1.7} />
        </div>
        <h2 className="mt-5 text-[20px] font-bold tracking-tight text-foreground md:text-[22px]">
          Henüz tahmin hesaplanmadı
        </h2>
        <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted-foreground">
          Satış Tahmini sayfasından bir trader seçip <strong className="text-foreground">Hesapla</strong> butonuna bastığınızda
          Anasayfa otomatik olarak en son hesaplama özetiyle dolacak — KPI'lar, tahmin grafiği, top kümeleme,
          mevsim profili ve yönetici özeti hep birlikte.
        </p>
        <button
          type="button"
          onClick={onGoToForecast}
          className="mt-6 inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_6px_18px_-4px_rgba(10,61,143,0.45)] transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_26px_-6px_rgba(10,61,143,0.55)]"
          style={{ backgroundImage: 'linear-gradient(135deg, #0a3d8f 0%, #1d4ed8 50%, #3b82f6 100%)' }}
        >
          <HugeiconsIcon icon={AiAudioIcon} size={15} strokeWidth={1.9} />
          Satış Tahmini'ne git
        </button>
      </div>
    </section>
  )
}
