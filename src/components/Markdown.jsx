// 마크다운 토큰 트리를 React 엘리먼트로 그린다.
// innerHTML 을 쓰지 않는다 — 저장된 내용이 태그를 품고 있어도 글자로만 나온다.

import { parseMarkdown } from '../lib/markdown.js'

function Inline({ nodes }) {
  return nodes.map((n, i) => {
    const key = i
    switch (n.type) {
      case 'text': return n.value
      case 'br': return <br key={key} />
      case 'code': return <code key={key} className="md-code">{n.value}</code>
      case 'strong': return <strong key={key}><Inline nodes={n.children} /></strong>
      case 'em': return <em key={key}><Inline nodes={n.children} /></em>
      case 'del': return <del key={key}><Inline nodes={n.children} /></del>
      case 'link': return (
        // 외부로 나가는 링크라 referrer 를 넘기지 않고, opener 도 끊는다.
        <a key={key} href={n.href} target="_blank" rel="noopener noreferrer nofollow">
          <Inline nodes={n.children} />
        </a>
      )
      default: return null
    }
  })
}

/**
 * 목록 항목을 깊이에 따라 중첩 목록으로 묶는다.
 * 파서는 항목을 평평하게(depth 만 붙여서) 주므로 여기서 계층을 만든다.
 */
function nestItems(items) {
  const root = []
  // 깊이별 '현재 열려 있는 목록'. 부모가 없으면 한 단계 끌어올린다.
  const stack = [root]
  for (const item of items) {
    const depth = Math.min(item.depth || 0, stack.length - 1)
    stack.length = depth + 1
    const node = { ...item, children: [] }
    stack[depth].push(node)
    stack.push(node.children)
  }
  return root
}

function ListNodes({ nodes, ordered }) {
  const Tag = ordered ? 'ol' : 'ul'
  return (
    <Tag className={ordered ? 'md-ol' : 'md-ul'}>
      {nodes.map((n, i) => (
        <li key={i} className={n.checked == null ? '' : `md-task${n.checked ? ' done' : ''}`}>
          {n.checked != null && (
            // 표시 전용 — 여기서 체크를 바꾸면 저장 없이 화면만 달라져 헷갈린다.
            // 체크는 편집 화면에서 한다.
            <input type="checkbox" checked={n.checked} readOnly tabIndex={-1} aria-hidden="true" />
          )}
          <span className="md-task-body"><Inline nodes={n.inline} /></span>
          {n.children.length > 0 && <ListNodes nodes={n.children} ordered={ordered} />}
        </li>
      ))}
    </Tag>
  )
}

/** 마크다운 평문을 읽기용으로 그린다. */
export default function Markdown({ text, className = '' }) {
  const blocks = parseMarkdown(text)
  if (blocks.length === 0) return null

  return (
    <div className={`md${className ? ` ${className}` : ''}`}>
      {blocks.map((b, i) => {
        const key = i
        switch (b.type) {
          case 'heading': {
            const H = `h${Math.min(6, b.level + 2)}` // 문서 제목과 겹치지 않게 h3 부터
            return <H key={key} className={`md-h md-h${b.level}`}><Inline nodes={b.inline} /></H>
          }
          case 'paragraph': return <p key={key} className="md-p"><Inline nodes={b.inline} /></p>
          case 'quote': return <blockquote key={key} className="md-quote"><Inline nodes={b.inline} /></blockquote>
          case 'code': return <pre key={key} className="md-pre"><code>{b.text}</code></pre>
          case 'hr': return <hr key={key} className="md-hr" />
          case 'list': return <ListNodes key={key} nodes={nestItems(b.items)} ordered={b.ordered} />
          case 'table': return (
            // 넓은 표가 본문을 밀어내지 않게 표만 따로 가로 스크롤시킨다.
            <div key={key} className="md-table-wrap">
              <table className="md-table">
                <thead>
                  <tr>
                    {b.head.map((cell, c) => (
                      <th key={c} style={b.aligns[c] ? { textAlign: b.aligns[c] } : undefined}>
                        <Inline nodes={cell} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((row, r) => (
                    <tr key={r}>
                      {row.map((cell, c) => (
                        <td key={c} style={b.aligns[c] ? { textAlign: b.aligns[c] } : undefined}>
                          <Inline nodes={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
          default: return null
        }
      })}
    </div>
  )
}
