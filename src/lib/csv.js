// CSV 생성. 엑셀에서 한글이 깨지지 않도록 UTF-8 BOM 을 붙여 내려받는다.

/** CSV 한 칸 이스케이프 — 쉼표·따옴표·줄바꿈이 있으면 따옴표로 감싼다. */
export function escapeCell(value) {
  const s = value == null ? '' : String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * rows 를 CSV 문자열로. columns 는 { key, label, value? } 목록.
 * value(row) 가 있으면 그 결과를, 없으면 row[key] 를 쓴다.
 */
export function toCsv(rows, columns) {
  const head = columns.map((c) => escapeCell(c.label)).join(',')
  const body = (rows || []).map((row) =>
    columns.map((c) => escapeCell(c.value ? c.value(row) : row[c.key])).join(','))
  return [head, ...body].join('\r\n')
}

/** 브라우저에서 CSV 파일로 내려받기. */
export function downloadCsv(filename, csv) {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
