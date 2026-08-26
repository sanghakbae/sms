// 대시보드 집계 — 모두 순수 함수라 test/stats.test.js 로 검증한다.

import { monthKey, todayISO } from './format.js'
import { STAGES, getStage, isWon, isLost, isOpen, stageProbability } from './pipeline.js'

/** 딜이 종료된 월('YYYY-MM'). closedDate 우선, 없으면 expectedClose. */
export function closedMonth(deal) {
  const iso = deal.closedDate || deal.expectedClose || ''
  return iso ? monthKey(iso) : ''
}

/** 이번(주어진) 달에 수주한 딜의 합계 금액과 건수. */
export function monthlyWon(deals, month) {
  const won = deals.filter((d) => isWon(d.stage) && closedMonth(d) === month)
  return {
    amount: won.reduce((s, d) => s + (Number(d.amount) || 0), 0),
    count: won.length,
    deals: won,
  }
}

/** 살아있는(진행중) 파이프라인 요약: 총액·가중 예상매출·건수. */
export function pipelineSummary(deals) {
  const open = deals.filter((d) => isOpen(d.stage))
  let total = 0
  let weighted = 0
  for (const d of open) {
    const amount = Number(d.amount) || 0
    total += amount
    weighted += amount * (stageProbability(d.stage) / 100)
  }
  return { total, weighted, count: open.length }
}

/** 단계별 진행중 딜 개수/금액. STAGES 순서를 유지한다. */
export function stageBreakdown(deals) {
  const map = new Map(STAGES.map((s) => [s.id, { stage: s, count: 0, amount: 0 }]))
  for (const d of deals) {
    const row = map.get(d.stage)
    if (!row) continue
    row.count += 1
    row.amount += Number(d.amount) || 0
  }
  return STAGES.map((s) => map.get(s.id))
}

/** 수주율 = 수주 / (수주 + 실패). 종료된 딜이 없으면 null. */
export function winRate(deals) {
  let won = 0
  let lost = 0
  for (const d of deals) {
    if (isWon(d.stage)) won += 1
    else if (isLost(d.stage)) lost += 1
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
    if (isWon(d.stage) && closedMonth(d) === month) {
      base.wonAmount += amount
      base.wonCount += 1
    } else if (isOpen(d.stage)) {
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
  if (getStage(deal.stage).closed) return false
  return deal.expectedClose < today
}
