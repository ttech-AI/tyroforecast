// ════════════════════════════════════════════════════════════════════════════
// ComingSoonPage — Yapım aşamasındaki modüller için premium placeholder
// ────────────────────────────────────────────────────────────────────────────
// Sade ama bilgilendirici — yönetici bu sayfada ne göreceğini önceden anlasın.
// Dark navy hero + planlanan özellikler listesi + ETA/durum + ambient animasyon.
// ════════════════════════════════════════════════════════════════════════════

import { type ReactNode } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Database01Icon,
  Settings02Icon,
  FlashIcon,
  CheckmarkBadge02Icon,
  Loading03Icon,
  AiBrain04Icon,
} from '@hugeicons/core-free-icons'
import { motion } from 'framer-motion'

type FeatureItem = {
  label: string
  desc: string
  status: 'planning' | 'in-progress' | 'done'
}

type ComingSoonPageProps = {
  pageKey: 'data' | 'settings' | string
}

const META: Record<string, {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any
  accent: string
  title: string
  tagline: string
  description: ReactNode
  features: FeatureItem[]
  etaLabel: string
}> = {
  data: {
    icon: Database01Icon,
    accent: '#10b981',
    title: 'Veri Yönetimi',
    tagline: 'Trader ve ürün katalogları',
    description: (
      <>
        Dataverse entity'lerini tek panelden yönetebileceğin bir veri merkezi.
        <strong className="text-amber-200"> Trader dizini</strong>, <strong className="text-amber-200">ürün kataloğu</strong>
        {', '}<strong className="text-amber-200">müşteri grupları</strong> ve şirket alias kuralları —
        hepsi tek tıkla CSV / Excel'e yedeklenebilir ve doğrulama akışlarından geçirilebilir.
      </>
    ),
    features: [
      { label: 'Trader katalog yönetimi',  desc: 'Ana / alt trader hiyerarşisi, durum (aktif/pasif), bağlı şirket', status: 'planning' },
      { label: 'Ürün master listesi',      desc: 'Itemid + Türkçe ürün adı + birim + kategori', status: 'planning' },
      { label: 'Müşteri/Hesap arama',      desc: 'Account ID → ad, segment, bölge filtreli arama', status: 'planning' },
      { label: 'Şirket alias kuralları',   desc: 'DTHY→DANE gibi merge kurallarının UI yönetimi', status: 'planning' },
      { label: 'CSV / Excel export',       desc: 'Filtreli sonuçları indir, geri yükle', status: 'planning' },
    ],
    etaLabel: 'Yakında',
  },
  settings: {
    icon: Settings02Icon,
    accent: '#8b5cf6',
    title: 'Ayarlar',
    tagline: 'Sistem ve hesap tercihleri',
    description: (
      <>
        Kullanıcı tercihleri, varsayılan filtreler ve sistem ayarları.
      </>
    ),
    features: [
      { label: 'Profil & oturum',          desc: 'Hesap detayları, çıkış yap', status: 'done' },
      { label: 'Tema (dark mode)',         desc: 'Açık / koyu / sistem otomatik', status: 'planning' },
      { label: 'Bildirim tercihleri',      desc: 'E-posta özetleri, eşik uyarıları', status: 'planning' },
    ],
    etaLabel: 'Yakında',
  },
}

export function ComingSoonPage({ pageKey }: ComingSoonPageProps) {
  const meta = META[pageKey] || META.data

  return (
    <div className="space-y-4 md:space-y-5">
      {/* Hero — dark navy gradient + ambient animation */}
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
            opacity: 0.5,
          }}
        />
        {/* Accent glow */}
        <motion.div
          aria-hidden="true"
          className="absolute -bottom-32 -right-32 h-80 w-80 rounded-full"
          style={{ background: `radial-gradient(circle, ${meta.accent}30 0%, transparent 65%)` }}
          animate={{ scale: [1, 1.15, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        />
        {/* Gradient top strip */}
        <div
          aria-hidden="true"
          className="h-[3px]"
          style={{ background: `linear-gradient(90deg, ${meta.accent}, #fbbf24)` }}
        />

        <div className="relative px-5 py-8 md:px-8 md:py-10">
          {/* Status pill */}
          <motion.span
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.32 }}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[10.5px] font-extrabold uppercase tracking-wider"
            style={{
              background: 'rgba(251,191,36,0.18)',
              color: '#fcd34d',
              border: '1px solid rgba(251,191,36,0.30)',
              boxShadow: '0 0 18px rgba(240,122,35,0.20)',
            }}
          >
            <HugeiconsIcon icon={Loading03Icon} size={11} strokeWidth={2.3} />
            Yapım Aşamasında · {meta.etaLabel}
          </motion.span>

          <div className="mt-5 flex flex-wrap items-start gap-5">
            {/* Big icon */}
            <motion.div
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.42, delay: 0.08 }}
              className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-white shadow-[0_8px_24px_-6px_rgba(0,0,0,0.30),inset_0_1px_0_rgba(255,255,255,0.20)]"
              style={{ background: `linear-gradient(135deg, ${meta.accent}, #1d4ed8)` }}
            >
              <HugeiconsIcon icon={meta.icon} size={30} strokeWidth={1.7} />
            </motion.div>

            <motion.div
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.42, delay: 0.14 }}
              className="min-w-0 flex-1"
            >
              <h2 className="text-[22px] font-extrabold tracking-tight text-white md:text-[26px]">
                {meta.title}
              </h2>
              <p className="mt-1 text-[11.5px] font-semibold uppercase tracking-wider text-amber-200/85 md:text-[12.5px]">
                {meta.tagline}
              </p>
              <p className="mt-3 max-w-2xl text-[13.5px] leading-relaxed text-slate-200/90 md:text-[14.5px]">
                {meta.description}
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Planlanan özellikler */}
      <section className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.10)]">
        <header className="flex items-center gap-2 border-b border-border/60 px-4 py-3 md:px-5">
          <HugeiconsIcon icon={AiBrain04Icon} size={16} strokeWidth={1.9} color={meta.accent} />
          <div>
            <h3 className="text-[13px] font-bold leading-tight text-foreground">Planlanan Özellikler</h3>
            <p className="mt-0.5 text-[10.5px] font-medium text-muted-foreground">
              Bu sayfada bulacaklarınız (yol haritası özet)
            </p>
          </div>
        </header>
        <ul className="divide-y divide-border/40">
          {meta.features.map((f, i) => (
            <FeatureRow key={f.label} feature={f} delay={i * 0.06} accent={meta.accent} />
          ))}
        </ul>
      </section>

      {/* Geri bildirim CTA */}
      <section
        className="rounded-2xl border border-border/60 px-5 py-4 md:px-6 md:py-5"
        style={{
          background: 'linear-gradient(135deg, rgba(240,122,35,0.05), rgba(10,61,143,0.04))',
        }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <HugeiconsIcon icon={FlashIcon} size={18} strokeWidth={1.9} color="#f07a23" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold text-foreground">Önceliklendirmeye yardım et</div>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
              Hangi özelliği önce görmek istiyorsun? Geri bildiriminle yol haritasını şekillendirebiliriz.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}

function FeatureRow({ feature, delay, accent }: { feature: FeatureItem; delay: number; accent: string }) {
  const tone = feature.status === 'done'
    ? { label: 'Hazır',         color: '#047857', bg: 'rgba(16,185,129,0.12)', border: 'rgba(4,120,87,0.22)', icon: CheckmarkBadge02Icon }
    : feature.status === 'in-progress'
      ? { label: 'Yapım sürüyor', color: '#b45309', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.25)', icon: Loading03Icon }
      : { label: 'Planlandı',    color: '#64748b', bg: 'rgba(100,116,139,0.10)', border: 'rgba(100,116,139,0.22)', icon: Loading03Icon }

  return (
    <motion.li
      initial={{ y: 6, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.32, delay }}
      className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/30 md:px-5"
    >
      <span
        className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md"
        style={{ background: `${accent}12`, color: accent }}
      >
        <HugeiconsIcon icon={tone.icon} size={13} strokeWidth={2.2} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] font-bold text-foreground">{feature.label}</span>
          <span
            className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider"
            style={{ background: tone.bg, borderColor: tone.border, color: tone.color }}
          >
            {tone.label}
          </span>
        </div>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
          {feature.desc}
        </p>
      </div>
    </motion.li>
  )
}
