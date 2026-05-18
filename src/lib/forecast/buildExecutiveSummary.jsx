// ════════════════════════════════════════════════════════════════════════════
// buildExecutiveSummary — snapshot'tan executive narrative üretir
// ────────────────────────────────────────────────────────────────────────────
// Yönetici 1 paragraf okuyup ne durumda olduğunu anlamalı.
// Anahtar kelimeler <H> gradient highlight ile vurgulanır + hover'da detaylı
// tooltip açılır (trader scope, YoY breakdown, model detay, konsantrasyon vb).
// ════════════════════════════════════════════════════════════════════════════

import { Fragment } from 'react'
import { H } from '../../components/ExecutiveHighlight'
import { fmtTon, fmtPct, fmtNumber } from './format.js'

// ────────────────────────────────────────────────────────────────────────────
// Tooltip içerik fabrikaları — her highlight için zengin metin üretir
// ────────────────────────────────────────────────────────────────────────────

function TraderTooltip({ snapshot }) {
  const scope = snapshot.filterScope === 'ana' ? 'Ana Trader' : 'Alt Trader'
  return (
    <div>
      <div className="text-[12.5px] font-extrabold text-white">{snapshot.traderName}</div>
      <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
        {snapshot.traderCode}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-200/85">
        <div className="opacity-70">Kapsam</div>
        <div className="font-semibold text-white">{scope}</div>
        {snapshot.filterScope === 'ana' && snapshot.resolvedSubCount > 0 && (
          <>
            <div className="opacity-70">Alt Trader</div>
            <div className="font-semibold text-white">{snapshot.resolvedSubCount} adet</div>
          </>
        )}
        <div className="opacity-70">Toplam İşlem</div>
        <div className="font-semibold text-white tabular-nums">{fmtNumber(snapshot.recordCount)}</div>
        <div className="opacity-70">Müşteri</div>
        <div className="font-semibold text-white tabular-nums">{fmtNumber(snapshot.uniqueCustomers)}</div>
        <div className="opacity-70">Ürün</div>
        <div className="font-semibold text-white tabular-nums">{fmtNumber(snapshot.uniqueProducts)}</div>
      </div>
    </div>
  )
}

function SubTraderTooltip({ snapshot }) {
  return (
    <div>
      <div className="text-[12.5px] font-extrabold text-white">Alt Trader Kapsamı</div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-200/85">
        <strong className="text-amber-200">{snapshot.resolvedSubCount} alt trader</strong> birleştirilerek tek bir konsolide analiz yapıldı.
        Ana trader filtresi aktif olduğu için tüm alt-trader hareketleri toplamda gösteriliyor.
      </p>
    </div>
  )
}

function YoyTooltip({ snapshot }) {
  const positive = snapshot.yoy >= 0
  const allTime = snapshot.totalQtyAllTime
  const last12 = snapshot.totalQtyLast12
  const prior = last12 / (1 + snapshot.yoy / 100)
  const delta = last12 - prior
  return (
    <div>
      <div className="text-[12.5px] font-extrabold text-white">Yıllık Değişim (YoY)</div>
      <div
        className="mt-0.5 text-[10px] font-bold uppercase tracking-wider"
        style={{ color: positive ? '#6ee7b7' : '#fb7185' }}
      >
        {positive ? 'Pozitif büyüme' : 'Negatif daralma'}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-200/85">
        <div className="opacity-70">Son 12 ay</div>
        <div className="font-semibold tabular-nums text-white">{fmtTon(last12)}</div>
        <div className="opacity-70">Önceki 12 ay</div>
        <div className="font-semibold tabular-nums text-white">{fmtTon(prior)}</div>
        <div className="opacity-70">Fark</div>
        <div
          className="font-semibold tabular-nums"
          style={{ color: positive ? '#6ee7b7' : '#fb7185' }}
        >
          {delta >= 0 ? '+' : ''}{fmtTon(Math.abs(delta))}
        </div>
        <div className="opacity-70">Tüm zaman</div>
        <div className="font-semibold tabular-nums text-white">{fmtTon(allTime)}</div>
      </div>
    </div>
  )
}

function CharacterTooltip({ snapshot }) {
  const char = String(snapshot.character || '')
  const intermit = snapshot.intermittenceIndex
  const activeMonths = intermit != null ? Math.round(intermit * (snapshot.historyKeys?.length || 0)) : null
  const totalMonths = snapshot.historyKeys?.length || 0
  const isStable = char.toLowerCase().includes('stabil')
  const isErratic = char.toLowerCase().includes('düzensiz')
  const explanation = isStable
    ? 'Her ayda satış var, yıllık ritim güçlü. Holt-Winters / STL+ETS gibi sezonsal modeller en iyi sonucu verir.'
    : isErratic
      ? 'Aylık satışlar değişken ama tamamen kesilmiyor. Theta veya Outlier STL+ETS gibi outlier-toleranslı modeller önerilir.'
      : 'Bazı aylarda hiç satış yok (lumpy/intermittent). Croston veya Seasonal Naive gibi fasılalı modeller daha uygundur.'

  return (
    <div>
      <div className="text-[12.5px] font-extrabold text-white">Satış Karakteri</div>
      <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
        {char}
      </div>
      {activeMonths != null && totalMonths > 0 && (
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-200/85">
          <div className="opacity-70">Aktif Ay</div>
          <div className="font-semibold tabular-nums text-white">{activeMonths}/{totalMonths} ay</div>
          <div className="opacity-70">Aktivite Oranı</div>
          <div className="font-semibold tabular-nums text-white">
            {intermit != null ? `%${(intermit * 100).toFixed(0)}` : '—'}
          </div>
        </div>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-slate-200/85">{explanation}</p>
    </div>
  )
}

function HorizonTooltip({ snapshot }) {
  return (
    <div>
      <div className="text-[12.5px] font-extrabold text-white">Tahmin Ufku</div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-200/85">
        Önümüzdeki <strong className="text-amber-200">{snapshot.horizon} ay</strong> için aylık tahmin üretildi.
        Geçmiş <strong className="text-amber-200">{snapshot.historyKeys?.length || 0} ay</strong> tarihçesi ile 8 forecast modeli koşuldu, en iyi MAPE'ye sahip olan Best Fit seçildi.
      </p>
    </div>
  )
}

function ForecastTooltip({ snapshot }) {
  const total = snapshot.forecastTotal
  const monthly = snapshot.horizon > 0 ? total / snapshot.horizon : 0
  return (
    <div>
      <div className="text-[12.5px] font-extrabold text-white">Toplam Tahmin</div>
      <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
        Sonraki {snapshot.horizon} Ay
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-200/85">
        <div className="opacity-70">Toplam</div>
        <div className="font-semibold tabular-nums text-white">{fmtTon(total)}</div>
        <div className="opacity-70">Aylık Ortalama</div>
        <div className="font-semibold tabular-nums text-white">{fmtTon(monthly)}</div>
        <div className="opacity-70">Aktif Model</div>
        <div className="font-semibold text-white">{labelForModel(snapshot.bestModelId)}</div>
      </div>
    </div>
  )
}

function MapeTooltip({ snapshot }) {
  const mape = snapshot.bestModelMape
  const grade = mape == null
    ? 'Hesaplanmadı'
    : mape < 15 ? 'Çok iyi (yüksek güven)'
    : mape < 30 ? 'İyi (orta güven)'
    : mape < 60 ? 'Orta (düşük güven)'
    : 'Zayıf (yüksek belirsizlik)'
  return (
    <div>
      <div className="text-[12.5px] font-extrabold text-white">Model Hata Payı (MAPE)</div>
      <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
        ±%{mape?.toFixed(1) ?? '—'} · {grade}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-200/85">
        Backtest sırasında modelin gerçek satışlardan ortalama sapması.
        <strong className="text-amber-200"> Düşük MAPE = yüksek doğruluk</strong>.
        15% altı çok iyi, 30% altı iş kararı için yeterli güvendir.
      </p>
    </div>
  )
}

function ConcentrationTooltip({ snapshot }) {
  const top3 = (snapshot.topCustomers || []).slice(0, 3)
  const pct = top3.reduce((s, c) => s + (c.pct || 0), 0)
  const isHigh = pct > 50
  return (
    <div>
      <div className="text-[12.5px] font-extrabold text-white">Müşteri Konsantrasyonu</div>
      <div
        className="mt-0.5 text-[10px] font-bold uppercase tracking-wider"
        style={{ color: isHigh ? '#fcd34d' : '#93c5fd' }}
      >
        Top 3 satışın %{pct.toFixed(0)}'i · {isHigh ? 'Yüksek bağımlılık' : 'Dengeli dağılım'}
      </div>
      <ul className="mt-2 space-y-1 text-[11px] text-slate-200/85">
        {top3.map((c, i) => (
          <li key={c.id} className="flex items-baseline gap-2">
            <span
              className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] font-extrabold text-slate-900"
              style={{ background: ['#fbbf24', '#94a3b8', '#cd7f32'][i] }}
            >
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 truncate font-semibold text-white">
              {c.name && c.name !== c.id ? `${c.id} · ${c.name}` : c.id}
            </span>
            <span className="font-extrabold tabular-nums text-amber-200">%{(c.pct || 0).toFixed(1)}</span>
          </li>
        ))}
      </ul>
      {isHigh && (
        <p className="mt-2 text-[10.5px] italic text-rose-300/90">
          Risk uyarısı: tek müşteri kaybı toplam hacmi önemli oranda etkileyebilir.
        </p>
      )}
    </div>
  )
}

function labelForModel(id) {
  const M = {
    hw: 'Holt-Winters',
    stl: 'STL+ETS',
    stlOut: 'Outlier STL+ETS',
    theta: 'Theta',
    holtLin: "Holt's Linear",
    snaive: 'Seasonal Naive',
    croston: 'Croston',
    ma3: 'Moving Avg',
  }
  return M[id] || id || '—'
}

// ────────────────────────────────────────────────────────────────────────────
// Ana üretici — snapshot → JSX dizisi
// ────────────────────────────────────────────────────────────────────────────
export function buildExecutiveSummary(snapshot) {
  if (!snapshot) return null

  const parts = []

  // ── 1) Açılış: trader adı + scope ──
  parts.push(
    <Fragment key="opener">
      <H tone="name" tooltip={<TraderTooltip snapshot={snapshot} />}>
        {snapshot.traderName}
      </H>
      {snapshot.filterScope === 'ana' && snapshot.resolvedSubCount > 1 && (
        <>
          {' (Ana Trader · '}
          <H tone="info" tooltip={<SubTraderTooltip snapshot={snapshot} />}>
            {snapshot.resolvedSubCount} alt trader
          </H>
          {')'}
        </>
      )}
      {snapshot.filterScope === 'ana' && snapshot.resolvedSubCount <= 1 && <> (Ana Trader)</>}
    </Fragment>
  )

  // ── 2) YoY büyüme + karakter ──
  if (snapshot.yoy != null) {
    const tone = snapshot.yoy >= 0 ? 'pos' : 'neg'
    parts.push(
      <Fragment key="yoy">
        {' son 12 ayda '}
        <H tone={tone} tooltip={<YoyTooltip snapshot={snapshot} />}>
          {fmtPct(snapshot.yoy)}
        </H>
        {snapshot.yoy >= 0 ? ' büyüme' : ' daralma'}
      </Fragment>
    )
  } else {
    parts.push(<Fragment key="yoy-empty"> sınırlı tarihçeyle değerlendirildi</Fragment>)
  }

  // ── 3) Karakter (intermittence) ──
  const character = String(snapshot.character || '').toLowerCase()
  const charLabel = character.includes('stabil')
    ? 'stabil aylık akışta'
    : character.includes('düzensiz')
      ? 'düzensiz akışta'
      : 'fasılalı/lumpy akışta'
  const charTone = character.includes('stabil') ? 'pos' : 'warn'
  parts.push(
    <Fragment key="character">
      {' ile '}
      <H tone={charTone} tooltip={<CharacterTooltip snapshot={snapshot} />}>
        {charLabel}
      </H>
      {' ilerliyor.'}
    </Fragment>
  )

  // ── 4) Tahmin ──
  parts.push(
    <Fragment key="forecast">
      {' Önümüzdeki '}
      <H tone="info" tooltip={<HorizonTooltip snapshot={snapshot} />}>
        {snapshot.horizon} ay
      </H>
      {' için '}
      <H tone="accent" tooltip={<ForecastTooltip snapshot={snapshot} />}>
        {fmtTon(snapshot.forecastTotal)}
      </H>
      {' tahmin edildi'}
      {snapshot.bestModelMape != null && (
        <>
          {' ('}
          <H tone="info" tooltip={<MapeTooltip snapshot={snapshot} />}>
            ±%{snapshot.bestModelMape.toFixed(1)}
          </H>
          {' MAPE)'}
        </>
      )}
      {'.'}
    </Fragment>
  )

  // ── 5) Konsantrasyon — top 3 müşteri ──
  const top3CustPct = (snapshot.topCustomers || []).slice(0, 3).reduce((s, c) => s + (c.pct || 0), 0)
  if (top3CustPct > 0) {
    const isHigh = top3CustPct > 50
    parts.push(
      <Fragment key="concentration">
        {' Top 3 müşteri toplam payın '}
        <H tone={isHigh ? 'warn' : 'info'} tooltip={<ConcentrationTooltip snapshot={snapshot} />}>
          %{top3CustPct.toFixed(0)}
        </H>
        {"'ünü oluşturuyor"}
        {isHigh ? ' (konsantrasyon riski yüksek).' : '.'}
      </Fragment>
    )
  }

  return parts
}
