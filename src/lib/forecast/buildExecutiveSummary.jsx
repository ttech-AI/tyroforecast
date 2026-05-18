// ════════════════════════════════════════════════════════════════════════════
// buildExecutiveSummary — snapshot'tan executive narrative üretir
// ────────────────────────────────────────────────────────────────────────────
// Yönetici 1 paragraf okuyup ne durumda olduğunu anlamalı.
// Anahtar kelimeler <H> gradient highlight ile vurgulanır.
// ════════════════════════════════════════════════════════════════════════════

import { Fragment } from 'react'
import { H } from '../../components/ExecutiveHighlight'
import { fmtTon, fmtPct } from './format.js'

// Snapshot → React fragment dizisi (JSX cümleleri)
export function buildExecutiveSummary(snapshot) {
  if (!snapshot) return null

  const parts = []

  // ── 1) Açılış: trader adı + scope ──
  const scopeLabel = snapshot.filterScope === 'ana'
    ? snapshot.resolvedSubCount > 1
      ? <> (Ana Trader · <H tone="info">{snapshot.resolvedSubCount} alt trader</H>)</>
      : <> (Ana Trader)</>
    : null

  parts.push(
    <Fragment key="opener">
      <H tone="name">{snapshot.traderName}</H>
      {scopeLabel}
    </Fragment>
  )

  // ── 2) YoY büyüme + karakter ──
  if (snapshot.yoy != null) {
    const tone = snapshot.yoy >= 0 ? 'pos' : 'neg'
    parts.push(
      <Fragment key="yoy">
        {' son 12 ayda '}
        <H tone={tone}>{fmtPct(snapshot.yoy)}</H>
        {snapshot.yoy >= 0 ? ' büyüme' : ' daralma'}
      </Fragment>
    )
  } else {
    parts.push(<Fragment key="yoy-empty"> sınırlı tarihçeyle değerlendirildi</Fragment>)
  }

  // ── 3) Karakter (intermittence) ──
  const character = String(snapshot.character || '').toLowerCase()
  const charNode = character.includes('stabil')
    ? <H tone="pos">stabil aylık akışta</H>
    : character.includes('düzensiz')
      ? <H tone="warn">düzensiz akışta</H>
      : <H tone="warn">fasılalı/lumpy akışta</H>
  parts.push(<Fragment key="character"> ile {charNode} ilerliyor.</Fragment>)

  // ── 4) Tahmin ──
  parts.push(
    <Fragment key="forecast">
      {' Önümüzdeki '}
      <H tone="info">{snapshot.horizon} ay</H>
      {' için '}
      <H tone="accent">{fmtTon(snapshot.forecastTotal)}</H>
      {' tahmin edildi'}
      {snapshot.bestModelMape != null && (
        <>
          {' ('}
          <H tone="info">±%{snapshot.bestModelMape.toFixed(1)}</H>
          {' MAPE)'}
        </>
      )}
      {'.'}
    </Fragment>
  )

  // ── 5) Konsantrasyon — top 3 müşteri / top 1 şirket ──
  const top3CustPct = (snapshot.topCustomers || []).slice(0, 3).reduce((s, c) => s + (c.pct || 0), 0)
  if (top3CustPct > 0) {
    const isHigh = top3CustPct > 50
    parts.push(
      <Fragment key="concentration">
        {' Top 3 müşteri toplam payın '}
        <H tone={isHigh ? 'warn' : 'info'}>%{top3CustPct.toFixed(0)}</H>
        {"'ünü oluşturuyor"}
        {isHigh ? ' (konsantrasyon riski yüksek).' : '.'}
      </Fragment>
    )
  }

  return parts
}
