import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  monthlyWon,
  pipelineSummary,
  stageBreakdown,
  winRate,
  targetProgress,
  closedMonth,
  isOverdue,
  teamSummary,
  allocationSummary,
  yearlyWon,
} from '../src/lib/stats.js'

const DEALS = [
  { id: '1', title: 'A', amount: 1000000, stage: 'won', closedDate: '2026-08-10', owner: 'u1', ownerEmail: 'kim@muhayu.com', ownerName: '김' },
  { id: '2', title: 'B', amount: 2000000, stage: 'won', closedDate: '2026-07-30', owner: 'u1', ownerEmail: 'kim@muhayu.com', ownerName: '김' },
  { id: '3', title: 'C', amount: 3000000, stage: 'proposal', owner: 'u2', ownerEmail: 'lee@muhayu.com', ownerName: '이' },
  { id: '4', title: 'D', amount: 5000000, stage: 'negotiation', owner: 'u2', ownerEmail: 'lee@muhayu.com', ownerName: '이' },
  { id: '5', title: 'E', amount: 4000000, stage: 'proposal', lost: true, closedDate: '2026-08-01', owner: 'u1', ownerEmail: 'kim@muhayu.com', ownerName: '김' },
]

test('closedMonth: closedDate 우선, 없으면 expectedClose', () => {
  assert.equal(closedMonth({ closedDate: '2026-08-10' }), '2026-08')
  assert.equal(closedMonth({ expectedClose: '2026-09-01' }), '2026-09')
  assert.equal(closedMonth({}), '')
})

test('monthlyWon: 해당 월 수주만 합산', () => {
  const r = monthlyWon(DEALS, '2026-08')
  assert.equal(r.amount, 1000000)
  assert.equal(r.count, 1)
})

test('pipelineSummary: 진행중만, 가중 예상매출은 확률 반영', () => {
  const r = pipelineSummary(DEALS)
  // proposal(3,000,000 * 0.5) + negotiation(5,000,000 * 0.8)
  assert.equal(r.total, 8000000)
  assert.equal(r.count, 2)
  assert.equal(r.weighted, 3000000 * 0.5 + 5000000 * 0.8)
})

test('stageBreakdown: 단계별 건수/금액', () => {
  const rows = stageBreakdown(DEALS)
  const prop = rows.find((r) => r.stage.id === 'proposal')
  assert.equal(prop.count, 1)
  assert.equal(prop.amount, 3000000)
})

test('winRate: 수주/(수주+실패)', () => {
  // 수주 2건, 실패 1건 → 67%
  assert.equal(winRate(DEALS), 67)
  assert.equal(winRate([]), null)
})

test('targetProgress: 달성률(%)과 목표 0 처리', () => {
  assert.equal(targetProgress(5000000, 10000000), 50)
  assert.equal(targetProgress(100, 0), null)
})

test('isOverdue: 마감일이 오늘보다 앞서면 지연', () => {
  const today = '2026-08-27'
  // 어제 마감인 진행중 딜 — 지연이다.
  assert.equal(isOverdue({ stage: 'proposal', expectedClose: '2026-08-26' }, today), true)
  // 오늘 마감은 아직 지연이 아니다.
  assert.equal(isOverdue({ stage: 'proposal', expectedClose: '2026-08-27' }, today), false)
  // 미래는 당연히 아니다.
  assert.equal(isOverdue({ stage: 'proposal', expectedClose: '2026-09-01' }, today), false)
})

test('isOverdue: 종료된 딜과 마감일 없는 딜은 지연이 아니다', () => {
  const today = '2026-08-27'
  assert.equal(isOverdue({ stage: 'won', expectedClose: '2026-08-01' }, today), false)
  assert.equal(isOverdue({ stage: 'proposal', lost: true, expectedClose: '2026-08-01' }, today), false)
  assert.equal(isOverdue({ stage: 'proposal', expectedClose: '' }, today), false)
  assert.equal(isOverdue({ stage: 'proposal' }, today), false)
  assert.equal(isOverdue(null, today), false)
})

test('isOverdue: 한국시간 오전(UTC 날짜가 하루 뒤처질 때)에도 어긋나지 않는다', () => {
  // KST 2026-08-27 08:30 시점. 예전 구현은 UTC 날짜 '2026-08-26' 을 오늘로 봐서
  // 8/26 마감 딜을 지연으로 잡지 못했다.
  const kstToday = '2026-08-27'
  assert.equal(isOverdue({ stage: 'negotiation', expectedClose: '2026-08-26' }, kstToday), true)
})

test('실패는 단계가 아니라 상태다 — 원래 단계에 남고 파이프라인에서는 빠진다', () => {
  const deals = [
    { stage: 'proposal', amount: 1000 },
    { stage: 'proposal', amount: 3000, lost: true },
    { stage: 'negotiation', amount: 2000, lost: true },
  ]
  const rows = stageBreakdown(deals)
  const proposal = rows.find((r) => r.stage.id === 'proposal')
  const negotiation = rows.find((r) => r.stage.id === 'negotiation')

  // 진행중 집계에는 실패가 섞이지 않는다.
  assert.equal(proposal.count, 1)
  assert.equal(proposal.amount, 1000)
  // 실패는 깨진 그 단계에 남는다 — 제안에서도, 협상에서도 실패할 수 있다.
  assert.equal(proposal.lostCount, 1)
  assert.equal(proposal.lostAmount, 3000)
  assert.equal(negotiation.lostCount, 1)

  // 파이프라인 합계에서도 빠진다.
  assert.equal(pipelineSummary(deals).total, 1000)
  assert.equal(pipelineSummary(deals).count, 1)
})

test('수주 단계라도 lost 플래그가 있으면 수주가 아니다', () => {
  const deals = [
    { stage: 'won', amount: 5000, closedDate: '2026-08-05' },
    { stage: 'won', amount: 9000, closedDate: '2026-08-06', lost: true },
  ]
  assert.equal(monthlyWon(deals, '2026-08').amount, 5000)
  assert.equal(monthlyWon(deals, '2026-08').count, 1)
  assert.equal(winRate(deals), 50)
})

test('yearlyWon: 그 해 수주만 합산한다', () => {
  const deals = [
    { stage: 'won', amount: 1000, closedDate: '2026-03-01' },
    { stage: 'won', amount: 2000, closedDate: '2026-11-30' },
    { stage: 'won', amount: 9000, closedDate: '2025-12-31' },
    { stage: 'won', amount: 5000, closedDate: '2026-06-01', lost: true },
  ]
  assert.equal(yearlyWon(deals, '2026').amount, 3000)
  assert.equal(yearlyWon(deals, '2026').count, 2)
  assert.equal(yearlyWon(deals, '2025').amount, 9000)
})

test('teamSummary: 그 해 누적 수주를 담당자별로 센다', () => {
  const deals = [
    { stage: 'won', amount: 1000, closedDate: '2026-08-01', owner: 'u1', ownerEmail: 'a@x.com', ownerName: 'A' },
    { stage: 'won', amount: 3000, closedDate: '2026-02-01', owner: 'u1', ownerEmail: 'a@x.com', ownerName: 'A' },
    { stage: 'won', amount: 7000, closedDate: '2025-02-01', owner: 'u1', ownerEmail: 'a@x.com', ownerName: 'A' },
  ]
  const [a] = teamSummary(deals, [], [], '2026-08')
  assert.equal(a.wonAmount, 1000)       // 이번 달
  assert.equal(a.yearWonAmount, 4000)   // 올해 누적, 작년은 제외
  assert.equal(a.yearWonCount, 2)
})

test('allocationSummary: 미할당·초과·목록 밖 할당을 정확히 센다', () => {
  const team = [
    { key: 'a@x.com', email: 'a@x.com', name: 'A', yearWonAmount: 5000, yearWonCount: 1 },
    { key: 'b@x.com', email: 'b@x.com', name: 'B', yearWonAmount: 0, yearWonCount: 0 },
  ]
  // 팀 목표 10000 중 6000 만 할당 → 4000 미할당
  const under = allocationSummary(team, { 'a@x.com': 4000, 'b@x.com': 2000 }, 10000)
  assert.equal(under.allocated, 6000)
  assert.equal(under.unallocated, 4000)
  assert.equal(under.rows[0].progress, 125)   // 5000 / 4000
  assert.equal(under.rows[1].gap, 2000)

  // 초과 할당은 음수로 나온다.
  const over = allocationSummary(team, { 'a@x.com': 9000, 'b@x.com': 3000 }, 10000)
  assert.equal(over.unallocated, -2000)

  // 팀원 목록에 없는 계정의 할당도 합계에 포함돼야 총액이 맞는다.
  const orphan = allocationSummary(team, { 'a@x.com': 4000, 'gone@x.com': 1000 }, 10000)
  assert.equal(orphan.orphan, 1000)
  assert.equal(orphan.allocated, 5000)
  assert.equal(orphan.unallocated, 5000)
})

test('리드는 검증 전이라 파이프라인 금액과 예상매출에서 빠진다', () => {
  const deals = [
    { stage: 'lead', amount: 1_000_000 },
    { stage: 'qualify', amount: 2_000_000 },
    { stage: 'proposal', amount: 4_000_000 },
  ]
  const r = pipelineSummary(deals)

  // 리드 금액은 total 에 들어가지 않는다 — 검증 안 된 단서까지 더하면 전망이 부풀려진다.
  assert.equal(r.total, 6_000_000)
  assert.equal(r.count, 2)
  assert.equal(r.weighted, 2_000_000 * 0.2 + 4_000_000 * 0.5)

  // 리드는 사라지지 않고 따로 집계된다.
  assert.equal(r.leadTotal, 1_000_000)
  assert.equal(r.leadCount, 1)
  assert.equal(r.openCount, 3)
})

test('검증 단계가 리드와 상담 사이에 들어간다', () => {
  const ids = stageBreakdown([]).map((r) => r.stage.id)
  assert.deepEqual(ids, ['lead', 'qualify', 'contact', 'proposal', 'negotiation', 'won'])
})

test('실패한 리드는 파이프라인·리드 어느 쪽에도 들어가지 않는다', () => {
  const deals = [
    { stage: 'lead', amount: 1_000_000, lost: true },
    { stage: 'lead', amount: 3_000_000 },
  ]
  const r = pipelineSummary(deals)
  assert.equal(r.leadTotal, 3_000_000)
  assert.equal(r.leadCount, 1)
  assert.equal(r.total, 0)
})
