// 메모·회고 입력칸. 마크다운을 평문으로 저장한다(형식은 lib/markdown.js 참고).
//
// 값 갱신을 setState 로만 하면 브라우저의 되돌리기(Cmd+Z)가 끊긴다.
// 그래서 execCommand('insertText') 를 먼저 쓴다 — 낡은 API 지만 textarea 의
// undo 스택에 기록을 남기는 방법은 아직 이것뿐이다. 막히면 setState 로 떨어진다.

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import Markdown from './Markdown.jsx'
import { isBlank } from '../lib/markdown.js'

/** 커서 위치의 줄 범위. */
function lineRangeAt(text, pos) {
  const start = text.lastIndexOf('\n', pos - 1) + 1
  const nl = text.indexOf('\n', pos)
  return { start, end: nl === -1 ? text.length : nl }
}

/** 선택 영역이 걸쳐 있는 줄 전체의 범위. */
function selectedLines(text, from, to) {
  const start = text.lastIndexOf('\n', from - 1) + 1
  const nl = text.indexOf('\n', to)
  return { start, end: nl === -1 ? text.length : nl }
}

const LIST_PREFIX = /^(\s*)(?:([-*])\s+\[([ xX])\]\s+|([-*])\s+|(\d+)[.)]\s+)/

export default function MarkdownEditor({
  value,
  onChange,
  rows = 4,
  placeholder = '',
  autoFocus = false,
  hint = '',
  maxLength,
}) {
  const ref = useRef(null)
  const [preview, setPreview] = useState(false)
  const previewId = useId()
  const text = value || ''

  // 내용에 맞춰 높이를 늘린다 — 긴 메모를 좁은 칸에서 스크롤하며 쓰는 건 괴롭다.
  const grow = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 460)}px`
  }, [])

  useEffect(() => { if (!preview) grow() }, [text, preview, grow])

  /** [from,to) 를 next 로 바꾸고 커서를 맞춘다. 되돌리기를 살리려 execCommand 우선. */
  const replace = useCallback((from, to, next, selFrom, selTo) => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(from, to)
    let ok = false
    try {
      ok = document.execCommand('insertText', false, next)
    } catch { ok = false }
    if (!ok) {
      const after = el.value.slice(0, from) + next + el.value.slice(to)
      onChange(after)
    }
    const a = selFrom == null ? from + next.length : selFrom
    const b = selTo == null ? a : selTo
    // React 가 값을 되돌려 그린 뒤에 커서를 잡아야 위치가 유지된다.
    requestAnimationFrame(() => {
      if (ref.current) {
        ref.current.focus()
        ref.current.setSelectionRange(a, b)
      }
    })
  }, [onChange])

  /** 선택 영역을 기호로 감싼다. 이미 감싸져 있으면 벗긴다(토글). */
  const wrap = useCallback((mark, sample) => {
    const el = ref.current
    if (!el) return
    const { selectionStart: s, selectionEnd: e } = el
    const src = el.value
    const inner = src.slice(s, e)
    const n = mark.length

    // 이미 기호 안쪽을 고른 상태 → 벗긴다.
    if (src.slice(s - n, s) === mark && src.slice(e, e + n) === mark) {
      replace(s - n, e + n, inner, s - n, s - n + inner.length)
      return
    }
    // 기호까지 통째로 고른 상태 → 벗긴다.
    if (inner.startsWith(mark) && inner.endsWith(mark) && inner.length > n * 2) {
      const bare = inner.slice(n, -n)
      replace(s, e, bare, s, s + bare.length)
      return
    }
    const body = inner || sample
    replace(s, e, `${mark}${body}${mark}`, s + n, s + n + body.length)
  }, [replace])

  /** 고른 줄들의 앞머리를 바꾼다. 이미 그 모양이면 떼어낸다(토글). */
  const prefixLines = useCallback((make, test) => {
    const el = ref.current
    if (!el) return
    const src = el.value
    const { start, end } = selectedLines(src, el.selectionStart, el.selectionEnd)
    const lines = src.slice(start, end).split('\n')
    const allOn = lines.every((l) => !l.trim() || test(l))
    const next = lines
      .map((l, i) => {
        if (!l.trim() && lines.length > 1) return l
        const indent = /^\s*/.exec(l)[0]
        const bare = l.replace(LIST_PREFIX, '$1').replace(/^(\s*)(?:#{1,3}\s+|>\s?)/, '$1')
        return allOn ? bare : `${indent}${make(bare.trim(), i)}`
      })
      .join('\n')
    replace(start, end, next, start, start + next.length)
  }, [replace])

  const link = useCallback(() => {
    const el = ref.current
    if (!el) return
    const { selectionStart: s, selectionEnd: e } = el
    const inner = el.value.slice(s, e)
    const isUrl = /^(https?:\/\/|www\.|mailto:)/i.test(inner.trim())
    if (isUrl) {
      const out = `[](${inner.trim()})`
      replace(s, e, out, s + 1, s + 1) // 글자 자리에 커서
      return
    }
    const label = inner || '링크'
    const out = `[${label}]()`
    const caret = s + out.length - 1
    replace(s, e, out, caret, caret) // 주소 자리에 커서
  }, [replace])

  /** 표 뼈대를 넣는다. 줄 한가운데면 새 줄부터 시작한다. */
  const table = useCallback(() => {
    const el = ref.current
    if (!el) return
    const { selectionStart: s, selectionEnd: e } = el
    const src = el.value
    const atLineStart = s === 0 || src[s - 1] === '\n'
    const lead = atLineStart ? '' : '\n'
    const tail = src[e] === '\n' || e === src.length ? '' : '\n'
    const skeleton = `${lead}| 항목 | 금액 |\n| --- | ---: |\n|  |  |\n${tail}`
    // 첫 칸에 커서를 둔다 — 바로 머리글부터 고칠 수 있게.
    const caret = s + lead.length + 2
    replace(s, e, skeleton, caret, caret + 2)
  }, [replace])

  /** 목록 안에서 Enter 를 누르면 다음 항목을 이어준다. */
  const onKeyDown = (ev) => {
    const el = ref.current
    if (!el) return
    const mod = ev.metaKey || ev.ctrlKey

    if (mod && !ev.altKey) {
      const k = ev.key.toLowerCase()
      if (k === 'b') { ev.preventDefault(); wrap('**', '굵게'); return }
      if (k === 'i') { ev.preventDefault(); wrap('*', '기울임'); return }
      if (k === 'k') { ev.preventDefault(); link(); return }
      if (k === 'e') { ev.preventDefault(); setPreview((p) => !p); return }
    }

    if (ev.key !== 'Enter' || ev.shiftKey || mod) return

    const src = el.value
    const pos = el.selectionStart
    if (pos !== el.selectionEnd) return
    const { start, end } = lineRangeAt(src, pos)
    const line = src.slice(start, end)
    const m = LIST_PREFIX.exec(line)
    if (!m) return

    const body = line.slice(m[0].length)
    // 빈 항목에서 Enter → 목록을 끝낸다(앞머리를 지운다).
    if (!body.trim()) {
      ev.preventDefault()
      replace(start, end, '')
      return
    }
    const indent = m[1] || ''
    let next
    if (m[3] != null) next = `${indent}${m[2]} [ ] `      // 체크박스
    else if (m[4]) next = `${indent}${m[4]} `              // 불릿
    else next = `${indent}${Number(m[5]) + 1}. `           // 번호
    ev.preventDefault()
    replace(pos, pos, `\n${next}`)
  }

  const empty = isBlank(text)
  const count = text.length

  return (
    <div className={`mde${preview ? ' previewing' : ''}`}>
      <div className="mde-bar" role="toolbar" aria-label="서식">
        <Btn label="굵게" title="굵게 (⌘B)" onClick={() => wrap('**', '굵게')}><b>B</b></Btn>
        <Btn label="기울임" title="기울임 (⌘I)" onClick={() => wrap('*', '기울임')}><i>I</i></Btn>
        <Btn label="취소선" title="취소선" onClick={() => wrap('~~', '취소선')}><s>S</s></Btn>
        <Btn label="코드" title="인라인 코드" onClick={() => wrap('`', 'code')}>{'</>'}</Btn>
        <span className="mde-sep" />
        <Btn
          label="제목"
          title="제목"
          onClick={() => prefixLines((t) => `## ${t}`, (l) => /^\s*#{1,3}\s+/.test(l))}
        >H</Btn>
        <Btn
          label="인용"
          title="인용"
          onClick={() => prefixLines((t) => `> ${t}`, (l) => /^\s*>\s?/.test(l))}
        >❝</Btn>
        <span className="mde-sep" />
        <Btn
          label="목록"
          title="불릿 목록"
          onClick={() => prefixLines((t) => `- ${t}`, (l) => /^\s*[-*]\s+(?!\[[ xX]\])/.test(l))}
        >•</Btn>
        <Btn
          label="번호 목록"
          title="번호 목록"
          onClick={() => prefixLines((t, i) => `${i + 1}. ${t}`, (l) => /^\s*\d+[.)]\s+/.test(l))}
        >1.</Btn>
        <Btn
          label="체크박스"
          title="체크박스"
          onClick={() => prefixLines((t) => `- [ ] ${t}`, (l) => /^\s*[-*]\s+\[[ xX]\]\s+/.test(l))}
        >☑</Btn>
        <span className="mde-sep" />
        <Btn label="링크" title="링크 (⌘K)" onClick={link}>🔗</Btn>
        <Btn label="표" title="표 넣기" onClick={table}>▦</Btn>
        <div className="mde-spacer" />
        <button
          type="button"
          className={`mde-toggle${preview ? ' on' : ''}`}
          onClick={() => setPreview((p) => !p)}
          aria-pressed={preview}
          aria-controls={previewId}
          disabled={empty && !preview}
          title="미리보기 (⌘E)"
        >{preview ? '편집' : '미리보기'}</button>
      </div>

      {preview ? (
        <div className="mde-preview" id={previewId}>
          {empty ? <p className="mde-empty">미리볼 내용이 없습니다.</p> : <Markdown text={text} />}
        </div>
      ) : (
        <textarea
          ref={ref}
          value={text}
          rows={rows}
          placeholder={placeholder}
          autoFocus={autoFocus}
          maxLength={maxLength}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onInput={grow}
        />
      )}

      <div className="mde-foot">
        <small className="hint">{hint || '**굵게** *기울임* `코드` - 목록 | 표 | · ⌘B ⌘I ⌘K'}</small>
        <small className={`mde-count${maxLength && count > maxLength * 0.9 ? ' warn' : ''}`}>
          {count.toLocaleString('ko-KR')}{maxLength ? ` / ${maxLength.toLocaleString('ko-KR')}` : ''}
        </small>
      </div>
    </div>
  )
}

function Btn({ label, title, onClick, children }) {
  return (
    <button
      type="button"
      className="mde-btn"
      title={title}
      aria-label={label}
      // 버튼을 눌러도 textarea 의 선택 영역이 풀리지 않게 한다.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >{children}</button>
  )
}
