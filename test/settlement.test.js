import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  PAID, PARTIAL, UNPAID,
  customerHistory, isSettled, lastPaidDate, paidTotal, paymentsOf,
  settlementOf, tradeSummary, trades, unpaidAmount,
} from '../src/lib/settlement.js'

const won = (over = {}) => ({
  id: 'd1', title: 'A', amount: 10000000, stage: 'won', closedDate: '2026-08-01', ...over,
})

test('입금이 없으면 미입금', () => {
  const d = won()
  assert.equal(paidTotal(d), 0)
  assert.equal(settlementOf(d), UNPAID)
  assert.equal(unpaidAmount(d), 10000000)
})

test('일부만 들어오면 부분입금', () => {
  const d = won({ payments: [{ id: 'p1', date: '2026-08-05', amount: 3000000 }] })
  assert.equal(paidTotal(d), 3000000)
  assert.equal(settlementOf(d), PARTIAL)
  assert.equal(unpaidAmount(d), 7000000)
  assert.equal(isSettled(d), false)
})

test('다 들어오면 완납', () => {
  const d = won({ payments: [
    { id: 'p1', date: '2026-08-05', amount: 3000000 },
    { id: 'p2', date: '2026-09-10', amount: 7000000 },
  ] })
  assert.equal(settlementOf(d), PAID)
  assert.equal(unpaidAmount(d), 0)
  assert.equal(isSettled(d), true)
  assert.equal(lastPaidDate(d), '2026-09-10')
})

test('초과 입금이어도 미수금은 음수가 되지 않는다', () => {
  const d = won({ payments: [{ id: 'p1', date: '2026-08-05', amount: 12000000 }] })
  assert.equal(unpaidAmount(d), 0)
  assert.equal(settlementOf(d), PAID)
})

test('금액이 0이거나 모양이 깨진 입금은 버린다', () => {
  const d = won({ payments: [
    { id: 'p1', date: '2026-08-05', amount: 0 },
    { id: 'p2', date: '2026-08-06', amount: 'abc' },
    null,
    { id: 'p3', date: '2026-08-07', amount: 1000000 },
  ] })
  assert.equal(paymentsOf(d).length, 1)
  assert.equal(paidTotal(d), 1000000)
})

test('payments 가 배열이 아니면 빈 목록', () => {
  assert.deepEqual(paymentsOf(won({ payments: 'x' })), [])
  assert.deepEqual(paymentsOf(won()), [])
  assert.deepEqual(paymentsOf(null), [])
})

test('입금은 날짜 순으로 정렬된다', () => {
  const d = won({ payments: [
    { id: 'p2', date: '2026-09-10', amount: 1 },
    { id: 'p1', date: '2026-08-05', amount: 1 },
  ] })
  assert.deepEqual(paymentsOf(d).map((p) => p.id), ['p1', 'p2'])
})

test('실패로 되돌린 딜은 거래가 아니다', () => {
  const d = won({ lost: true, lostReason: '계약 취소' })
  assert.equal(isSettled(d), false)
  assert.equal(trades([d]).length, 0)
})

test('trades: 미수금 있는 것이 위로 온다', () => {
  const paid = won({ id: 'a', closedDate: '2026-01-01', payments: [{ id: 'p', date: '2026-01-02', amount: 10000000 }] })
  const owing = won({ id: 'b', closedDate: '2026-08-01' })
  const rows = trades([paid, owing])
  assert.deepEqual(rows.map((r) => r.id), ['b', 'a'])
})

test('tradeSummary: 수주액·입금액·미수금', () => {
  const rows = [
    won({ id: 'a', amount: 10000000, payments: [{ id: 'p', date: '2026-08-02', amount: 10000000 }] }),
    won({ id: 'b', amount: 5000000, payments: [{ id: 'q', date: '2026-08-03', amount: 2000000 }] }),
    won({ id: 'c', amount: 3000000 }),
  ]
  const s = tradeSummary(rows)
  assert.equal(s.count, 3)
  assert.equal(s.wonAmount, 18000000)
  assert.equal(s.paidAmount, 12000000)
  assert.equal(s.unpaidAmount, 6000000)
  assert.equal(s.settledCount, 1)
  assert.equal(s.unpaidCount, 2)
})

test('customerHistory: 수주·진행·실패를 갈라 담는다', () => {
  const deals = [
    won({ id: 'a', customerId: 'c1', amount: 10000000, payments: [{ id: 'p', date: '2026-08-02', amount: 4000000 }] }),
    { id: 'b', customerId: 'c1', amount: 5000000, stage: 'proposal', expectedClose: '2026-09-30' },
    { id: 'c', customerId: 'c1', amount: 2000000, stage: 'negotiation', lost: true, lostReason: '가격' },
    won({ id: 'd', customerId: 'c2', amount: 1000000 }),
  ]
  const h = customerHistory('c1', deals)
  assert.equal(h.dealCount, 3)
  assert.equal(h.won.length, 1)
  assert.equal(h.open.length, 1)
  assert.equal(h.lost.length, 1)
  assert.equal(h.wonAmount, 10000000)
  assert.equal(h.paidAmount, 4000000)
  assert.equal(h.unpaidAmount, 6000000)
  assert.equal(h.openAmount, 5000000)
})

test('customerHistory: 수주는 최근 순', () => {
  const deals = [
    won({ id: 'old', customerId: 'c1', closedDate: '2025-01-01' }),
    won({ id: 'new', customerId: 'c1', closedDate: '2026-08-01' }),
  ]
  assert.deepEqual(customerHistory('c1', deals).won.map((d) => d.id), ['new', 'old'])
})
