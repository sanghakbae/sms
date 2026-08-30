// iOS 는 글자가 16px 보다 작은 input/select/textarea 에 포커스가 가면
// 화면을 통째로 확대한다. 모달이 autoFocus 로 열리면 그 즉시 튄다.
//
// 이 규칙은 한 번 고쳐도 계속 되살아났다 — 모바일 타이포를 정리하면서
// 입력칸까지 같이 줄이기 때문이다. 그래서 사람 기억이 아니라 여기서 막는다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const CSS = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')

const MIN_PX = 16
const CONTROL = /(^|[\s,>+~])(input|select|textarea)(\s|,|:|\[|\{|$)/

/** 좁은 화면을 대상으로 하는 미디어쿼리 블록만 뽑는다. */
function mobileBlocks(css) {
  const out = []
  const re = /@media\s*\(max-width:\s*(\d+)px\)\s*\{/g
  let m
  while ((m = re.exec(css))) {
    if (Number(m[1]) > 900) continue // 데스크톱 보정은 대상이 아니다
    let depth = 1
    let i = re.lastIndex
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth += 1
      else if (css[i] === '}') depth -= 1
      i += 1
    }
    out.push({ max: Number(m[1]), body: css.slice(re.lastIndex, i - 1) })
  }
  return out
}

/** 블록 안의 '선택자 { 선언 }' 쌍. */
function rules(body) {
  return [...body.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((m) => ({ selector: m[1].trim(), decls: m[2] }))
}

test('좁은 화면에서 입력칸 글자가 16px 아래로 내려가지 않는다', () => {
  const offenders = []
  for (const block of mobileBlocks(CSS)) {
    for (const { selector, decls } of rules(block.body)) {
      if (!CONTROL.test(selector)) continue
      const fs = decls.match(/font-size:\s*([^;]+)/)
      if (!fs) continue
      const raw = fs[1].trim()
      const px = raw.match(/^(\d+(?:\.\d+)?)px/)
      // 변수로 잡은 값은 :root 에서 따로 검사한다.
      if (!px) continue
      if (Number(px[1]) < MIN_PX) {
        offenders.push(`@media(max-width:${block.max}px) ${selector} → ${raw}`)
      }
    }
  }
  assert.deepEqual(
    offenders, [],
    'iOS 가 포커스 시 화면을 확대합니다. 입력칸 글자는 16px 이상이어야 합니다:\n  '
    + offenders.join('\n  '),
  )
})

test('입력칸 전용 변수(--m-font-input)가 16px 이상이다', () => {
  const m = CSS.match(/--m-font-input:\s*(\d+(?:\.\d+)?)px/)
  assert.ok(m, '--m-font-input 변수가 없습니다 — 입력칸 하한이 사라졌습니다')
  assert.ok(
    Number(m[1]) >= MIN_PX,
    `--m-font-input 이 ${m[1]}px 입니다. 16px 아래면 iOS 에서 화면이 확대됩니다.`,
  )
})
