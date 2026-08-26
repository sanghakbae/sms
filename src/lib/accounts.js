// 접근 권한 판정 — Google OAuth 로 로그인한 사용자의 '이메일'로만 판정한다.
// 클라이언트가 바꿀 수 없는 값(Firebase Auth 토큰의 email)만 신뢰한다.
// firestore.rules 의 isMember()·isAdmin() 과 반드시 같은 규칙을 유지할 것.

// 허용 도메인 목록. 비어 있으면 도메인을 제한하지 않고,
// 로그인한 Google 계정이면 누구나 팀원으로 인정한다.
// 다시 특정 도메인만 허용하려면 예: ['muhayu.com'] 처럼 채운다.
export const ALLOWED_DOMAINS = []

// 코드에 박아둔 기본 관리자. 화면에서 지울 수 없다 —
// 관리자 명단을 잘못 비워 아무도 못 들어가는 상황을 막는 안전장치다.
// firestore.rules 의 isAdmin() 안에 있는 목록과 반드시 같게 유지할 것.
export const BOOTSTRAP_ADMINS = [
  'qa@muhayu.com',
  'totoriverce@tukorea.ac.kr',
]

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function domainOf(email) {
  return normalizeEmail(email).split('@')[1] || ''
}

export function isAllowedEmail(email) {
  const e = normalizeEmail(email)
  if (!e) return false
  if (BOOTSTRAP_ADMINS.includes(e)) return true
  if (ALLOWED_DOMAINS.length === 0) return true // 도메인 제한 없음
  return ALLOWED_DOMAINS.includes(domainOf(e))
}

/**
 * 관리자인가. 기본 관리자이거나, 화면에서 추가한 관리자 명단에 있으면 참.
 * extraAdmins 는 Firestore settings/admins 문서에서 온 목록이다.
 */
export function isAdminEmail(email, extraAdmins = []) {
  const e = normalizeEmail(email)
  if (!e) return false
  if (BOOTSTRAP_ADMINS.includes(e)) return true
  return (extraAdmins || []).map(normalizeEmail).includes(e)
}

/** 기본 관리자는 화면에서 제거할 수 없다. */
export function isBootstrapAdmin(email) {
  return BOOTSTRAP_ADMINS.includes(normalizeEmail(email))
}

/** 이메일 형식이 최소한 맞는지. 관리자 추가 입력 검증용. */
export function looksLikeEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email))
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
