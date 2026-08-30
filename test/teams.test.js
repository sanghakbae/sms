import { test } from 'node:test'
import assert from 'node:assert/strict'

import { DEFAULT_TEAM_NAME, canEditDoc, defaultTeamId, memberRows } from '../src/lib/teams.js'

test('신규 사용자의 기본 팀은 배지터다', () => {
  const teams = [
    { id: 'team_other', name: '다른 팀' },
    { id: 'team_baejiteo', name: DEFAULT_TEAM_NAME },
  ]
  assert.equal(defaultTeamId(teams), 'team_baejiteo')
})

test('배지터 팀이 없으면 임의의 팀으로 배정하지 않는다', () => {
  assert.equal(defaultTeamId([{ id: 'team_other', name: '다른 팀' }]), '')
})

test('실적 데이터가 없는 담당자도 0건 행으로 표시한다', () => {
  const rows = memberRows([
    {
      uid: 'member-1',
      email: 'member@example.com',
      name: '배상학',
      teamId: 'team_baejiteo',
    },
  ], [])

  assert.equal(rows.length, 1)
  assert.equal(rows[0].name, '배상학')
  assert.equal(rows[0].teamId, 'team_baejiteo')
  assert.equal(rows[0].wonAmount, 0)
  assert.equal(rows[0].openCount, 0)
})

/* ------------------------- 수정 권한: 같은 팀이면 누구나 ------------------------- */
//
// 영업은 한 거래처를 여러 사람이 같이 맡는다. 만든 사람만 고칠 수 있으면
// 담당자가 자리를 비운 사이 아무도 손대지 못한다.
// firestore.rules 의 canWriteTeamDoc() 과 같은 기준이어야 한다.

test('같은 팀이면 남이 만든 것도 고칠 수 있다', () => {
  const 팀원 = { uid: 'u1', teamId: 'A', role: 'member', isAdmin: false }
  const 남이만든문서 = { owner: 'u2', teamId: 'A' }
  assert.equal(canEditDoc(팀원, 남이만든문서), true)
})

test('다른 팀 것은 못 고친다', () => {
  const 팀원 = { uid: 'u1', teamId: 'A', role: 'member', isAdmin: false }
  assert.equal(canEditDoc(팀원, { owner: 'u2', teamId: 'B' }), false)
})

test('팀이 없으면 자기가 만든 것도 못 고친다', () => {
  const 미배정 = { uid: 'u1', teamId: '', role: 'member', isAdmin: false }
  assert.equal(canEditDoc(미배정, { owner: 'u1', teamId: '' }), false)
})

test('관리자는 팀이 없어도 전부 고친다', () => {
  const 관리자 = { uid: 'a1', teamId: '', role: 'member', isAdmin: true }
  assert.equal(canEditDoc(관리자, { owner: 'u9', teamId: 'B' }), true)
})
