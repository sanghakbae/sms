// 대시보드 집계 — 모두 순수 함수라 test/stats.test.js 로 검증한다.

import { monthKey, shiftMonth, todayISO } from './format.js'
import { STAGES, dealProbability, isDealLost, isDealOpen, isDealWon } from './pipeline.js'

/** 딜이 종료된 월('YYYY-MM'). closedDate 우선, 없으면 expectedClose. */
export function closedMonth(deal) {
  const iso = deal.closedDate || deal.expectedClose || ''
  return iso ? monthKey(iso) : ''
}

/** 이번(주어진) 달에 수주한 딜의 합계 금액과 건수. */
export function monthlyWon(deals, month) {
  const won = deals.filter((d) => isDealWon(d) && closedMonth(d) === month)
  return {
    amount: won.reduce((s, d) => s + (Number(d.amount) || 0), 0),
    count: won.length,
    deals: won,
  }
}

/** 살아있는(진행중) 파이프라인 요약: 총액·가중 예상매출·건수. */
export function pipelineSummary(deals) {
  const open = deals.filter((d) => isDealOpen(d))
  let total = 0
  let weighted = 0
  for (const d of open) {
    const amount = Number(d.amount) || 0
    total += amount
    weighted += amount * (dealProbability(d) / 100)
  }
  return { total, weighted, count: open.length }
}

/**
 * 단계별 딜 개수/금액. STAGES 순서를 유지한다.
 * 실패한 딜은 파이프라인에서 빠지고 lostCount/lostAmount 로 따로 센다 —
 * 어느 단계에서 얼마나 깨지는지가 이탈 분석의 핵심이다.
 */
export function stageBreakdown(deals) {
  const map = new Map(STAGES.map((s) => [s.id, { stage: s, count: 0, amount: 0, lostCount: 0, lostAmount: 0 }]))
  for (const d of deals) {
    const row = map.get(d.stage)
    if (!row) continue
    const amount = Number(d.amount) || 0
    if (isDealLost(d)) {
      row.lostCount += 1
      row.lostAmount += amount
    } else {
      row.count += 1
      row.amount += amount
    }
  }
  return STAGES.map((s) => map.get(s.id))
}

/** 수주율 = 수주 / (수주 + 실패). 종료된 딜이 없으면 null. */
export function winRate(deals) {
  let won = 0
  let lost = 0
  for (const d of deals) {
    if (isDealWon(d)) won += 1
    else if (isDealLost(d)) lost += 1
  }
  const closed = won + lost
  return closed === 0 ? null : Math.round((won / closed) * 100)
}

/**
 * 담당자별 실적표. 이번 달 수주액 기준 내림차순.
 * 딜에 저장된 ownerEmail/ownerName 으로 집계한다(없으면 owner uid 로 폴백).
 */
export function ownerLeaderboard(deals, month) {
  const rows = new Map()
  for (const d of deals) {
    const key = d.ownerEmail || d.owner || '?'
    const base = rows.get(key) || {
      key,
      name: d.ownerName || d.ownerEmail || '알수없음',
      wonAmount: 0, wonCount: 0, openAmount: 0, openCount: 0,
    }
    const amount = Number(d.amount) || 0
    if (isDealWon(d) && closedMonth(d) === month) {
      base.wonAmount += amount
      base.wonCount += 1
    } else if (isDealOpen(d)) {
      base.openAmount += amount
      base.openCount += 1
    }
    if (d.ownerName) base.name = d.ownerName
    rows.set(key, base)
  }
  return [...rows.values()].sort((a, b) => b.wonAmount - a.wonAmount || b.openAmount - a.openAmount)
}

/** 목표 대비 달성률(%). 목표가 0이면 null. */
export function targetProgress(wonAmount, targetAmount) {
  const t = Number(targetAmount) || 0
  if (t <= 0) return null
  return Math.round((wonAmount / t) * 100)
}

/**
 * 예상 마감일이 지났는데 아직 종료되지 않은 딜인가.
 * 'YYYY-MM-DD' 문자열끼리 비교한다 — Date 로 바꾸면 UTC 로 해석돼
 * 한국 시간 자정~오전 9시 사이에 하루가 어긋난다.
 */
export function isOverdue(deal, today = todayISO()) {
  if (!deal || !deal.expectedClose) return false
  if (!isDealOpen(deal)) return false
  return deal.expectedClose < today
}

/**
 * 팀원별 현황. 딜·거래처·활동에 남은 담당자 정보(ownerEmail/ownerName/owner)로 모은다.
 * 별도의 사용자 목록이 없으므로 '데이터를 한 번이라도 만든 사람'이 팀원 목록이 된다.
 */
export function teamSummary(deals, customers, activities, month) {
  const rows = new Map()
  const touch = (doc) => {
    const key = doc.ownerEmail || doc.owner || '?'
    if (!rows.has(key)) {
      rows.set(key, {
        key,
        uid: doc.owner || '',
        email: doc.ownerEmail || '',
        name: doc.ownerName || doc.ownerEmail || '알수없음',
        dealCount: 0, wonAmount: 0, wonCount: 0,
        openAmount: 0, openCount: 0, overdueCount: 0, lostCount: 0,
        customerCount: 0, activityCount: 0,
      })
    }
    const row = rows.get(key)
    if (doc.ownerName) row.name = doc.ownerName
    if (doc.owner) row.uid = doc.owner
    if (doc.ownerEmail) row.email = doc.ownerEmail
    return row
  }

  for (const d of deals || []) {
    const row = touch(d)
    row.dealCount += 1
    const amount = Number(d.amount) || 0
    if (isDealWon(d) && closedMonth(d) === month) {
      row.wonAmount += amount
      row.wonCount += 1
    } else if (isDealOpen(d)) {
      row.openAmount += amount
      row.openCount += 1
      if (isOverdue(d)) row.overdueCount += 1
    } else if (isDealLost(d)) {
      row.lostCount += 1
    }
  }
  for (const c of customers || []) touch(c).customerCount += 1
  for (const a of activities || []) touch(a).activityCount += 1

  return [...rows.values()].sort((a, b) => b.wonAmount - a.wonAmount || b.openAmount - a.openAmount)
}

/** 전월 대비 증감률(%). 지난달이 0이면 null(비교 불가). */
export function monthOverMonth(deals, month) {
  const now = monthlyWon(deals, month).amount
  const prev = monthlyWon(deals, shiftMonth(month, -1)).amount
  if (prev <= 0) return null
  return Math.round(((now - prev) / prev) * 100)
}

/** 마감일이 지난 진행중 딜 — 급한 순(오래 지난 순). */
export function overdueDeals(deals, today = todayISO()) {
  return (deals || [])
    .filter((d) => isOverdue(d, today))
    .sort((a, b) => (a.expectedClose < b.expectedClose ? -1 : 1))
}

/** 앞으로 days 일 안에 마감 예정인 진행중 딜 — 금액 큰 순. */
export function closingSoon(deals, days = 14, today = todayISO()) {
  const limit = new Date(`${today}T00:00:00Z`)
  limit.setUTCDate(limit.getUTCDate() + days)
  const limitIso = limit.toISOString().slice(0, 10)
  return (deals || [])
    .filter((d) => isDealOpen(d) && d.expectedClose && d.expectedClose >= today && d.expectedClose <= limitIso)
    .sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0))
}

/**
 * 단계 간 전환율. 각 단계의 '통과 건수'(그 단계 이후로 넘어간 것 포함)를 기준으로
 * 다음 단계로 얼마나 넘어갔는지 본다. 파이프라인 어디서 새는지 보려는 지표다.
 */
export function stageFunnel(deals) {
  const rows = stageBreakdown(deals)
  // 뒤에서부터 누적 — i 단계까지 도달한 딜은 i 이후 단계의 합.
  const reached = []
  let acc = 0
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    acc += rows[i].count
    reached[i] = acc
  }
  return rows.map((r, i) => ({
    ...r,
    reached: reached[i],
    // 다음 단계로 넘어간 비율.
    conversion: i < rows.length - 1 && reached[i] > 0
      ? Math.round((reached[i + 1] / reached[i]) * 100)
      : null,
  }))
}
