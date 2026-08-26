// 대시보드 집계 — 모두 순수 함수라 test/stats.test.js 로 검증한다.

import { monthKey, shiftMonth, todayISO, yearKey } from './format.js'
import {
  STAGES, dealProbability, isDealLost, isDealOpen, isDealWon, isPreQualified, isQualified,
} from './pipeline.js'

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

/**
 * 살아있는 파이프라인 요약.
 * total·weighted 는 '검증을 통과한' 딜만 센다 — 리드는 아직 단서라
 * 전망치에 섞이면 예상매출이 부풀려진다. 리드는 lead* 로 따로 돌려준다.
 */
export function pipelineSummary(deals) {
  let total = 0
  let weighted = 0
  let count = 0
  let leadTotal = 0
  let leadCount = 0
  for (const d of deals || []) {
    const amount = Number(d.amount) || 0
    if (isQualified(d)) {
      total += amount
      weighted += amount * (dealProbability(d) / 100)
      count += 1
    } else if (isPreQualified(d)) {
      leadTotal += amount
      leadCount += 1
    }
  }
  return { total, weighted, count, leadTotal, leadCount, openCount: count + leadCount }
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
        yearWonAmount: 0, yearWonCount: 0,
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

  const year = String(month || '').slice(0, 4)
  for (const d of deals || []) {
    const row = touch(d)
    row.dealCount += 1
    const amount = Number(d.amount) || 0
    // 연 목표 대비 진도를 보려면 그 해 누적도 따로 세야 한다.
    if (isDealWon(d) && closedMonth(d).slice(0, 4) === year) {
      row.yearWonAmount += amount
      row.yearWonCount += 1
    }
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

/** 한 해 동안 수주한 금액과 건수. 목표는 연 단위로 잡으므로 이게 기준 지표다. */
export function yearlyWon(deals, year) {
  const won = (deals || []).filter((d) => isDealWon(d) && closedMonth(d).slice(0, 4) === year)
  return {
    amount: won.reduce((s, d) => s + (Number(d.amount) || 0), 0),
    count: won.length,
    deals: won,
  }
}

/** 그 해 1~12월 수주액 시계열. 연 목표가 월별로 어떻게 쌓이는지 보려는 것. */
export function monthlySeries(deals, year) {
  return Array.from({ length: 12 }, (unused, i) => {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`
    const w = monthlyWon(deals, key)
    return { month: key, monthNo: i + 1, amount: w.amount, count: w.count }
  })
}

/** 데이터에 등장하는 연도 목록(내림차순). 올해는 항상 포함한다. */
export function yearsWithData(deals) {
  const set = new Set([yearKey()])
  for (const d of deals || []) {
    const m = closedMonth(d)
    if (m) set.add(m.slice(0, 4))
  }
  return [...set].sort().reverse()
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

/**
 * 영업자별 목표 할당 현황.
 * allocation 은 { 이메일: 금액 } 이고, 팀 목표와의 차이(미할당/초과)도 같이 돌려준다.
 */
export function allocationSummary(team, allocation, teamTarget) {
  const map = allocation || {}
  const rows = (team || []).map((m) => {
    const target = Number(map[m.email]) || 0
    return {
      ...m,
      target,
      progress: targetProgress(m.yearWonAmount, target),
      gap: Math.max(0, target - m.yearWonAmount),
    }
  })
  const allocated = rows.reduce((s, r) => s + r.target, 0)
  // 팀원 목록에 없는 이메일에 남아 있는 할당까지 합산해야 총액이 맞는다.
  const known = new Set(rows.map((r) => r.email))
  const orphan = Object.entries(map)
    .filter(([email]) => !known.has(email))
    .reduce((s, [, v]) => s + (Number(v) || 0), 0)
  const total = allocated + orphan
  return {
    rows,
    allocated: total,
    orphan,
    unallocated: (Number(teamTarget) || 0) - total,
  }
}
