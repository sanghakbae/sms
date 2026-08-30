// 메뉴별 접근 권한.
//
// 어떤 역할이 어떤 메뉴를 보는지는 코드에 박지 않고 관리자가 화면에서 정한다.
// 값은 '이 메뉴를 보려면 최소 어떤 역할이어야 하는가' 다.
//
// 관리자는 설정과 무관하게 전부 본다 — 잘못 잠가 스스로 설정 화면에
// 못 들어가는 상황을 막는 안전장치다.

export const LEVEL_ALL = 'all'       // 팀에 배정된 모든 구성원
export const LEVEL_LEAD = 'lead'     // 팀장 이상
export const LEVEL_ADMIN = 'admin'   // 관리자만

export const LEVELS = [
  { id: LEVEL_ALL, label: '전원', hint: '팀에 배정된 구성원 모두' },
  { id: LEVEL_LEAD, label: '팀장 이상', hint: '팀장과 관리자' },
  { id: LEVEL_ADMIN, label: '관리자', hint: '관리자만' },
]

/** 설정 대상 메뉴와 기본값. id 는 App.jsx 의 탭 id 와 같아야 한다. */
export const MENU_DEFS = [
  { id: 'dashboard', label: '대시보드', fixed: true, def: LEVEL_ALL },
  { id: 'deals', label: '영업현황', def: LEVEL_ALL },
  { id: 'customers', label: '거래처', def: LEVEL_ALL },
  { id: 'activities', label: '활동', def: LEVEL_ALL },
  { id: 'trades', label: '거래', def: LEVEL_ALL },
  { id: 'team', label: '팀', def: LEVEL_LEAD },
  { id: 'settings', label: '설정', fixed: true, def: LEVEL_ADMIN },
]

const BY_ID = Object.fromEntries(MENU_DEFS.map((m) => [m.id, m]))

/** 설정값을 정리한다. 모르는 값은 기본값으로 되돌린다. */
export function normalizeAccess(raw) {
  const out = {}
  for (const m of MENU_DEFS) {
    const v = raw && raw[m.id]
    // 대시보드·설정은 잠금 대상이 아니다 — 바꿀 수 있게 두면 스스로 갇힌다.
    out[m.id] = m.fixed ? m.def : (LEVELS.some((l) => l.id === v) ? v : m.def)
  }
  return out
}

/** 이 사용자가 그 메뉴를 볼 수 있는가. */
export function canSeeMenu(user, menuId, access) {
  if (!user) return false
  // 관리자는 설정과 무관하게 전부 본다.
  if (user.isAdmin) return true
  const level = normalizeAccess(access)[menuId] || BY_ID[menuId]?.def || LEVEL_ALL
  if (level === LEVEL_ADMIN) return false
  if (level === LEVEL_LEAD) return user.role === 'leader'
  // LEVEL_ALL — 팀에 배정돼야 데이터가 보인다.
  return Boolean(user.teamId)
}

/** 화면에 세울 메뉴 id 목록. tabs 순서를 그대로 지킨다. */
export function visibleMenuIds(user, access, order) {
  return (order || MENU_DEFS.map((m) => m.id)).filter((id) => canSeeMenu(user, id, access))
}
