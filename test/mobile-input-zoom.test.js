// 모바일 입력 글자를 10px로 쓰므로 viewport 확대 잠금이 함께 유지돼야 한다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const CSS = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

test('모바일 입력 글자는 10px 규격을 쓴다', () => {
  assert.match(CSS, /--m-font-input:\s*10px/)
  assert.match(CSS, /#root input,[\s\S]*#root textarea\s*\{\s*font-size:\s*var\(--m-ui-text\)\s*!important/)
})

test('10px 입력 포커스가 화면을 확대하지 않도록 viewport를 잠근다', () => {
  assert.match(HTML, /maximum-scale=1/)
  assert.match(HTML, /user-scalable=no/)
})
