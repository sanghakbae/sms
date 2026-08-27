// 수주 이후 — 계약과 입금.
//
// 왜 필요한가. 파이프라인은 '수주(won)' 에서 끝나지만 실무는 거기서 시작한다.
// 수주액과 실제로 들어온 돈은 다르다 — 계약이 깨지기도 하고, 선금만 들어오고
// 잔금이 몇 달 밀리기도 한다. 수주 즉시 100% 매출로 잡으면 목표 달성률이
// 실제 현금과 어긋난다.
//
// 저장 위치는 딜 문서 안이다(payments 배열).
// 별도 컬렉션으로 빼지 않은 이유 — 입금은 딜 하나에 몇 건 붙지 않고,
// 딜을 고칠 수 있는 사람과 입금을 적을 수 있는 사람이 같기 때문이다.
// 권한을 따로 걸 이유가 없으면 문서를 쪼개지 않는다.

import { isDealWon } from './pipeline.js'

export const UNPAID = 'unpaid'
export const PARTIAL = 'partial'
export const PAID = 'paid'

export const SETTLEMENT = [
  { id: UNPAID, label: '미입금', color: '#e5484d' },
  { id: PARTIAL, label: '부분입금', color: '#f59e0b' },
  { id: PAID, label: '완납', color: '#10b981' },
]

export function settlementLabel(id) {
  return (SETTLEMENT.find((s) => s.id === id) || SETTLEMENT[0]).label
}

export function settlementColor(id) {
  return (SETTLEMENT.find((s) => s.id === id) || SETTLEMENT[0]).color
}

/** 입금 내역. 값이 없거나 모양이 어긋나면 빈 배열로 본다. */
export function paymentsOf(deal) {
  const list = deal?.payments
  if (!Array.isArray(list)) return []
  return list
    .map((p) => ({
      id: String(p?.id || ''),
      date: String(p?.date || ''),
      amount: Number(p?.amount) || 0,
      memo: String(p?.memo || ''),
    }))
    .filter((p) => p.amount > 0)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
}

/** 지금까지 들어온 돈. */
export function paidTotal(deal) {
  return paymentsOf(deal).reduce((s, p) => s + p.amount, 0)
}

/** 아직 못 받은 돈. 초과 입금이면 0. */
export function unpaidAmount(deal) {
  return Math.max(0, (Number(deal?.amount) || 0) - paidTotal(deal))
}

/**
 * 정산 상태.
 * 수주액이 0이면 판단 근거가 없으므로, 입금이 하나라도 있으면 완납으로 본다.
 */
export function settlementOf(deal) {
  const total = Number(deal?.amount) || 0
  const paid = paidTotal(deal)
  if (paid <= 0) return UNPAID
  if (total <= 0 || paid >= total) return PAID
  return PARTIAL
}

/** 완납된 딜인가 — '계약도 끝나고 돈도 다 받은' 상태. */
export function isSettled(deal) {
  return isDealWon(deal) && settlementOf(deal) === PAID
}

/** 마지막 입금일. 없으면 빈 문자열. */
export function lastPaidDate(deal) {
  const list = paymentsOf(deal)
  return list.length ? list[list.length - 1].date : ''
}

/** 입금 항목 id — 배열 안에서만 구분되면 되므로 짧게. */
export function makePaymentId() {
  return `pay_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/* --------------------------------- 거래 목록 --------------------------------- */

/**
 * 수주된 딜 = 거래. 정산 상태와 잔액을 붙여서 돌려준다.
 * 실패로 되돌린 딜은 빠진다(isDealWon 이 lost 플래그를 본다).
 */
export function trades(deals) {
  return (deals || [])
    .filter(isDealWon)
    .map((d) => ({
      ...d,
      paid: paidTotal(d),
      unpaid: unpaidAmount(d),
      settlement: settlementOf(d),
      lastPaidDate: lastPaidDate(d),
    }))
    .sort((a, b) => {
      // 못 받은 돈이 있는 것부터. 그 안에서는 오래된 순 — 밀린 것이 위로 온다.
      if ((a.unpaid > 0) !== (b.unpaid > 0)) return a.unpaid > 0 ? -1 : 1
      const ad = a.closedDate || a.expectedClose || ''
      const bd = b.closedDate || b.expectedClose || ''
      return ad < bd ? -1 : 1
    })
}

/** 거래 요약 — 수주액·입금액·미수금. */
export function tradeSummary(deals) {
  const rows = trades(deals)
  const out = {
    count: rows.length,
    wonAmount: 0,
    paidAmount: 0,
    unpaidAmount: 0,
    settledCount: 0,
    unpaidCount: 0,
  }
  for (const r of rows) {
    out.wonAmount += Number(r.amount) || 0
    out.paidAmount += r.paid
    out.unpaidAmount += r.unpaid
    if (r.settlement === PAID) out.settledCount += 1
    if (r.unpaid > 0) out.unpaidCount += 1
  }
  return out
}

/* -------------------------------- 거래처 이력 -------------------------------- */

/**
 * 한 거래처의 거래 이력.
 * 수주는 최근 순으로, 진행중은 마감 임박 순으로 준다 —
 * 거래처를 열었을 때 '얼마나 팔았고 지금 뭐가 걸려 있나' 가 먼저 보여야 한다.
 */
export function customerHistory(customerId, deals) {
  const mine = (deals || []).filter((d) => d.customerId === customerId)
  const won = mine.filter(isDealWon)
  const lost = mine.filter((d) => d.lost)
  const open = mine.filter((d) => !d.lost && !isDealWon(d))

  const withPay = won
    .map((d) => ({
      ...d,
      paid: paidTotal(d),
      unpaid: unpaidAmount(d),
      settlement: settlementOf(d),
    }))
    .sort((a, b) => {
      const ad = a.closedDate || a.expectedClose || ''
      const bd = b.closedDate || b.expectedClose || ''
      return ad < bd ? 1 : -1 // 최근 수주가 위로
    })

  return {
    won: withPay,
    open: open.sort((a, b) => (a.expectedClose || '9999') < (b.expectedClose || '9999') ? -1 : 1),
    lost,
    dealCount: mine.length,
    wonAmount: withPay.reduce((s, d) => s + (Number(d.amount) || 0), 0),
    paidAmount: withPay.reduce((s, d) => s + d.paid, 0),
    unpaidAmount: withPay.reduce((s, d) => s + d.unpaid, 0),
    openAmount: open.reduce((s, d) => s + (Number(d.amount) || 0), 0),
  }
}
