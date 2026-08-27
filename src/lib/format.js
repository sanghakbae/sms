// 날짜·금액 표시 도우미. 모든 금액은 '원(KRW)' 정수로 다룬다.

export function todayISO() {
  const now = new Date()
  const tz = now.getTimezoneOffset() * 60000
  return new Date(now - tz).toISOString().slice(0, 10)
}

/** 'YYYY-MM' 형태의 월 키. 인자가 없으면 이번 달. */
export function monthKey(iso) {
  return (iso || todayISO()).slice(0, 7)
}

/** 'YYYY' 형태의 연 키. 인자가 없으면 올해. */
export function yearKey(iso) {
  return (iso || todayISO()).slice(0, 4)
}

export function yearLabel(key) {
  return `${key}년`
}

/** 연말까지 남은 일수. */
export function daysLeftInYear(today = todayISO()) {
  const [y, m, d] = String(today).split('-').map(Number)
  const end = Date.UTC(y, 11, 31)
  const now = Date.UTC(y, m - 1, d)
  return Math.max(0, Math.round((end - now) / 86400000))
}

/** 'YYYY-MM' 을 delta 개월만큼 옮긴다. -1 이면 지난달. */
export function shiftMonth(key, delta) {
  const [y, m] = String(key).split('-').map(Number)
  const total = y * 12 + (m - 1) + delta
  const ny = Math.floor(total / 12)
  const nm = total % 12
  return `${ny}-${String(nm + 1).padStart(2, '0')}`
}

/** 남은 일수 — 이번 달 말일까지. */
export function daysLeftInMonth(today = todayISO()) {
  const [y, m, d] = String(today).split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return Math.max(0, last - d)
}

export function monthLabel(key) {
  const [y, m] = String(key).split('-')
  return `${y}년 ${Number(m)}월`
}

/** ₩1,234,567 — 정확한 금액 표시. */
export function formatWon(amount) {
  const n = Math.round(Number(amount) || 0)
  return `₩${n.toLocaleString('ko-KR')}`
}

/** 1,234만 · 3.4억 — 대시보드/카드용 축약 표시. */
export function compactWon(amount) {
  const n = Math.round(Number(amount) || 0)
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 100000000) {
    const eok = abs / 100000000
    return `${sign}${trim(eok)}억`
  }
  if (abs >= 10000) {
    const man = Math.round(abs / 10000)
    return `${sign}${man.toLocaleString('ko-KR')}만`
  }
  return `${sign}${abs.toLocaleString('ko-KR')}`
}

/** ₩4,500,000(450만원) — 입력 확인용. 정확한 금액과 읽기 쉬운 축약을 함께 보여준다. */
export function wonWithCompact(amount) {
  return `${formatWon(amount)}(${compactWon(amount)}원)`
}

function trim(x) {
  // 3.40 → 3.4, 3.00 → 3
  return Number(x.toFixed(1)).toString()
}

export function formatDate(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).split('-')
  return `${Number(m)}/${Number(d)}`
}

export function relativeDay(iso) {
  if (!iso) return ''
  const today = todayISO()
  if (iso === today) return '오늘'
  const diff = Math.round((new Date(iso) - new Date(today)) / 86400000)
  if (diff === 1) return '내일'
  if (diff === -1) return '어제'
  if (diff < 0) return `${-diff}일 전`
  return `${diff}일 후`
}

export function clampPercent(x) {
  return Math.max(0, Math.min(100, Math.round(x)))
}
