import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  monthlyWon,
  pipelineSummary,
  stageBreakdown,
  winRate,
  ownerLeaderboard,
  targetProgress,
  closedMonth,
} from '../src/lib/stats.js'

const DEALS = [
  { id: '1', title: 'A', amount: 1000000, stage: 'won', closedDate: '2026-08-10', owner: 'u1', ownerEmail: 'kim@muhayu.com', ownerName: '김' },
  { id: '2', title: 'B', amount: 2000000, stage: 'won', closedDate: '2026-07-30', owner: 'u1', ownerEmail: 'kim@muhayu.com', ownerName: '김' },
  { id: '3', title: 'C', amount: 3000000, stage: 'proposal', owner: 'u2', ownerEmail: 'lee@muhayu.com', ownerName: '이' },
  { id: '4', title: 'D', amount: 5000000, stage: 'negotiation', owner: 'u2', ownerEmail: 'lee@muhayu.com', ownerName: '이' },
  { id: '5', title: 'E', amount: 4000000, stage: 'lost', closedDate: '2026-08-01', owner: 'u1', ownerEmail: 'kim@muhayu.com', ownerName: '김' },
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

test('ownerLeaderboard: 이번 달 수주액 기준 정렬', () => {
  const board = ownerLeaderboard(DEALS, '2026-08')
  assert.equal(board[0].key, 'kim@muhayu.com')
  assert.equal(board[0].wonAmount, 1000000)
  const lee = board.find((r) => r.key === 'lee@muhayu.com')
  assert.equal(lee.openAmount, 8000000)
  assert.equal(lee.openCount, 2)
})

test('targetProgress: 달성률(%)과 목표 0 처리', () => {
  assert.equal(targetProgress(5000000, 10000000), 50)
  assert.equal(targetProgress(100, 0), null)
})
