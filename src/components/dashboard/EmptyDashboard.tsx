// ════════════════════════════════════════════════════════════════════════════
// EmptyDashboard — Anasayfa snapshot yokken gösterilir (premium upgrade)
// ────────────────────────────────────────────────────────────────────────────
// Dark navy hero + 4 feature preview tile + CTA. Yönetici buraya
// geldiğinde "neyi göreceğim" sorusunun cevabını da görerek
// Satış Tahmini'ne yönlendirilir.
// ════════════════════════════════════════════════════════════════════════════

import { HugeiconsIcon } from '@hugeicons/react'
import {
  AiBrain04Icon,
  AiAudioIcon,
  DashboardSquareAddIcon,
  ChartAnalysisIcon,
  Target02Icon,
  CrownIcon,
} from '@hugeicons/core-free-icons'
import { motion } from 'framer-motion'

export function EmptyDashboard({ onGoToForecast }: { onGoToForecast: () => void }) {
  return (
    <div className="space-y-4 md:space-y-5">
      {/* Hero — dark navy hero with ambient orange glow */}
      <section
        className="relative overflow-hidden rounded-2xl"
        style={{ background: 'linear-gradient(135deg, #0a1f4a 0%, #0a3d8f 55%, #1d4ed8 100%)' }}
      >
        {/* Dot pattern */}
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            opacity: 0.45,
          }}
        />
        {/* Animated orange glow */}
        <motion.div
          aria-hidden="true"
          className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(240,122,35,0.25) 0%, transparent 65%)' }}
          animate={{ scale: [1, 1.12, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        />
        {/* Gradient top strip */}
        <div
          aria-hidden="true"
          className="h-[3px]"
          style={{ background: 'linear-gradient(90deg, #f07a23 0%, #fbbf24 50%, #f07a23 100%)' }}
        />

        <div className="relative px-5 py-10 text-center md:px-8 md:py-14">
          {/* Pill */}
          <motion.span
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.32 }}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[10.5px] font-extrabold uppercase tracking-wider"
            style={{
              background: 'rgba(240,122,35,0.18)',
              color: '#fcd34d',
              border: '1px solid rgba(251,191,36,0.30)',
              boxShadow: '0 0 18px rgba(240,122,35,0.22)',
            }}
          >
            <HugeiconsIcon icon={AiBrain04Icon} size={12} strokeWidth={2.2} />
            Yönetici Özeti
          </motion.span>

          {/* Big icon */}
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.45, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto mt-5 grid h-20 w-20 place-items-center rounded-2xl text-white shadow-[0_10px_32px_-8px_rgba(0,0,0,0.40),inset_0_1px_0_rgba(255,255,255,0.22)]"
            style={{ background: 'linear-gradient(135deg, #f07a23 0%, #fbbf24 100%)' }}
          >
            <HugeiconsIcon icon={AiBrain04Icon} size={38} strokeWidth={1.6} />
          </motion.div>

          <motion.h2
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.42, delay: 0.14 }}
            className="mt-5 text-[22px] font-extrabold tracking-tight text-white md:text-[26px]"
          >
            Henüz tahmin hesaplanmadı
          </motion.h2>

          <motion.p
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.42, delay: 0.20 }}
            className="mx-auto mt-3 max-w-xl text-[13px] leading-relaxed text-slate-200/90 md:text-[14px]"
          >
            Satış Tahmini sayfasından bir trader seçip <strong className="text-amber-200">Hesapla</strong> butonuna bastığında
            buradaki executive özet, KPI'lar, tahmin grafiği ve top kümeleme otomatik olarak senin sonuçlarınla dolacak.
          </motion.p>

          {/* CTA */}
          <motion.button
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.42, delay: 0.28 }}
            type="button"
            onClick={onGoToForecast}
            className="mt-6 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-[14px] font-bold text-white shadow-[0_8px_22px_-4px_rgba(240,122,35,0.45)] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_30px_-6px_rgba(240,122,35,0.55)]"
            style={{ background: 'linear-gradient(135deg, #f07a23 0%, #ea580c 100%)' }}
          >
            <HugeiconsIcon icon={AiAudioIcon} size={16} strokeWidth={1.9} />
            Satış Tahmini'ne git
          </motion.button>
        </div>
      </section>

      {/* 4 preview tile — neyi göreceksin? */}
      <section>
        <div className="mb-3 flex items-center gap-2 px-1">
          <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-muted-foreground">
            Hesaplama Sonrası Burada Göreceğin
          </span>
          <span className="h-px flex-1 bg-border/60" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
          <PreviewTile
            icon={DashboardSquareAddIcon}
            accent="#0a3d8f"
            title="KPI Kartları"
            desc="Toplam miktar, sipariş, müşteri ve ürün sayıları"
            delay={0.05}
          />
          <PreviewTile
            icon={AiBrain04Icon}
            accent="#f07a23"
            title="Yönetici Özeti"
            desc="Trader durumu + büyüme + tahmin tek paragraf"
            delay={0.10}
          />
          <PreviewTile
            icon={ChartAnalysisIcon}
            accent="#3b82f6"
            title="Tahmin Grafiği"
            desc="Son 12 ay + sonraki H ay forecast, 8 model arası seçim"
            delay={0.15}
          />
          <PreviewTile
            icon={CrownIcon}
            accent="#8b5cf6"
            title="Top Kümeleme"
            desc="En büyük müşteri, ürün ve şirket payları"
            delay={0.20}
          />
        </div>
      </section>

      {/* Quick tip */}
      <section
        className="rounded-2xl border border-border/60 px-5 py-4 md:px-6 md:py-5"
        style={{
          background: 'linear-gradient(135deg, rgba(240,122,35,0.05), rgba(10,61,143,0.04))',
        }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <HugeiconsIcon icon={Target02Icon} size={18} strokeWidth={1.9} color="#f07a23" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold text-foreground">İpucu</div>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
              Bir kere hesapla yaptığında <strong className="text-foreground/85">localStorage</strong>'da snapshot tutulur.
              Sonraki açılışlarda buradaki dashboard kaldığın yerden devam eder.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PreviewTile({ icon, accent, title, desc, delay }: { icon: any; accent: string; title: string; desc: string; delay: number }) {
  return (
    <motion.div
      initial={{ y: 8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.42, delay }}
      className="group rounded-xl border border-border/60 bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-[0_4px_12px_-2px_rgba(15,23,42,0.08)]"
    >
      <span
        className="grid h-9 w-9 place-items-center rounded-xl border-[1.5px] bg-card"
        style={{
          borderColor: `${accent}38`,
          boxShadow: `0 1px 2px rgba(15,23,42,0.04), inset 0 1px 0 rgba(255,255,255,0.5)`,
        }}
      >
        <HugeiconsIcon icon={icon} size={16} strokeWidth={1.9} color={accent} />
      </span>
      <div className="mt-3 text-[12.5px] font-bold leading-tight text-foreground">
        {title}
      </div>
      <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">
        {desc}
      </p>
    </motion.div>
  )
}
