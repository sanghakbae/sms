// 팀 편성. 팀원 명단(members 컬렉션)과 실적 집계(stats.teamSummary)를 합쳐
// '팀 관리' 화면이 쓸 행을 만든다. 순수 함수라 test/teams.test.js 로 검증한다.
//
// 설계 두 가지를 기억할 것.
//
// 1) 팀원 명단은 스스로 만들어진다. 로그인하면 members/{uid} 문서가 자기 손으로
//    올라온다 — 그래서 관리자는 '로그인한 적 있는 사람'을 목록에서 보고 팀에 넣는다.
//    관리자가 이메일을 손으로 받아 적을 필요가 없다.
//
// 2) teamId 가 빈 문자열이면 '미배정'이다. 미배정은 팀원이 아니므로 데이터를
//    만들 수도, 볼 수도 없다(firestore.rules 에서 같이 막는다).
//    즉 '팀에 넣는 것' 자체가 승인이다. 승인 플래그를 따로 두지 않는다 —
//    상태가 둘로 나뉘면 '승인됐지만 팀이 없는 사람' 같은 애매한 칸이 생긴다.

import { normalizeEmail } from './accounts.js'

/** 팀이 없는 상태. 문서에 필드가 없을 때와 같게 취급한다. */
export const UNASSIGNED = ''

/* ---------------------------------- 권한 3단 ---------------------------------- */
//
//   관리자  ─ settings/admins + BOOTSTRAP_ADMINS (이메일로 판정)
//     └ 팀장  ─ members/{uid}.role === 'leader'
//         └ 팀원 ─ 그 밖의 모든 배정된 사용자
//
// 관리자는 이메일로, 팀장·팀원은 명단 문서로 판정한다. 왜 갈라놨나 —
// 관리자는 팀이 없어도 전사를 봐야 하고(초기 세팅), 팀장은 '어느 팀의' 팀장인지가
// 있어야 뜻이 생긴다. 그래서 팀장은 소속과 한 몸으로 members 문서에 둔다.
//
// 관리자 여부는 accounts.js 의 isAdminEmail 로 판정한다 — 여기서는 다루지 않는다.

export const ROLE_LEADER = 'leader'
export const ROLE_MEMBER = 'member'
export const DEFAULT_TEAM_NAME = '배지터'

export const ROLES = [
  { id: ROLE_LEADER, label: '팀장', hint: '자기 팀 데이터를 모두 수정할 수 있고 팀원 목표를 정한다' },
  { id: ROLE_MEMBER, label: '팀원', hint: '자기 팀 데이터를 보고 자기 것만 수정한다' },
]

/** members 문서의 역할. 값이 없거나 이상하면 팀원으로 본다(권한을 더 주지 않는 쪽). */
export function roleOf(member) {
  return member?.role === ROLE_LEADER ? ROLE_LEADER : ROLE_MEMBER
}

export function roleLabel(role) {
  return role === ROLE_LEADER ? '팀장' : '팀원'
}

/**
 * 화면에 붙일 권한 이름. 관리자가 팀장을 겸할 수 있으므로 관리자를 먼저 본다.
 * 관리자는 팀 소속과 무관하게 관리자다.
 */
export function accessLabel(isAdmin, role, teamId) {
  if (isAdmin) return '관리자'
  if (!teamId) return '미배정'
  return roleLabel(role)
}

/* ---------------------------------- 팀 목록 ---------------------------------- */

/** settings/teams 의 items 를 쓸 수 있는 형태로 다듬는다. */
export function normalizeTeams(items) {
  const seen = new Set()
  return (items || [])
    .map((t) => ({
      id: String(t?.id || '').trim(),
      name: String(t?.name || '').trim(),
    }))
    .filter((t) => {
      if (!t.id || !t.name) return false
      if (seen.has(t.id)) return false
      seen.add(t.id)
      return true
    })
}

export function getTeam(teams, id) {
  if (!id) return null
  return (teams || []).find((t) => t.id === id) || null
}

/** 신규 사용자가 처음 들어갈 기본 팀. 이름이 정확히 일치할 때만 사용한다. */
export function defaultTeamId(teams) {
  return normalizeTeams(teams).find((t) => t.name === DEFAULT_TEAM_NAME)?.id || UNASSIGNED
}

/** 팀 이름. 없어진 팀이면 id 를 그대로 보여준다 — 조용히 사라지면 추적이 안 된다. */
export function teamName(teams, id) {
  if (!id) return '미배정'
  const t = getTeam(teams, id)
  return t ? t.name : `없는 팀(${id})`
}

/** 새 팀 id. 이름을 바꿔도 소속이 유지되도록 이름과 무관하게 만든다. */
export function makeTeamId(seed) {
  const rand = String(seed || Math.random().toString(36).slice(2, 8))
  return `team_${rand}`
}

/* --------------------------------- 팀원 행 만들기 -------------------------------- */

// teamSummary 가 돌려주는 숫자 필드의 0 값. members 에는 있지만 아직 데이터가
// 없는 사람도 같은 모양이어야 화면에서 분기하지 않는다.
const ZERO = {
  dealCount: 0, wonAmount: 0, wonCount: 0,
  yearWonAmount: 0, yearWonCount: 0,
  openAmount: 0, openCount: 0, overdueCount: 0, lostCount: 0,
  customerCount: 0, activityCount: 0,
}

/** 실적 집계 행을 uid·이메일로 찾을 수 있게 색인한다. */
function indexDerived(derived) {
  const byEmail = new Map()
  const byUid = new Map()
  for (const d of derived || []) {
    if (d.email) byEmail.set(normalizeEmail(d.email), d)
    if (d.uid) byUid.set(d.uid, d)
  }
  return { byEmail, byUid }
}

/**
 * 팀원 명단 + 실적을 합친 행 목록.
 *
 * - 명단에 있으면 데이터가 없어도 나온다(로그인만 한 사람 → 목표를 미리 할당할 수 있다).
 * - 명단에 없는데 데이터가 있으면 그것도 나온다(`registered: false`).
 *   예전에 만들어진 데이터의 담당자를 목록에서 잃어버리면 그 실적이 사라진 것처럼 보인다.
 */
export function memberRows(members, derived) {
  const { byEmail, byUid } = indexDerived(derived)
  const rows = []
  const usedKeys = new Set()

  for (const m of members || []) {
    const email = normalizeEmail(m.email)
    const stat = byUid.get(m.uid) || byEmail.get(email) || null
    if (stat) usedKeys.add(stat.key)
    rows.push({
      ...ZERO,
      ...(stat || {}),
      key: m.uid || email || '?',
      uid: m.uid || stat?.uid || '',
      email,
      // 명단의 이름이 최신이다 — 구글 프로필을 바꾸면 로그인할 때 갱신된다.
      name: m.name || stat?.name || email || '이름 없음',
      photoURL: m.photoURL || '',
      teamId: m.teamId || UNASSIGNED,
      role: roleOf(m),
      lastLoginAt: m.lastLoginAt || null,
      registered: true,
    })
  }

  for (const d of derived || []) {
    if (usedKeys.has(d.key)) continue
    rows.push({
      ...ZERO,
      ...d,
      photoURL: '',
      teamId: UNASSIGNED,
      role: ROLE_MEMBER,
      lastLoginAt: null,
      // 로그인 기록이 없다 — 예전 데이터만 남은 계정이다.
      registered: false,
    })
  }

  return rows
}

/** 팀에 속한 사람만. */
export function assignedRows(rows) {
  return (rows || []).filter((r) => r.teamId)
}

/** 아직 팀이 없는 사람 — '팀원으로 추가' 후보. */
export function unassignedRows(rows) {
  return (rows || []).filter((r) => !r.teamId)
}

/**
 * 팀별로 묶는다. teams 순서를 지키고, 없어진 팀에 남은 사람도 버리지 않는다.
 * 팀이 지워졌는데 소속이 남아 있으면 그 사람은 어디에도 안 나와서 유령이 된다.
 */
export function groupByTeam(rows, teams) {
  const list = normalizeTeams(teams)
  const buckets = new Map(list.map((t) => [t.id, []]))
  const orphans = new Map()

  for (const r of assignedRows(rows)) {
    if (buckets.has(r.teamId)) buckets.get(r.teamId).push(r)
    else {
      if (!orphans.has(r.teamId)) orphans.set(r.teamId, [])
      orphans.get(r.teamId).push(r)
    }
  }

  const sortRows = (a, b) => b.yearWonAmount - a.yearWonAmount || a.name.localeCompare(b.name, 'ko')

  const groups = list.map((t) => ({
    team: t,
    missing: false,
    members: buckets.get(t.id).sort(sortRows),
  }))

  for (const [id, members] of orphans) {
    groups.push({
      team: { id, name: `없는 팀(${id})` },
      missing: true,
      members: members.sort(sortRows),
    })
  }

  return groups
}

/* ---------------------------------- 팀 집계 ---------------------------------- */

/** 한 팀의 실적 합계. 팀 목표와 견주려는 것이다. */
export function teamTotals(members) {
  const out = { ...ZERO, memberCount: (members || []).length }
  for (const m of members || []) {
    for (const k of Object.keys(ZERO)) out[k] += Number(m[k]) || 0
  }
  return out
}

/**
 * 팀별 목표 대비 현황.
 * teamTargets 는 { teamId: 금액 } — settings/teamTargets 의 해당 연도 값이다.
 */
export function teamProgress(groups, teamTargets) {
  const map = teamTargets || {}
  return (groups || []).map((g) => {
    const totals = teamTotals(g.members)
    const target = Number(map[g.team.id]) || 0
    return {
      ...g,
      totals,
      target,
      progress: target > 0 ? Math.round((totals.yearWonAmount / target) * 100) : null,
      gap: Math.max(0, target - totals.yearWonAmount),
    }
  })
}

/**
 * 팀 목표 합계가 전사 목표와 맞는지.
 * 없어진 팀에 남은 목표까지 세야 총액이 어긋나지 않는다(orphan).
 */
export function teamAllocationSummary(teams, teamTargets, companyTarget) {
  const map = teamTargets || {}
  const list = normalizeTeams(teams)
  const known = new Set(list.map((t) => t.id))
  let allocated = 0
  for (const t of list) allocated += Number(map[t.id]) || 0
  let orphan = 0
  for (const [id, v] of Object.entries(map)) {
    if (!known.has(id)) orphan += Number(v) || 0
  }
  const total = allocated + orphan
  return {
    allocated: total,
    orphan,
    unallocated: (Number(companyTarget) || 0) - total,
  }
}

/* --------------------------------- 내 소속 판정 -------------------------------- */

/** 내 members 문서에서 팀 id 를 꺼낸다. 없으면 미배정. */
export function myTeamId(members, uid) {
  if (!uid) return UNASSIGNED
  const me = (members || []).find((m) => m.uid === uid)
  return me?.teamId || UNASSIGNED
}

/** 내 members 문서. 없으면 null. */
export function myMember(members, uid) {
  if (!uid) return null
  return (members || []).find((m) => m.uid === uid) || null
}

/** 내 역할. 명단에 없으면 팀원으로 본다. */
export function myRole(members, uid) {
  return roleOf(myMember(members, uid))
}

/**
 * 데이터를 읽고 쓸 수 있는 상태인가.
 * 관리자는 팀이 없어도 전체를 본다(초기 세팅을 해야 하므로).
 * 일반 사용자는 팀에 들어가야 비로소 쓸 수 있다.
 */
export function canUseData(isAdmin, teamId) {
  return Boolean(isAdmin || teamId)
}

/**
 * 이 문서를 고칠 수 있는가.
 * 관리자는 전부, 팀장은 자기 팀 안에서 전부, 팀원은 자기가 만든 것만.
 * firestore.rules 의 canWriteTeamDoc() 과 같은 규칙을 유지할 것.
 */
export function canEditDoc(user, docu) {
  if (!user || !docu) return false
  if (user.isAdmin) return true
  const sameTeam = Boolean(user.teamId) && docu.teamId === user.teamId
  if (!sameTeam) return false
  if (user.role === ROLE_LEADER) return true
  return docu.owner === user.uid
}

/** 팀장 이상인가 — 자기 팀 목표를 정할 수 있는 사람. */
export function canSetTeamGoals(user) {
  return Boolean(user && (user.isAdmin || (user.teamId && user.role === ROLE_LEADER)))
}

/** 한 팀의 팀장들. 화면에 '팀장 없음' 을 알려주려는 것. */
export function leadersOf(members) {
  return (members || []).filter((m) => roleOf(m) === ROLE_LEADER)
}
