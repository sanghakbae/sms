// 감사 로그 — 누가 무엇을 언제 바꿨나.
//
// 무엇을 남기나. 되돌리기 어렵거나 권한이 걸린 일만 남긴다 —
// 딜 하나 고칠 때마다 적으면 로그가 잡음이 되어 정작 볼 때 못 찾는다.
// 삭제, 권한 변경, 팀 편성, 목표 변경, 돈(입금) 이 그 기준이다.
//
// ⚠️ 한계를 분명히 알고 쓸 것.
//   이 로그는 브라우저에서 쓴다. 보안 규칙으로 '고칠 수도 지울 수도 없게'
//   막아두었고 작성자도 본인 uid 로 강제되지만, 애초에 로그를 남기지 않고
//   요청만 보내는 것까지는 막지 못한다(그 요청 자체는 규칙이 막는다).
//   진짜 위변조 불가 로그가 필요하면 Cloud Functions 에서 써야 한다.

export const ACTIONS = {
  MEMBER_TEAM: 'member.team',
  MEMBER_ROLE: 'member.role',
  MEMBER_REMOVE: 'member.remove',
  MEMBER_INVITE: 'member.invite',
  MEMBER_INVITE_REMOVE: 'member.invite.remove',
  ADMIN_ADD: 'admin.add',
  ADMIN_REMOVE: 'admin.remove',
  TEAM_CREATE: 'team.create',
  TEAM_RENAME: 'team.rename',
  TEAM_REMOVE: 'team.remove',
  TARGET_COMPANY: 'target.company',
  TARGET_TEAM: 'target.team',
  TARGET_OWNER: 'target.owner',
  DEAL_REMOVE: 'deal.remove',
  CUSTOMER_REMOVE: 'customer.remove',
  ACTIVITY_REMOVE: 'activity.remove',
  PAYMENT_ADD: 'payment.add',
  PAYMENT_REMOVE: 'payment.remove',
  DATA_MIGRATE: 'data.migrate',
}

// 위험도 — 목록에서 눈에 걸려야 할 순서를 정한다.
const HIGH = 'high'
const MID = 'mid'
const LOW = 'low'

const CATALOG = {
  [ACTIONS.MEMBER_TEAM]: { label: '팀 배정', level: MID },
  [ACTIONS.MEMBER_ROLE]: { label: '권한 변경', level: HIGH },
  [ACTIONS.MEMBER_REMOVE]: { label: '명단 제외', level: MID },
  [ACTIONS.MEMBER_INVITE]: { label: '이메일 초대', level: MID },
  [ACTIONS.MEMBER_INVITE_REMOVE]: { label: '이메일 초대 취소', level: MID },
  [ACTIONS.ADMIN_ADD]: { label: '관리자 추가', level: HIGH },
  [ACTIONS.ADMIN_REMOVE]: { label: '관리자 해제', level: HIGH },
  [ACTIONS.TEAM_CREATE]: { label: '팀 생성', level: LOW },
  [ACTIONS.TEAM_RENAME]: { label: '팀 이름 변경', level: LOW },
  [ACTIONS.TEAM_REMOVE]: { label: '팀 삭제', level: HIGH },
  [ACTIONS.TARGET_COMPANY]: { label: '전사 목표 변경', level: MID },
  [ACTIONS.TARGET_TEAM]: { label: '팀 목표 변경', level: MID },
  [ACTIONS.TARGET_OWNER]: { label: '영업자 목표 변경', level: MID },
  [ACTIONS.DEAL_REMOVE]: { label: '영업기회 삭제', level: HIGH },
  [ACTIONS.CUSTOMER_REMOVE]: { label: '거래처 삭제', level: HIGH },
  [ACTIONS.ACTIVITY_REMOVE]: { label: '활동 삭제', level: MID },
  [ACTIONS.PAYMENT_ADD]: { label: '입금 기록', level: MID },
  [ACTIONS.PAYMENT_REMOVE]: { label: '입금 기록 삭제', level: HIGH },
  [ACTIONS.DATA_MIGRATE]: { label: '데이터 일괄 배정', level: HIGH },
}

export function actionLabel(action) {
  return CATALOG[action]?.label || action || '알 수 없는 작업'
}

export function actionLevel(action) {
  return CATALOG[action]?.level || LOW
}

export function isHighRisk(action) {
  return actionLevel(action) === HIGH
}

/** 목록 필터용 — 실제로 쓰인 적 있는 작업만 고를 수 있게. */
export function actionsIn(logs) {
  const set = new Set((logs || []).map((l) => l.action).filter(Boolean))
  return [...set]
    .map((id) => ({ id, label: actionLabel(id), level: actionLevel(id) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ko'))
}

/** 한 줄 설명. detail 이 있으면 '무엇 → 무엇' 까지 보여준다. */
export function describe(log) {
  if (!log) return ''
  const who = log.targetLabel || ''
  const from = log.from == null ? '' : String(log.from)
  const to = log.to == null ? '' : String(log.to)
  if (from && to) return `${who} · ${from} → ${to}`
  if (to) return who ? `${who} · ${to}` : to
  return who
}

/** 검색 — 사람 이름, 작업 이름, 대상 어디에 걸려도 찾히게. */
export function matches(log, needle) {
  const q = String(needle || '').trim().toLowerCase()
  if (!q) return true
  return [
    log.actorName, log.actorEmail, log.targetLabel,
    actionLabel(log.action), log.from, log.to, log.note,
  ].some((v) => String(v || '').toLowerCase().includes(q))
}
