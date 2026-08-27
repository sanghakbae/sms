import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  parseInline,
  parseMarkdown,
  safeHref,
  stripMarkdown,
  isBlank,
} from '../src/lib/markdown.js'

/** 인라인 토큰에서 글자만 뽑아 비교하기 쉽게. */
function flat(nodes) {
  return nodes.map((n) => {
    if (n.type === 'text') return n.value
    if (n.type === 'br') return '\n'
    if (n.type === 'code') return `\`${n.value}\``
    if (n.type === 'link') return `<${n.href}|${flat(n.children)}>`
    return `${n.type}(${flat(n.children)})`
  }).join('')
}

/* --------------------------------- 링크 검증 -------------------------------- */

test('safeHref — http/https/mailto 만 통과한다', () => {
  assert.equal(safeHref('https://a.com'), 'https://a.com')
  assert.equal(safeHref('http://a.com'), 'http://a.com')
  assert.equal(safeHref('mailto:a@b.com'), 'mailto:a@b.com')
  assert.equal(safeHref('www.a.com'), 'https://www.a.com')
})

test('safeHref — 스크립트 스킴을 막는다', () => {
  // 이걸 통과시키면 링크 클릭이 곧 실행이 된다.
  assert.equal(safeHref('javascript:alert(1)'), '')
  assert.equal(safeHref('JaVaScRiPt:alert(1)'), '')
  assert.equal(safeHref('data:text/html,<script>'), '')
  assert.equal(safeHref('vbscript:x'), '')
  assert.equal(safeHref(''), '')
  assert.equal(safeHref(null), '')
})

test('위험한 링크는 글자로만 남는다', () => {
  for (const src of [
    '[누르지마](javascript:alert(1))',
    '[누르지마](data:text/html,x)',
    '[누르지마](vbscript:x)',
  ]) {
    const nodes = parseInline(src)
    // 개수가 아니라 '링크가 만들어지지 않았다'가 핵심이다.
    assert.equal(nodes.some((n) => n.type === 'link'), false, src)
    assert.equal(nodes.map((n) => n.value || '').join('').includes('누르지마'), true, src)
  }
})

/* ---------------------------------- 인라인 --------------------------------- */

test('굵게·기울임·취소선', () => {
  assert.equal(flat(parseInline('**굵게**')), 'strong(굵게)')
  assert.equal(flat(parseInline('*기울임*')), 'em(기울임)')
  assert.equal(flat(parseInline('~~취소~~')), 'del(취소)')
})

test('** 를 * 보다 먼저 본다', () => {
  assert.equal(flat(parseInline('**둘**')), 'strong(둘)')
})

test('중첩 서식', () => {
  assert.equal(flat(parseInline('**굵고 *기울고***')), 'strong(굵고 em(기울고))')
})

test('닫히지 않은 기호는 그냥 글자다', () => {
  assert.equal(flat(parseInline('2*3 은 6')), '2*3 은 6')
  assert.equal(flat(parseInline('**안닫힘')), '**안닫힘')
})

test('빈 서식은 서식이 아니다', () => {
  assert.equal(flat(parseInline('****')), '****')
})

test('밑줄은 서식이 아니다 — file_name_here 가 기울어지면 안 된다', () => {
  assert.equal(flat(parseInline('src/lib/_private_.js')), 'src/lib/_private_.js')
})

test('인라인 코드 안에서는 서식을 해석하지 않는다', () => {
  assert.equal(flat(parseInline('`**그대로**`')), '`**그대로**`')
})

test('이스케이프', () => {
  assert.equal(flat(parseInline('\\*별표\\*')), '*별표*')
})

test('링크와 자동 링크', () => {
  assert.equal(flat(parseInline('[무하유](https://muhayu.com)')), '<https://muhayu.com|무하유>')
  assert.equal(flat(parseInline('https://muhayu.com 참고')), '<https://muhayu.com|https://muhayu.com> 참고')
})

test('자동 링크는 문장 끝 마침표를 먹지 않는다', () => {
  const nodes = parseInline('https://muhayu.com.')
  assert.equal(nodes[0].href, 'https://muhayu.com')
  assert.equal(nodes[1].value, '.')
})

/* ----------------------------------- 블록 ---------------------------------- */

test('제목', () => {
  const [b] = parseMarkdown('## 협상 경과')
  assert.equal(b.type, 'heading')
  assert.equal(b.level, 2)
  assert.equal(flat(b.inline), '협상 경과')
})

test('문단 안의 줄바꿈은 유지된다', () => {
  const [b] = parseMarkdown('첫 줄\n둘째 줄')
  assert.equal(b.type, 'paragraph')
  assert.equal(flat(b.inline), '첫 줄\n둘째 줄')
})

test('빈 줄은 문단을 나눈다', () => {
  const blocks = parseMarkdown('앞\n\n뒤')
  assert.equal(blocks.length, 2)
  assert.equal(blocks.every((b) => b.type === 'paragraph'), true)
})

test('인용은 이어지는 줄을 하나로 묶는다', () => {
  const blocks = parseMarkdown('> 한 줄\n> 두 줄')
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].type, 'quote')
  assert.equal(flat(blocks[0].inline), '한 줄\n두 줄')
})

test('불릿 목록', () => {
  const [b] = parseMarkdown('- 하나\n- 둘')
  assert.equal(b.type, 'list')
  assert.equal(b.ordered, false)
  assert.equal(b.items.length, 2)
  assert.equal(b.items[0].checked, null)
})

test('번호 목록', () => {
  const [b] = parseMarkdown('1. 하나\n2. 둘')
  assert.equal(b.ordered, true)
  assert.equal(b.items.length, 2)
})

test('번호 목록과 불릿 목록은 다른 블록으로 끊는다', () => {
  const blocks = parseMarkdown('- 불릿\n1. 번호')
  assert.equal(blocks.length, 2)
  assert.equal(blocks[0].ordered, false)
  assert.equal(blocks[1].ordered, true)
})

test('체크박스 — 체크 여부를 읽는다', () => {
  const [b] = parseMarkdown('- [ ] 안함\n- [x] 함')
  assert.equal(b.items[0].checked, false)
  assert.equal(b.items[1].checked, true)
  assert.equal(flat(b.items[1].inline), '함')
})

test('들여쓰기로 깊이를 잡는다', () => {
  const [b] = parseMarkdown('- 부모\n  - 자식\n    - 손자')
  assert.deepEqual(b.items.map((i) => i.depth), [0, 1, 2])
})

test('코드펜스 안은 통째로 글자다', () => {
  const [b] = parseMarkdown('```\n- 목록 아님\n**굵게 아님**\n```')
  assert.equal(b.type, 'code')
  assert.equal(b.text, '- 목록 아님\n**굵게 아님**')
})

test('닫히지 않은 코드펜스는 끝까지 먹는다', () => {
  const [b] = parseMarkdown('```\n안 닫힘')
  assert.equal(b.type, 'code')
  assert.equal(b.text, '안 닫힘')
})

test('구분선', () => {
  assert.equal(parseMarkdown('---')[0].type, 'hr')
  assert.equal(parseMarkdown('***')[0].type, 'hr')
})

test('빈 입력은 블록이 없다', () => {
  assert.deepEqual(parseMarkdown(''), [])
  assert.deepEqual(parseMarkdown('   \n\n  '), [])
  assert.deepEqual(parseMarkdown(null), [])
})

test('기존 평문 메모는 그대로 문단이 된다', () => {
  // 이미 저장된 185건이 깨지지 않아야 한다.
  const text = '김과장 통화. 예산은 3분기에 잡힌다고 함.\n결정권자는 본부장.'
  const blocks = parseMarkdown(text)
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].type, 'paragraph')
  assert.equal(flat(blocks[0].inline), text)
})

/* --------------------------------- 평문 변환 -------------------------------- */

test('stripMarkdown — 서식을 떼고 한 줄로', () => {
  assert.equal(stripMarkdown('**경쟁사** 가격에서 밀림'), '경쟁사 가격에서 밀림')
  assert.equal(stripMarkdown('- 하나\n- 둘'), '하나 둘')
  assert.equal(stripMarkdown('## 제목\n본문'), '제목 본문')
  assert.equal(stripMarkdown('- [x] 완료'), '완료')
  assert.equal(stripMarkdown('`코드`'), '코드')
  assert.equal(stripMarkdown('> 인용'), '인용')
})

test('stripMarkdown — 링크는 글자만 남긴다', () => {
  assert.equal(stripMarkdown('[무하유](https://muhayu.com)'), '무하유')
  assert.equal(stripMarkdown('[](https://muhayu.com)'), 'https://muhayu.com')
})

test('stripMarkdown — 코드블록은 통째로 사라진다', () => {
  assert.equal(stripMarkdown('앞\n```\n덩어리\n```\n뒤'), '앞 뒤')
})

test('isBlank — 서식 기호만 있으면 비었다고 본다', () => {
  assert.equal(isBlank(''), true)
  assert.equal(isBlank('   \n  '), true)
  assert.equal(isBlank('- \n- '), true)
  assert.equal(isBlank('##'), false)
  assert.equal(isBlank('내용'), false)
})

/* ----------------------------------- 표 ----------------------------------- */

function cells(row) {
  return row.map((c) => flat(c))
}

test('표 — 머리줄 + 구분선 + 본문', () => {
  const [b] = parseMarkdown('| 항목 | 금액 |\n| --- | --- |\n| 선금 | 100 |\n| 잔금 | 200 |')
  assert.equal(b.type, 'table')
  assert.deepEqual(cells(b.head), ['항목', '금액'])
  assert.equal(b.rows.length, 2)
  assert.deepEqual(cells(b.rows[0]), ['선금', '100'])
})

test('표 — 구분선이 없으면 표가 아니다', () => {
  const blocks = parseMarkdown('| 이건 | 표가 아니다 |\n그냥 문장')
  assert.equal(blocks[0].type, 'paragraph')
})

test('표 — 정렬을 읽는다', () => {
  const [b] = parseMarkdown('| a | b | c | d |\n| :--- | ---: | :---: | --- |\n| 1 | 2 | 3 | 4 |')
  assert.deepEqual(b.aligns, ['left', 'right', 'center', ''])
})

test('표 — 칸 수가 모자란 줄은 빈 칸으로 채운다', () => {
  const [b] = parseMarkdown('| a | b | c |\n| --- | --- | --- |\n| 1 |')
  assert.equal(b.rows[0].length, 3)
  assert.deepEqual(cells(b.rows[0]), ['1', '', ''])
})

test('표 — 칸 안에서도 서식이 먹는다', () => {
  const [b] = parseMarkdown('| 항목 |\n| --- |\n| **굵게** |')
  assert.equal(flat(b.rows[0][0]), 'strong(굵게)')
})

test('표 — 이스케이프한 파이프는 글자로', () => {
  const [b] = parseMarkdown('| a |\n| --- |\n| 1 \\| 2 |')
  assert.equal(flat(b.rows[0][0]), '1 | 2')
})

test('표 앞뒤 문단이 섞이지 않는다', () => {
  const blocks = parseMarkdown('앞 문장\n| a | b |\n| --- | --- |\n| 1 | 2 |\n뒤 문장')
  assert.deepEqual(blocks.map((b) => b.type), ['paragraph', 'table', 'paragraph'])
})

test('stripMarkdown — 표는 칸 내용만 남는다', () => {
  assert.equal(stripMarkdown('| 항목 | 금액 |\n| --- | --- |\n| 선금 | 100 |'), '항목 금액 선금 100')
})
