import { test } from 'node:test'
import assert from 'node:assert/strict'

import { DEFAULT_TEAM_NAME, defaultTeamId, memberRows } from '../src/lib/teams.js'

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
