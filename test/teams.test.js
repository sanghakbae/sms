import { test } from 'node:test'
import assert from 'node:assert/strict'

import { DEFAULT_TEAM_NAME, defaultTeamId } from '../src/lib/teams.js'

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
