// 영업 파이프라인 단계 정의.
// order 순서대로 진행하며, won/lost 는 종료 단계다.
// probability 는 그 단계 딜의 기본 성공확률(가중 예상매출 계산에 쓴다).

export const STAGES = [
  { id: 'lead', label: '리드', short: '발굴', color: '#64748b', probability: 10, closed: false },
  { id: 'contact', label: '상담', short: '접촉', color: '#0ea5e9', probability: 25, closed: false },
  { id: 'proposal', label: '제안', short: '견적', color: '#6366f1', probability: 50, closed: false },
  { id: 'negotiation', label: '협상', short: '조율', color: '#f59e0b', probability: 80, closed: false },
  { id: 'won', label: '수주', short: '성공', color: '#10b981', probability: 100, closed: true, win: true },
  { id: 'lost', label: '실패', short: '종료', color: '#ef4444', probability: 0, closed: true, win: false },
]

/** 파이프라인 보드에 세로 열로 세우는 진행 단계(종료 제외 + 수주). */
export const BOARD_STAGES = STAGES.filter((s) => s.id !== 'lost')

/** 아직 살아있는(종료 안 된) 단계 목록. */
export const OPEN_STAGES = STAGES.filter((s) => !s.closed)

const BY_ID = Object.fromEntries(STAGES.map((s) => [s.id, s]))

export function getStage(id) {
  return BY_ID[id] || STAGES[0]
}

export function stageProbability(id) {
  return getStage(id).probability
}

export function isWon(id) {
  return getStage(id).win === true
}

export function isLost(id) {
  return id === 'lost'
}

export function isOpen(id) {
  return !getStage(id).closed
}

// 거래처 등급 — 매출 기여도/전략적 중요도.
export const GRADES = [
  { id: 'A', label: 'A · 핵심', color: '#10b981' },
  { id: 'B', label: 'B · 일반', color: '#0ea5e9' },
  { id: 'C', label: 'C · 관리', color: '#94a3b8' },
]

export function getGrade(id) {
  return GRADES.find((g) => g.id === id) || GRADES[1]
}

// 영업 활동 종류.
export const ACTIVITY_TYPES = [
  { id: 'visit', label: '방문', icon: '🚗' },
  { id: 'call', label: '전화', icon: '📞' },
  { id: 'email', label: '메일', icon: '✉️' },
  { id: 'meeting', label: '미팅', icon: '🤝' },
  { id: 'etc', label: '기타', icon: '📝' },
]

export function getActivityType(id) {
  return ACTIVITY_TYPES.find((t) => t.id === id) || ACTIVITY_TYPES[4]
}
