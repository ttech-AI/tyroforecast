import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { TyroMark, TyroWordmark } from './TyroLogo'
import { useMsal } from '../lib/forecast/msalContext.jsx'

/* Deterministic PRNG so line layout stays stable across re-renders */
function mulberry32(seed: number) {
  let t = seed >>> 0
  return function () {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

type LineData = {
  top: number
  width: number
  opacity: number
  duration: number
  delay: number
}

function buildLines(count: number, seed: number): LineData[] {
  const rng = mulberry32(seed)
  return Array.from({ length: count }, (_, i) => {
    const center = (count - 1) / 2
    const distFromCenter = Math.abs(i - center) / center // 0 (center) → 1 (edge)
    /* Bell-curve-ish envelope: lines near center are longer */
    const widthBase = (1 - distFromCenter ** 1.6) * 58
    const jitter = rng() * 14 - 4
    return {
      top: 3 + (i / (count - 1)) * 94,
      width: Math.max(3, widthBase + jitter),
      opacity: 0.35 + rng() * 0.55,
      duration: 3 + rng() * 4,
      delay: rng() * 4,
    }
  })
}

export function Login() {
  const { login, enabled } = useMsal()
  const [authBusy, setAuthBusy] = useState(false)
  const [authErr, setAuthErr] = useState<string | null>(null)
  const lines = useMemo(() => buildLines(56, 20260518), [])

  async function handleLogin() {
    console.log('[Login] button clicked. authBusy =', authBusy, '| enabled =', enabled)
    if (authBusy) return
    setAuthErr(null)
    setAuthBusy(true)
    try {
      const acc = await login()
      console.log('[Login] login() returned account =', acc)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[Login] handleLogin caught:', e)
      setAuthErr(msg || 'Giriş başarısız')
    } finally {
      setAuthBusy(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#06080f] text-white">
      {/* Grid background — masked toward the left half */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.07) 1px, transparent 1px),linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px)',
          backgroundSize: '52px 52px',
          maskImage:
            'radial-gradient(ellipse 90% 70% at 25% 50%, black 55%, transparent 100%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 90% 70% at 25% 50%, black 55%, transparent 100%)',
        }}
      />

      {/* Soft ambient glow on the bottom-left, brand orange */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 -left-40 h-[520px] w-[520px] rounded-full opacity-40 blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(240,122,35,0.45) 0%, transparent 70%)',
        }}
      />

      {/* Animated horizontal lines field (left half) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-[62%] sm:w-[58%] lg:w-[52%]"
      >
        {lines.map((line, i) => (
          <motion.span
            key={i}
            className="absolute h-[2px] origin-left rounded-r-full"
            style={{
              top: `${line.top}%`,
              left: 0,
              width: `${line.width}%`,
              background:
                'linear-gradient(90deg, #f07a23 0%, rgba(255,176,113,0.7) 55%, rgba(240,122,35,0) 100%)',
              boxShadow: '0 0 8px rgba(240,122,35,0.35)',
            }}
            initial={{ scaleX: 0.4, opacity: 0 }}
            animate={{
              scaleX: [0.4, 1, 0.55],
              opacity: [line.opacity * 0.2, line.opacity, line.opacity * 0.3],
            }}
            transition={{
              duration: line.duration,
              repeat: Infinity,
              delay: line.delay,
              ease: [0.4, 0, 0.2, 1],
              repeatType: 'mirror',
            }}
          />
        ))}
      </div>

      {/* Header — logo top-left */}
      <header className="relative z-10 flex items-center justify-between py-5 pl-8 pr-5 sm:pl-12 sm:pr-8 lg:pl-20 lg:pr-12">
        <div className="flex items-center gap-3">
          <TyroMark size={34} />
          <TyroWordmark className="!text-[19px] !text-white" />
        </div>
        <span className="hidden items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-white/40 sm:flex">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
          sistem aktif
        </span>
      </header>

      {/* Hero content — anchored to the right */}
      <main className="relative z-10 mx-auto flex min-h-[calc(100svh-92px)] max-w-[1280px] items-center px-5 sm:px-8 lg:px-12">
        <div className="ml-auto w-full max-w-[520px] lg:w-[50%]">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-white/65 backdrop-blur-md"
          >
            <span className="h-1 w-1 rounded-full bg-[#f07a23] shadow-[0_0_8px_rgba(240,122,35,0.8)]" />
            Sales &amp; Operations Forecast
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.08 }}
            className="mt-5 font-[var(--font-display)] text-[clamp(40px,5.4vw,60px)] font-normal leading-[1.02] tracking-[-0.025em]"
          >
            Satışın nabzı,
            <br />
            <span className="bg-gradient-to-r from-[#ffb071] via-[#f07a23] to-[#b85216] bg-clip-text text-transparent">
              gerçek zamanlı.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.16 }}
            className="mt-5 max-w-[460px] text-[16px] leading-[1.6] text-white/65"
          >
            Yapay zeka destekli satış ve operasyon tahmini.
            Her sipariş, her trend, her sapma — kararını veriden alan
            stratejik bir komuta merkezi.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.24 }}
            className="mt-9"
          >
            <motion.button
              type="button"
              onClick={handleLogin}
              disabled={authBusy || !enabled}
              whileHover={!authBusy && enabled ? { scale: 1.02 } : undefined}
              whileTap={!authBusy && enabled ? { scale: 0.985 } : undefined}
              transition={{ type: 'spring', stiffness: 380, damping: 24 }}
              className="group relative inline-flex items-center gap-3 overflow-hidden rounded-md bg-gradient-to-r from-[#f07a23] to-[#b85216] px-5 py-3.5 text-[14px] font-semibold text-white shadow-[0_8px_28px_-8px_rgba(240,122,35,0.6),inset_0_1px_0_rgba(255,255,255,0.25)] transition-shadow hover:shadow-[0_12px_36px_-8px_rgba(240,122,35,0.75),inset_0_1px_0_rgba(255,255,255,0.3)] disabled:cursor-not-allowed disabled:opacity-70"
            >
              <TyroMark size={20} variant="white" />
              <span>
                {authBusy
                  ? 'Yönlendiriliyor…'
                  : !enabled
                    ? 'MSAL yapılandırılmamış'
                    : 'tyroverse ile giriş yap'}
              </span>
              <ArrowRight
                className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                strokeWidth={2.5}
              />
            </motion.button>
            <p className="mt-3 text-[11px] text-white/40">
              Kurumsal şirket hesabınız ile devam edin
            </p>
            {authErr && (
              <div className="mt-3 max-w-md rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2.5">
                <p className="text-[11px] font-semibold text-red-200">
                  Giriş hatası
                </p>
                <p className="mt-0.5 break-words text-[11px] leading-relaxed text-red-200/85">
                  {authErr}
                </p>
                <p className="mt-1.5 text-[10px] text-red-200/55">
                  Detaylı log için tarayıcı konsolunu açın (F12 → Console)
                </p>
              </div>
            )}
          </motion.div>

          {/* Feature mini-list */}
          <motion.ul
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.32 }}
            className="mt-12 grid gap-3 sm:grid-cols-2"
          >
            <Feature title="Anlık dashboard" desc="Operasyonel metrik akışı" />
            <Feature title="Trader bazlı KPI" desc="Satıcı performans takibi" />
            <Feature title="Ürün kırılımı tahmin" desc="SKU bazlı forecast motoru" />
            <Feature title="Senaryo simülasyonu" desc="What-if öngörü modeli" />
          </motion.ul>
        </div>
      </main>

      {/* Footer — classic Tiryaki corporate copyright */}
      <footer className="relative z-10 px-5 pb-6 text-center sm:px-8 lg:px-12">
        <p className="text-[11px] tracking-wide text-white/35">
          © {new Date().getFullYear()} TTECH Business Solutions · TYRO AI · Tüm hakları saklıdır.
        </p>
      </footer>
    </div>
  )
}

function Feature({ title, desc }: { title: string; desc: string }) {
  return (
    <li className="flex items-start gap-3 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2.5 backdrop-blur-sm">
      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#f07a23] shadow-[0_0_6px_rgba(240,122,35,0.7)]" />
      <span className="flex flex-col gap-0.5">
        <span className="text-[13px] font-medium text-white/85">{title}</span>
        <span className="text-[11px] text-white/45">{desc}</span>
      </span>
    </li>
  )
}
