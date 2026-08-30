import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LEVEL_ADMIN, LEVEL_ALL, LEVEL_LEAD, canSeeMenu, normalizeAccess } from '../src/lib/menus.js'

const 관리자 = { isAdmin: true, role: 'member', teamId: '' }
const 팀장 = { isAdmin: false, role: 'leader', teamId: 'A' }
const 팀원 = { isAdmin: false, role: 'member', teamId: 'A' }
const 미배정 = { isAdmin: false, role: 'member', teamId: '' }

test('관리자는 어떻게 잠가도 전부 본다', () => {
  const 전부잠금 = { deals: LEVEL_ADMIN, customers: LEVEL_ADMIN, trades: LEVEL_ADMIN }
  for (const id of ['deals', 'customers', 'trades', 'team', 'settings']) {
    assert.equal(canSeeMenu(관리자, id, 전부잠금), true, id)
  }
})

test('팀장 이상으로 잠그면 팀원은 못 본다', () => {
  const a = { trades: LEVEL_LEAD }
  assert.equal(canSeeMenu(팀장, 'trades', a), true)
  assert.equal(canSeeMenu(팀원, 'trades', a), false)
})

test('관리자 전용으로 잠그면 팀장도 못 본다', () => {
  const a = { trades: LEVEL_ADMIN }
  assert.equal(canSeeMenu(팀장, 'trades', a), false)
  assert.equal(canSeeMenu(팀원, 'trades', a), false)
})

test('미배정은 전원 공개 메뉴도 못 본다', () => {
  assert.equal(canSeeMenu(미배정, 'deals', { deals: LEVEL_ALL }), false)
})

test('대시보드와 설정은 잠금 설정을 무시한다', () => {
  // 스스로 갇히는 것을 막는 안전장치.
  const 이상한설정 = { dashboard: LEVEL_ADMIN, settings: LEVEL_ALL }
  const n = normalizeAccess(이상한설정)
  assert.equal(n.dashboard, LEVEL_ALL)
  assert.equal(n.settings, LEVEL_ADMIN)
  assert.equal(canSeeMenu(팀원, 'dashboard', 이상한설정), true)
  assert.equal(canSeeMenu(팀원, 'settings', 이상한설정), false)
})

test('모르는 값은 기본값으로 되돌린다', () => {
  assert.equal(normalizeAccess({ trades: '아무말' }).trades, LEVEL_ALL)
  assert.equal(normalizeAccess({}).team, LEVEL_LEAD)
  assert.equal(normalizeAccess(null).deals, LEVEL_ALL)
})
