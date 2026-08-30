import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runWrite, writeErrorMessage } from '../src/lib/guard.js'

test('권한 오류는 무엇이 막았는지 알려준다', () => {
  const msg = writeErrorMessage({ code: 'permission-denied' }, '삭제')
  assert.match(msg, /삭제 권한이 없습니다/)
})

test('연결 문제와 이미 지워진 항목을 구분한다', () => {
  assert.match(writeErrorMessage({ code: 'unavailable' }, '저장'), /연결이 끊겨/)
  assert.match(writeErrorMessage({ code: 'not-found' }), /이미 삭제된/)
})

test('runWrite: 성공하면 true, 실패하면 알리고 false', async () => {
  const said = []
  const notify = (m) => said.push(m)

  assert.equal(await runWrite(notify, '저장', async () => {}), true)
  assert.deepEqual(said, [])

  const err = Object.assign(new Error('nope'), { code: 'permission-denied' })
  assert.equal(await runWrite(notify, '삭제', async () => { throw err }), false)
  assert.equal(said.length, 1)
  assert.match(said[0], /삭제 권한이 없습니다/)
})
