// 접근 권한 판정 — Google OAuth 로 로그인한 사용자의 '이메일'로만 판정한다.
// 클라이언트가 바꿀 수 없는 값(Firebase Auth 토큰의 email)만 신뢰한다.
// firestore.rules 의 isMember()·isAdmin() 과 반드시 같은 규칙을 유지할 것.

// 허용 도메인 목록. 비어 있으면 도메인을 제한하지 않고,
// 로그인한 Google 계정이면 누구나 팀원으로 인정한다.
// 다시 특정 도메인만 허용하려면 예: ['muhayu.com'] 처럼 채운다.
export const ALLOWED_DOMAINS = []

// 팀장(관리자) 이메일 — 목표 설정·전체 수정 권한.
export const ADMIN_EMAILS = ['qa@muhayu.com']

function domainOf(email) {
  return String(email || '').toLowerCase().split('@')[1] || ''
}

export function isAllowedEmail(email) {
  const e = String(email || '').toLowerCase()
  if (!e) return false
  if (ADMIN_EMAILS.includes(e)) return true
  if (ALLOWED_DOMAINS.length === 0) return true // 도메인 제한 없음
  return ALLOWED_DOMAINS.includes(domainOf(e))
}

export function isAdminEmail(email) {
  return ADMIN_EMAILS.includes(String(email || '').toLowerCase())
}

/** 표시용 짧은 이름 — Google displayName 이 없으면 이메일 아이디를 쓴다. */
export function shortName(displayName, email) {
  if (displayName && displayName.trim()) return displayName.trim()
  const local = String(email || '').split('@')[0]
  return local || '사용자'
}

/** 이름 첫 글자(아바타 폴백용). */
export function initial(name) {
  return String(name || '?').trim().charAt(0).toUpperCase() || '?'
}
