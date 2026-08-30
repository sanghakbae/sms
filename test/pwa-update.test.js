import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const PWA = readFileSync(new URL('../src/pwa.js', import.meta.url), 'utf8')
const BANNER = readFileSync(new URL('../src/components/PwaBanner.jsx', import.meta.url), 'utf8')

test('새 배포는 앱 복귀·온라인 복귀·주기로 다시 확인한다', () => {
  assert.match(PWA, /onRegisteredSW/)
  assert.match(PWA, /if \(initialized\) return/)
  assert.match(PWA, /visibilitychange/)
  assert.match(PWA, /addEventListener\('online', checkForUpdate\)/)
  assert.match(PWA, /setInterval\(checkForUpdate, UPDATE_CHECK_MS\)/)
})

test('업데이트가 준비되면 명확한 알림과 실행 버튼을 보여준다', () => {
  assert.match(BANNER, /role="alert"/)
  assert.match(BANNER, /새 업데이트가 있습니다\./)
  assert.match(BANNER, />업데이트<\/button>/)
  assert.match(BANNER, /onClick=\{applyUpdate\}/)
})
