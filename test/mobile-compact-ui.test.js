import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const CSS = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

test('모바일 밀집 화면의 글자 규격은 한 곳에서 정의한다', () => {
  assert.match(CSS, /--m-ui-text:\s*10px/)
  assert.match(CSS, /--m-button-text:\s*10\.5px/)
  assert.match(CSS, /--m-modal-title:\s*12px/)
  assert.match(CSS, /--m-compact-pad-y:\s*4px/)
  assert.match(CSS, /--m-compact-pad-x:\s*7px/)
})

test('검색 입력과 추가 버튼은 강제 높이 없이 같은 박스 모델을 쓴다', () => {
  const rule = CSS.match(/\.deals > \.toolbar \.search,[\s\S]*?\.admin-add\.team-create button\s*\{([^}]*)\}/)
  assert.ok(rule, '모바일 검색·추가 버튼 공통 규칙이 없습니다')
  assert.match(rule[1], /height:\s*auto/)
  assert.match(rule[1], /min-height:\s*auto/)
  assert.match(rule[1], /padding:\s*var\(--m-compact-pad-y\) var\(--m-compact-pad-x\)/)
  assert.match(rule[1], /font-size:\s*var\(--m-button-text\)/)
  assert.match(rule[1], /line-height:\s*1\.2/)
})

test('모든 모바일 셀렉트는 10px 글자와 자연 높이를 쓴다', () => {
  const rule = CSS.match(/#root select\s*\{([^}]*)\}/)
  assert.ok(rule, '모바일 셀렉트 공통 규칙이 없습니다')
  assert.match(rule[1], /height:\s*auto\s*!important/)
  assert.match(rule[1], /min-height:\s*auto\s*!important/)
  assert.match(rule[1], /padding-top:\s*var\(--m-compact-pad-y\)\s*!important/)
  assert.match(rule[1], /padding-bottom:\s*var\(--m-compact-pad-y\)\s*!important/)
  assert.match(rule[1], /font-size:\s*var\(--m-ui-text\)\s*!important/)
  assert.match(rule[1], /line-height:\s*1\.2/)
})

test('PC 입력 계열은 모두 12px이고 모바일에서는 모두 10px이다', () => {
  assert.match(CSS, /#root input,\s*\n#root select,\s*\n#root textarea\s*\{\s*font-size:\s*12px\s*!important/)
  assert.match(CSS, /@media \(max-width:\s*719px\)[\s\S]*#root input,\s*\n\s*#root select,\s*\n\s*#root textarea\s*\{\s*font-size:\s*var\(--m-ui-text\)\s*!important/)
})

test('연 매출목표 입력 행은 모바일에서 화면 밖으로 넘치지 않는다', () => {
  const mobile = CSS.slice(CSS.lastIndexOf('@media (max-width: 719px)'))
  const row = mobile.match(/\.target-form-row\s*\{([^}]*)\}/)
  const button = mobile.match(/\.target-save\s*\{([^}]*)\}/)
  assert.ok(row, '모바일 연 매출목표 행 규칙이 없습니다')
  assert.ok(button, '모바일 목표 저장 버튼 규칙이 없습니다')
  assert.match(row[1], /grid-template-columns:\s*minmax\(0, 1fr\)/)
  assert.match(button[1], /width:\s*100%/)
  assert.match(button[1], /min-width:\s*0/)
  assert.match(button[1], /margin-top:\s*0/)
})

test('10px 입력 화면은 모바일 자동 확대를 막는 viewport와 함께 쓴다', () => {
  assert.match(HTML, /maximum-scale=1/)
  assert.match(HTML, /user-scalable=no/)
  assert.match(CSS, /#root \.modal\.deal-form-modal[\s\S]*font-size:\s*var\(--m-ui-text\)/)
  assert.match(CSS, /#root \.modal\.customer-form-modal \.modal-head h2[\s\S]*font-size:\s*var\(--m-modal-title\)/)
})
