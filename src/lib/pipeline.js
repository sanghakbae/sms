// 영업 파이프라인 단계 정의.
// 순서대로 진행하며 won 이 마지막(종료) 단계다.
// 실패는 단계가 아니라 딜에 붙는 lost 플래그다 — 아래 주석 참고.
// probability 는 그 단계 딜의 기본 성공확률(가중 예상매출 계산에 쓴다).

export const STAGES = [
  { id: 'lead', label: '리드', short: '발굴', color: '#64748b', probability: 10, closed: false },
  { id: 'contact', label: '상담', short: '접촉', color: '#0ea5e9', probability: 25, closed: false },
  { id: 'proposal', label: '제안', short: '견적', color: '#6366f1', probability: 50, closed: false },
  { id: 'negotiation', label: '협상', short: '조율', color: '#f59e0b', probability: 80, closed: false },
  { id: 'won', label: '수주', short: '성공', color: '#10b981', probability: 100, closed: true, win: true },
]

// 실패는 '단계'가 아니라 '상태'다. 제안에서 깨질 수도, 협상에서 깨질 수도 있으니
// 어느 단계에서 죽었는지를 남겨야 회고와 단계별 이탈 분석이 된다.
// 그래서 딜의 stage 는 그대로 두고 lost 플래그로 표시한다.
export const LOST = { id: 'lost', label: '실패', color: '#ef4444' }

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

export function isOpen(id) {
  return !getStage(id).closed
}

/* ------------------------- 딜 단위 판정(lost 플래그 반영) ------------------------- */

/** 실패로 마감된 딜인가. */
export function isDealLost(deal) {
  return Boolean(deal && deal.lost)
}

/** 실제로 수주한 딜인가 — 실패 플래그가 붙으면 수주가 아니다. */
export function isDealWon(deal) {
  return !isDealLost(deal) && isWon(deal && deal.stage)
}

/** 아직 진행중인 딜인가. */
export function isDealOpen(deal) {
  return !isDealLost(deal) && isOpen(deal && deal.stage)
}

/** 딜의 성공확률 — 실패한 딜은 0%. */
export function dealProbability(deal) {
  return isDealLost(deal) ? 0 : stageProbability(deal && deal.stage)
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
