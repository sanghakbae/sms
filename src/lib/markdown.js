// 메모·회고에 쓰는 아주 작은 마크다운 파서.
//
// 왜 직접 만들었나 — 저장 형식을 '평문'으로 유지하려고.
// HTML 을 저장하면 화면에 뿌릴 때 innerHTML 이 필요해지고, 로그인만 하면
// 누구나 쓸 수 있는 앱에서 그건 XSS 통로가 된다. 마크다운은 평문이라
// 이미 들어있는 메모가 그대로 유효하고, 렌더링도 React 엘리먼트로만 한다.
//
// 파서는 토큰 트리만 만든다(React 를 모른다) — 그래서 test 로 검증할 수 있다.
// 그리기는 src/components/Markdown.jsx 가 맡는다.
//
// `_기울임_` 은 일부러 지원하지 않는다. file_name_here 처럼 밑줄이 낀 평문이
// 멋대로 기울어지는 쪽이 더 자주 겪는 사고다. 기울임은 *별표* 로만 쓴다.

/* --------------------------------- 링크 검증 --------------------------------- */

// javascript: 같은 스킴을 막는다. 표시만 하는 게 아니라 클릭되는 값이므로
// 화이트리스트로만 통과시킨다.
const SAFE_SCHEME = /^(https?:\/\/|mailto:)/i

/** 링크로 쓸 수 있는 주소인가. 아니면 빈 문자열(=링크로 만들지 않음). */
export function safeHref(raw) {
  const url = String(raw || '').trim()
  if (!url) return ''
  if (SAFE_SCHEME.test(url)) return url
  // www. 로 시작하면 https 를 붙여준다 — 영업 메모에 흔한 형태다.
  if (/^www\./i.test(url)) return `https://${url}`
  return ''
}

/* --------------------------------- 인라인 --------------------------------- */

// 여는 기호와 닫는 기호가 같은 것들. 긴 것을 먼저 봐야 ** 가 * 로 잘리지 않는다.
const WRAPS = [
  { mark: '**', type: 'strong' },
  { mark: '~~', type: 'del' },
  { mark: '*', type: 'em' },
]

const BARE_URL = /^(https?:\/\/|www\.)[^\s<>()[\]]+/i

/**
 * 한 줄(또는 여러 줄)의 인라인 서식을 토큰 트리로.
 * 닫히지 않은 기호는 서식이 아니라 그냥 글자로 남긴다.
 */
export function parseInline(text) {
  const src = String(text || '')
  const out = []
  let buf = ''

  const flush = () => {
    if (buf) { out.push({ type: 'text', value: buf }); buf = '' }
  }

  let i = 0
  while (i < src.length) {
    const rest = src.slice(i)
    const ch = src[i]

    // 줄바꿈은 명시적인 토큰으로 — 문단 안에서 줄을 유지한다.
    if (ch === '\n') {
      flush()
      out.push({ type: 'br' })
      i += 1
      continue
    }

    // 이스케이프: \* 는 별표 그대로.
    if (ch === '\\' && i + 1 < src.length && '*~`[\\'.includes(src[i + 1])) {
      buf += src[i + 1]
      i += 2
      continue
    }

    // 인라인 코드 — 안쪽은 서식을 해석하지 않는다.
    if (ch === '`') {
      const end = src.indexOf('`', i + 1)
      if (end > i + 1) {
        flush()
        out.push({ type: 'code', value: src.slice(i + 1, end) })
        i = end + 1
        continue
      }
    }

    // [글자](주소)
    if (ch === '[') {
      const m = /^\[([^\]]*)\]\(([^)\s]*)\)/.exec(rest)
      if (m) {
        const href = safeHref(m[2])
        const label = m[1] || m[2]
        flush()
        // 주소가 수상하면 링크로 만들지 않고 글자만 남긴다.
        if (href) out.push({ type: 'link', href, children: parseInline(label) })
        else out.push({ type: 'text', value: label })
        i += m[0].length
        continue
      }
    }

    // 맨 주소 자동 링크.
    if (ch === 'h' || ch === 'w' || ch === 'H' || ch === 'W') {
      const m = BARE_URL.exec(rest)
      if (m) {
        // 문장 끝의 마침표·쉼표는 주소에서 뺀다.
        const raw = m[0].replace(/[.,;:!?]+$/, '')
        const href = safeHref(raw)
        if (href) {
          flush()
          out.push({ type: 'link', href, children: [{ type: 'text', value: raw }] })
          i += raw.length
          continue
        }
      }
    }

    // **굵게** ~~취소선~~ *기울임*
    const wrap = WRAPS.find((w) => rest.startsWith(w.mark))
    if (wrap) {
      const inner = findClose(src, i + wrap.mark.length, wrap.mark)
      if (inner > 0) {
        flush()
        out.push({
          type: wrap.type,
          children: parseInline(src.slice(i + wrap.mark.length, inner)),
        })
        i = inner + wrap.mark.length
        continue
      }
    }

    buf += ch
    i += 1
  }

  flush()
  return out
}

/**
 * 닫는 기호 위치. 내용이 비어 있으면(**** 같은) 서식으로 보지 않는다.
 *
 * 같은 기호가 연달아 나오면(***) 뒤쪽부터 가져간다.
 * `**굵고 *기울고***` 에서 ** 가 앞의 두 개를 먹어버리면 안쪽 * 가 짝을 잃는다.
 * 뒤에서 끊어야 남은 한 개가 안쪽 기울임의 닫는 기호가 된다.
 */
function findClose(src, from, mark) {
  const ch = mark[0]
  const n = mark.length
  let i = from
  while (i < src.length) {
    if (src[i] === '\\') { i += 2; continue }
    if (src[i] === ch) {
      let run = 0
      while (i + run < src.length && src[i + run] === ch) run += 1
      if (run >= n) {
        const close = i + run - n
        return close > from ? close : -1
      }
      i += run
      continue
    }
    i += 1
  }
  return -1
}

/* ---------------------------------- 블록 ---------------------------------- */

const RE = {
  fence: /^\s*```/,
  heading: /^(#{1,3})\s+(.*)$/,
  quote: /^>\s?(.*)$/,
  hr: /^\s*([-*_])\s*(\1\s*){2,}$/,
  bullet: /^(\s*)[-*]\s+(.*)$/,
  ordered: /^(\s*)\d+[.)]\s+(.*)$/,
  task: /^(\s*)[-*]\s+\[([ xX])\]\s+(.*)$/,
  // 표 — 한 줄에 | 가 있고, 다음 줄이 구분선(|---|:--:|)이면 표로 본다.
  tableRow: /^\s*\|(.*)\|\s*$/,
  tableSplit: /^\s*\|(\s*:?-{1,}:?\s*\|)+\s*$/,
}

/** '| a | b |' 한 줄을 칸 배열로. 이스케이프한 \| 는 글자로 남긴다. */
function splitCells(line) {
  const inner = RE.tableRow.exec(line)?.[1] ?? ''
  const cells = []
  let buf = ''
  for (let i = 0; i < inner.length; i += 1) {
    if (inner[i] === '\\' && inner[i + 1] === '|') { buf += '|'; i += 1; continue }
    if (inner[i] === '|') { cells.push(buf.trim()); buf = ''; continue }
    buf += inner[i]
  }
  cells.push(buf.trim())
  return cells
}

/** 구분선에서 칸별 정렬을 읽는다. :--- 왼쪽, ---: 오른쪽, :---: 가운데. */
function alignsOf(line) {
  return splitCells(line).map((c) => {
    const left = c.startsWith(':')
    const right = c.endsWith(':')
    if (left && right) return 'center'
    if (right) return 'right'
    if (left) return 'left'
    return ''
  })
}

/** 들여쓰기 칸수 → 깊이. 2칸(또는 탭 1개)을 한 단계로 본다. 최대 2단계. */
function depthOf(indent) {
  const spaces = String(indent || '').replace(/\t/g, '  ').length
  return Math.min(2, Math.floor(spaces / 2))
}

/**
 * 마크다운 텍스트를 블록 토큰 배열로.
 * 지원: 제목(#~###) · 인용(>) · 구분선 · 불릿/번호/체크박스 목록 ·
 *       코드펜스(```) · 문단.
 */
export function parseMarkdown(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n')
  const blocks = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // 빈 줄은 블록 경계.
    if (!line.trim()) { i += 1; continue }

    // ``` 코드펜스 — 닫는 줄이 없으면 끝까지.
    if (RE.fence.test(line)) {
      const body = []
      i += 1
      while (i < lines.length && !RE.fence.test(lines[i])) { body.push(lines[i]); i += 1 }
      if (i < lines.length) i += 1 // 닫는 ``` 소비
      blocks.push({ type: 'code', text: body.join('\n') })
      continue
    }

    if (RE.hr.test(line)) {
      blocks.push({ type: 'hr' })
      i += 1
      continue
    }

    const heading = RE.heading.exec(line)
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1].length,
        inline: parseInline(heading[2].trim()),
      })
      i += 1
      continue
    }

    // 인용 — 이어지는 > 줄을 하나로 묶는다.
    if (RE.quote.test(line)) {
      const body = []
      while (i < lines.length) {
        const m = RE.quote.exec(lines[i])
        if (!m) break
        body.push(m[1])
        i += 1
      }
      blocks.push({ type: 'quote', inline: parseInline(body.join('\n')) })
      continue
    }

    // 표 — 머리줄 다음 줄이 구분선일 때만 표로 본다.
    // 구분선이 없으면 그냥 | 가 들어간 평범한 문장이다.
    if (RE.tableRow.test(line) && i + 1 < lines.length && RE.tableSplit.test(lines[i + 1])) {
      const head = splitCells(line)
      const aligns = alignsOf(lines[i + 1])
      i += 2
      const rows = []
      while (i < lines.length && RE.tableRow.test(lines[i]) && !RE.tableSplit.test(lines[i])) {
        rows.push(splitCells(lines[i]))
        i += 1
      }
      const width = Math.max(head.length, ...rows.map((r) => r.length), 1)
      // 칸 수가 안 맞는 줄은 버리지 않고 빈 칸으로 채운다 —
      // 손으로 쓰다 보면 | 하나쯤 빠뜨리는데 그때 표가 통째로 사라지면 당황스럽다.
      const pad = (cells) => Array.from({ length: width }, (unused, k) => parseInline(cells[k] || ''))
      blocks.push({
        type: 'table',
        aligns: Array.from({ length: width }, (unused, k) => aligns[k] || ''),
        head: pad(head),
        rows: rows.map(pad),
      })
      continue
    }

    // 목록 — 불릿/번호/체크박스가 이어지는 동안 한 블록으로.
    // 번호 목록과 불릿 목록이 붙어 있으면 서로 다른 블록으로 끊는다.
    const first = listItem(line)
    if (first) {
      const items = []
      const ordered = first.ordered
      while (i < lines.length) {
        const it = listItem(lines[i])
        if (!it || it.ordered !== ordered) break
        items.push({ inline: parseInline(it.text), checked: it.checked, depth: it.depth })
        i += 1
      }
      blocks.push({ type: 'list', ordered, items })
      continue
    }

    // 문단 — 빈 줄이나 다른 블록이 나올 때까지.
    const para = []
    while (i < lines.length) {
      const l = lines[i]
      if (!l.trim() || RE.fence.test(l) || RE.hr.test(l)
        || RE.heading.test(l) || RE.quote.test(l) || listItem(l)) break
      // 표의 머리줄에 닿으면 문단을 끊는다.
      if (RE.tableRow.test(l) && RE.tableSplit.test(lines[i + 1] || '')) break
      para.push(l)
      i += 1
    }
    blocks.push({ type: 'paragraph', inline: parseInline(para.join('\n')) })
  }

  return blocks
}

/** 목록 한 줄 해석. 목록이 아니면 null. */
function listItem(line) {
  const task = RE.task.exec(line)
  if (task) {
    return {
      ordered: false,
      depth: depthOf(task[1]),
      checked: task[2].toLowerCase() === 'x',
      text: task[3],
    }
  }
  const bullet = RE.bullet.exec(line)
  if (bullet) return { ordered: false, depth: depthOf(bullet[1]), checked: null, text: bullet[2] }
  const ordered = RE.ordered.exec(line)
  if (ordered) return { ordered: true, depth: depthOf(ordered[1]), checked: null, text: ordered[2] }
  return null
}

/* --------------------------------- 평문 변환 -------------------------------- */

/**
 * 서식 기호를 떼고 한 줄 평문으로.
 * 카드처럼 좁은 자리에서는 마크다운을 그리는 대신 이걸 쓴다
 * (버튼 안에 목록·제목 같은 블록 요소를 넣을 수 없다).
 */
export function stripMarkdown(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')       // 코드블록 통째로
    .replace(/`([^`]*)`/g, '$1')            // 인라인 코드
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\(([^)\s]*)\)/g, (m, label, url) => label || url)
    .replace(/^\s*```.*$/gm, ' ')
    .replace(/^\s*#{1,3}\s+/gm, '')         // 제목 기호
    .replace(/^\s*>\s?/gm, '')              // 인용 기호
    .replace(/^\s*([-*_])\s*(\1\s*){2,}$/gm, ' ') // 구분선
    .replace(/^\s*\|(\s*:?-{1,}:?\s*\|)+\s*$/gm, ' ')  // 표 구분선
    .replace(/\|/g, ' ')                                 // 표 칸 구분
    .replace(/^(\s*)[-*]\s+\[[ xX]\]\s+/gm, '')   // 체크박스
    .replace(/^(\s*)[-*]\s+/gm, '')          // 불릿
    .replace(/^(\s*)\d+[.)]\s+/gm, '')       // 번호
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/~~([^~]*)~~/g, '$1')
    .replace(/\*([^*]*)\*/g, '$1')
    .replace(/\\([*~`[\\])/g, '$1')          // 이스케이프 해제
    .replace(/\s+/g, ' ')
    .trim()
}

/** 내용이 실질적으로 비었나(서식 기호만 있는 경우 포함). */
export function isBlank(text) {
  return stripMarkdown(text) === ''
}
