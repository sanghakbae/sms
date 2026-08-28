// accounts.js 와 firestore.rules 는 같은 접근 기준을 중복 구현한다.
// 한쪽만 고치면 화면은 열리는데 데이터가 거부되거나 그 반대가 된다.
// 사람이 기억해서 맞추는 대신 여기서 어긋남을 잡는다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { ALLOWED_DOMAINS, BOOTSTRAP_ADMINS } from '../src/lib/accounts.js'

const RULES = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')

/** 규칙 파일에서 주석을 걷어낸다 — 주석 속 예시가 검사에 걸리지 않도록. */
function withoutComments(text) {
  return text.replace(/\/\/[^\n]*/g, '')
}

const CODE = withoutComments(RULES)

/** bootstrapAdmins() 가 돌려주는 이메일 목록을 뽑는다. */
function rulesBootstrapAdmins() {
  const fn = CODE.match(/function\s+bootstrapAdmins\s*\(\)\s*\{([\s\S]*?)\}/)
  assert.ok(fn, 'firestore.rules 에 bootstrapAdmins() 가 없습니다')
  return [...fn[1].matchAll(/'([^']+)'/g)].map((m) => m[1].toLowerCase()).sort()
}

test('기본 관리자 목록이 accounts.js 와 firestore.rules 에서 같다', () => {
  const fromCode = BOOTSTRAP_ADMINS.map((e) => e.toLowerCase()).sort()
  assert.deepEqual(
    rulesBootstrapAdmins(),
    fromCode,
    '기본 관리자가 어긋났습니다. accounts.js 의 BOOTSTRAP_ADMINS 와 ' +
    'firestore.rules 의 bootstrapAdmins() 를 같이 고쳐야 합니다.',
  )
})

test('QA 계정은 기본 관리자 권한을 갖지 않는다', () => {
  assert.equal(BOOTSTRAP_ADMINS.includes('qa@muhayu.com'), false)
})

test('이메일 초대는 관리자만 쓰고 본인 이메일만 읽는다', () => {
  assert.match(CODE, /match\s+\/invites\/\{inviteEmail\}/)
  assert.match(CODE, /allow get: if isAdmin\(\) \|\| \(isMember\(\) && inviteEmail == email\(\)\)/)
  assert.match(CODE, /allow create, update, delete: if isAdmin\(\)/)
  assert.match(CODE, /request\.resource\.data\.teamId == invitedTeamId\(\)/)
})

test('허용 도메인 정책이 두 곳에서 같다', () => {
  const member = CODE.match(/function\s+isMember\s*\(\)\s*\{([\s\S]*?)\n\s{4}\}/)
  assert.ok(member, 'firestore.rules 에 isMember() 가 없습니다')
  const body = member[1]
  const matchers = [...body.matchAll(/matches\('\.\*@([^']+)'\)/g)]
    .map((m) => m[1].replace(/\[\.\]/g, '.').toLowerCase())
    .sort()

  if (ALLOWED_DOMAINS.length === 0) {
    assert.deepEqual(
      matchers, [],
      'accounts.js 는 도메인 제한이 없는데 firestore.rules 는 도메인을 검사합니다. ' +
      '규칙이 더 엄격하면 화면은 열리는데 데이터가 거부됩니다.',
    )
  } else {
    assert.deepEqual(
      matchers,
      ALLOWED_DOMAINS.map((d) => d.toLowerCase()).sort(),
      '허용 도메인이 어긋났습니다. ALLOWED_DOMAINS 와 isMember() 를 같이 고쳐야 합니다.',
    )
  }
})

test('로그인하지 않은 요청을 막는 기본 조건이 살아 있다', () => {
  // 이 조건들이 사라지면 규칙이 통째로 열린다. 실수로 지우는 걸 막는다.
  assert.match(CODE, /request\.auth\s*!=\s*null/, 'isMember() 의 인증 확인이 사라졌습니다')
  assert.match(CODE, /email_verified\s*==\s*true/, '이메일 인증 확인이 사라졌습니다')
  assert.match(CODE, /allow read, write: if false/, '기본 거부(catch-all) 규칙이 사라졌습니다')
})

test('신규 사용자는 설정된 기본 팀으로만 자동 배정할 수 있다', () => {
  assert.match(CODE, /function\s+defaultTeamId\s*\(/, '기본 팀 조회 규칙이 없습니다')
  assert.match(
    CODE,
    /request\.resource\.data\.teamId\s*==\s*defaultTeamId\(\)/,
    '신규 사용자의 자동 팀 배정이 설정된 기본 팀으로 제한되지 않았습니다',
  )
})

test('거래처와 영업현황은 로그인 사용자에게 공유하고 활동은 팀으로 제한한다', () => {
  assert.match(CODE, /match\s+\/customers\/\{id\}[\s\S]*?allow read:\s*if isMember\(\);/)
  assert.match(CODE, /match\s+\/deals\/\{id\}[\s\S]*?allow read:\s*if isMember\(\);/)
  assert.match(
    CODE,
    /match\s+\/activities\/\{id\}[\s\S]*?allow read:\s*if isMember\(\)\s*&&\s*\(isAdmin\(\)\s*\|\|\s*sameTeam\(\)\);/,
  )
})
