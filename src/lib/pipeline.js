// 영업 단계 정의. 순서대로 진행하며 won 이 마지막(종료) 단계다.
// 실패는 단계가 아니라 딜에 붙는 lost 플래그다 — 아래 주석 참고.
// probability 는 그 단계 딜의 기본 성공확률(가중 예상매출 계산에 쓴다).
// summary  한 줄 정의 — 이 단계가 무엇인가
// entry    여기로 올릴 조건 — 무엇이 확인돼야 하나
// exit     다음으로 넘어가는 신호
// watch    이 단계에서 흔히 하는 실수
export const STAGES = [
  {
    id: 'contact',
    label: '상담',
    short: '접촉',
    color: '#0ea5e9',
    probability: 30,
    closed: false,
    summary: '요구사항을 파고드는 단계. 무엇을 왜 필요로 하는지 듣는다.',
    entry: '미팅·데모·통화로 실제 논의가 시작됐을 때.',
    exit: '요구사항이 정리되고 견적을 달라는 말이 나오면 제안으로.',
    watch: '결정권자를 아직 못 만났다면 여기 머물러야 한다. 실무자 호감만 보고 올리면 제안에서 깨진다.',
  },
  {
    id: 'proposal',
    label: '제안',
    short: '견적',
    color: '#6366f1',
    probability: 50,
    closed: false,
    summary: '제안서와 견적이 고객 손에 넘어간 상태.',
    entry: '가격이 포함된 제안서·견적서를 정식으로 전달했을 때.',
    exit: '고객이 조건을 조정하자고 하면 협상으로.',
    watch: '보냈다고 올리는 게 아니라 상대가 받아서 검토에 들어갔는지 확인하고 올린다. 예상 마감일을 여기서 반드시 채운다.',
  },
  {
    id: 'negotiation',
    label: '협상',
    short: '조율',
    color: '#f59e0b',
    probability: 80,
    closed: false,
    summary: '살 마음은 정해졌고 조건을 맞추는 단계.',
    entry: '단가·기간·계약조건을 두고 실제로 주고받기 시작했을 때.',
    exit: '계약서에 서명하거나 발주가 나오면 수주.',
    watch: '여기서 깨지면 금액이 큰 만큼 타격도 크다. 실패로 마감할 때 회고를 반드시 남긴다.',
  },
  {
    id: 'won',
    label: '수주',
    short: '성공',
    color: '#10b981',
    probability: 100,
    closed: true,
    win: true,
    summary: '계약이 확정된 상태. 매출로 잡힌다.',
    entry: '계약 체결 또는 발주서 접수.',
    exit: '—',
    watch: '종료일이 실적 집계 기준이다. 계약일과 다르면 종료일을 고쳐준다.',
  },
]

// 실패는 '단계'가 아니라 '상태'다. 제안에서 깨질 수도, 협상에서 깨질 수도 있으니
// 어느 단계에서 죽었는지를 남겨야 회고와 단계별 이탈 분석이 된다.
// 그래서 딜의 stage 는 그대로 두고 lost 플래그로 표시한다.
export const LOST = { id: 'lost', label: '실패', color: '#ef4444' }

/** 아직 살아있는(종료 안 된) 단계 목록. */
export const OPEN_STAGES = STAGES.filter((s) => !s.closed)

const BY_ID = Object.fromEntries(STAGES.map((s) => [s.id, s]))

/** 예전 리드·검증 데이터는 없애지 않고 상담 단계로 합쳐서 보여준다. */
export function normalizeStageId(id) {
  return id === 'lead' || id === 'qualify' ? 'contact' : id
}

export function getStage(id) {
  return BY_ID[normalizeStageId(id)] || STAGES[0]
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

/** 진행 중인 영업 건인가. */
export function isQualified(deal) {
  return isDealOpen(deal)
}

/** 딜의 성공확률 — 실패한 딜은 0%. */
export function dealProbability(deal) {
  return isDealLost(deal) ? 0 : stageProbability(deal && deal.stage)
}

// 거래처 등급 — 매출 기여도/전략적 중요도.
// 거래처 등급. label 옆의 desc 가 곧 판정 기준이다 —
// 기준을 적어두지 않으면 사람마다 다르게 매겨서 등급이 의미를 잃는다.
export const GRADES = [
  {
    id: 'A',
    label: 'A · 핵심',
    color: '#10b981',
    desc: '연 5천만원 이상이거나 다년 계약. 확장 여지가 크다.',
    cadence: '분기 1회 이상 정기 접촉',
  },
  {
    id: 'B',
    label: 'B · 일반',
    color: '#0ea5e9',
    desc: '거래 중이거나 도입 가능성이 확인된 곳.',
    cadence: '반기 1회 접촉',
  },
  {
    id: 'C',
    label: 'C · 관리',
    color: '#94a3b8',
    desc: '소액·단발이거나 당분간 진전이 없는 곳.',
    cadence: '연 1회 상태 확인',
  },
]

export function getGrade(id) {
  return GRADES.find((g) => g.id === id) || GRADES[1]
}

// 업종. 표준산업분류를 영업 현장에서 쓰는 단위로 추린 것이다.
// 자유 입력이면 '제약'과 '제약·바이오'가 따로 쌓여 필터가 무의미해진다.
// 기존 데이터에 있던 값은 반드시 그대로 남길 것 — 지우면 그 거래처의 업종이 사라진다.
export const INDUSTRY_GROUPS = [
  {
    group: 'IT·통신',
    items: ['IT·소프트웨어', '시스템통합(SI)', '인터넷·플랫폼', 'AI·데이터', '보안',
      '게임', '통신', '반도체', '전자·부품', '하드웨어·디바이스'],
  },
  {
    group: '제조',
    items: ['자동차', '기계·장비', '화학·소재', '철강·금속', '조선·중공업',
      '섬유·의류', '생활용품', '인쇄·포장'],
  },
  {
    group: '바이오·의료',
    items: ['제약·바이오', '의료기기', '헬스케어', '병원·의료기관'],
  },
  {
    group: '금융',
    items: ['금융·보험', '은행', '증권·자산운용', '카드·결제', '핀테크'],
  },
  {
    group: '교육·연구',
    items: ['대학·연구', '교육', '학원·에듀테크', '연구기관'],
  },
  {
    group: '공공·비영리',
    items: ['공공기관', '중앙·지방정부', '협회·단체', '비영리'],
  },
  {
    group: '유통·소비재',
    items: ['식품·유통', '유통·리테일', '이커머스', '외식·프랜차이즈', '뷰티·화장품'],
  },
  {
    group: '건설·부동산',
    items: ['건설', '건축·설계', '부동산', '인테리어'],
  },
  {
    group: '운송·물류',
    items: ['물류', '운송·항공', '해운'],
  },
  {
    group: '에너지·환경',
    items: ['에너지', '전력·발전', '환경·폐기물'],
  },
  {
    group: '서비스·전문',
    items: ['회계·컨설팅', '법무', '인사·채용', '광고·마케팅', '디자인',
      '출판·미디어', '방송·콘텐츠', '여행·숙박', '무역'],
  },
  {
    group: '기타',
    items: ['기타'],
  },
]

/** 평평한 업종 목록. */
export const INDUSTRIES = INDUSTRY_GROUPS.flatMap((g) => g.items)

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
