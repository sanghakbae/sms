import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import {
  compactWon, daysLeftInYear, formatWon, monthKey, monthLabel, yearKey, yearLabel,
} from '../lib/format.js'
import {
  monthlySeries, targetProgress, teamSummary, yearlyWon, yearsWithData,
} from '../lib/stats.js'
import { getActivityType, getGrade, getStage } from '../lib/pipeline.js'
import {
  BOOTSTRAP_ADMINS,
  initial,
  isAdminEmail,
  isBootstrapAdmin,
  looksLikeEmail,
  normalizeEmail,
} from '../lib/accounts.js'
import { downloadCsv, toCsv } from '../lib/csv.js'

/** 관리자 전용 화면 — 팀원 현황, 관리자 명단, 데이터 내보내기. */
export default function Team() {
  const { deals, customers, activities, admins, targets, user, setAdmins, setYearlyTarget, notify } = useApp()
  const month = monthKey()
  const team = useMemo(
    () => teamSummary(deals, customers, activities, month),
    [deals, customers, activities, month],
  )

  return (
    <main className="page">
      <TeamTarget
        deals={deals}
        targets={targets}
        setYearlyTarget={setYearlyTarget}
        notify={notify}
      />

      <section className="panel">
        <h3>팀원 현황 · {monthLabel(month)}</h3>
        {team.length === 0 && <p className="empty">아직 데이터를 만든 팀원이 없습니다.</p>}
        <div className="team-list">
          {team.map((m) => (
            <div className="team-row" key={m.key}>
              <span className="avatar">{initial(m.name)}</span>
              <div className="team-who">
                <b>
                  {m.name}
                  {isAdminEmail(m.email, admins) && <span className="tag admin">팀장</span>}
                </b>
                <small>{m.email || '이메일 없음'}</small>
              </div>
              <div className="team-nums">
                <span><i>이번달 수주</i><b>{compactWon(m.wonAmount)}</b><small>{m.wonCount}건</small></span>
                <span><i>진행중</i><b>{compactWon(m.openAmount)}</b><small>{m.openCount}건</small></span>
                <span><i>지연</i><b className={m.overdueCount ? 'warn' : ''}>{m.overdueCount}건</b><small>마감 초과</small></span>
                <span><i>실패</i><b>{m.lostCount}건</b><small>회고 대상</small></span>
                <span><i>거래처·활동</i><b>{m.customerCount}·{m.activityCount}</b><small>등록 건수</small></span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <AdminRoster admins={admins} user={user} setAdmins={setAdmins} notify={notify} />

      <ExportPanel deals={deals} customers={customers} activities={activities} notify={notify} />
    </main>
  )
}

/* ------------------------------- 팀 목표(수주액) ------------------------------- */

function TeamTarget({ deals, targets, setYearlyTarget, notify }) {
  const [year, setYear] = useState(yearKey())
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)

  const years = useMemo(() => yearsWithData(deals), [deals])
  const target = Number(targets[year]) || 0
  const won = useMemo(() => yearlyWon(deals, year), [deals, year])
  const progress = targetProgress(won.amount, target)
  const series = useMemo(() => monthlySeries(deals, year), [deals, year])
  const maxMonth = Math.max(1, ...series.map((m) => m.amount))
  const remain = Math.max(0, target - won.amount)
  const typed = Number(String(amount).replace(/[^0-9]/g, '')) || 0
  const isThisYear = year === yearKey()

  const save = async (e) => {
    e.preventDefault()
    if (String(amount).trim() === '') { notify('금액을 입력해주세요.'); return }
    setBusy(true)
    try {
      await setYearlyTarget(year, typed)
      notify(`${yearLabel(year)} 목표를 ${compactWon(typed)} 로 저장했습니다.`)
      setAmount('')
    } finally { setBusy(false) }
  }

  return (
    <section className="panel">
      <h3>연 매출목표</h3>
      <form onSubmit={save} className="form">
        <div className="grid2">
          <label className="field"><span>연도</span>
            <select value={year} onChange={(e) => setYear(e.target.value)}>
              {years.map((y) => <option key={y} value={y}>{yearLabel(y)}</option>)}
            </select>
          </label>
          <label className="field"><span>연 목표 수주액(원)</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={target ? String(target) : '3000000000'}
              inputMode="numeric"
            />
            <small className={`amount-preview${typed ? '' : ' zero'}`}>
              {String(amount).trim() === '' ? '숫자만 입력하세요' : `${formatWon(typed)} · ${compactWon(typed)}`}
            </small>
          </label>
        </div>
        <button type="submit" className="primary block" disabled={busy}>목표 저장</button>
      </form>

      {/* 연 목표 대비 현재 위치 */}
      <div className="year-summary">
        <div className="ys-top">
          <span>{yearLabel(year)} 누적 수주 <b>{compactWon(won.amount)}</b> · {won.count}건</span>
          <span>
            목표 <b>{target ? compactWon(target) : '미설정'}</b>
            {progress != null && <b className="pct"> {progress}%</b>}
          </span>
        </div>
        {target > 0 && (
          <>
            <div className="goal-bar"><span style={{ width: `${Math.min(100, progress)}%` }} /></div>
            <div className="ys-foot">
              {remain > 0
                ? `남은 ${compactWon(remain)}${isThisYear ? ` · ${daysLeftInYear()}일 남음` : ''}`
                : '목표 달성'}
            </div>
          </>
        )}
      </div>

      {/* 1~12월 실적 — 연 목표가 어떻게 쌓이는지 */}
      <div className="month-grid">
        {series.map((m) => (
          <div className={`mg-cell${m.amount > 0 ? ' has' : ''}`} key={m.month}>
            <span className="mg-month">{m.monthNo}월</span>
            <div className="mg-bar">
              <span style={{ height: `${(m.amount / maxMonth) * 100}%` }} />
            </div>
            <span className="mg-amount">{m.amount > 0 ? compactWon(m.amount) : '—'}</span>
            <span className="mg-count">{m.count > 0 ? `${m.count}건` : ''}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

/* --------------------------------- 관리자 명단 --------------------------------- */

function AdminRoster({ admins, user, setAdmins, notify }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)

  // 코드에 박힌 기본 관리자는 항상 위에, 지울 수 없는 항목으로 보여준다.
  const roster = useMemo(() => {
    const extra = (admins || []).map(normalizeEmail).filter((e) => !isBootstrapAdmin(e))
    return [
      ...BOOTSTRAP_ADMINS.map((e) => ({ email: e, fixed: true })),
      ...[...new Set(extra)].map((e) => ({ email: e, fixed: false })),
    ]
  }, [admins])

  const add = async (e) => {
    e.preventDefault()
    const next = normalizeEmail(email)
    if (!looksLikeEmail(next)) { notify('이메일 형식을 확인해주세요.'); return }
    if (roster.some((r) => r.email === next)) { notify('이미 관리자입니다.'); return }
    setBusy(true)
    try {
      await setAdmins([...(admins || []), next])
      notify(`${next} 을(를) 관리자로 추가했습니다.`)
      setEmail('')
    } finally { setBusy(false) }
  }

  const remove = async (target) => {
    if (!window.confirm(`${target} 의 관리자 권한을 해제할까요?`)) return
    await setAdmins((admins || []).filter((e) => normalizeEmail(e) !== target))
    notify('관리자 권한을 해제했습니다.')
  }

  return (
    <section className="panel">
      <h3>관리자 명단</h3>
      <div className="admin-list">
        {roster.map((r) => (
          <div className="admin-row" key={r.email}>
            <span className="admin-mail">{r.email}</span>
            {r.fixed
              ? <span className="tag">기본 · 해제 불가</span>
              : r.email === normalizeEmail(user.email)
                ? <span className="tag">본인</span>
                : <button type="button" className="danger ghost sm" onClick={() => remove(r.email)}>해제</button>}
          </div>
        ))}
      </div>
      <form onSubmit={add} className="admin-add">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="추가할 관리자 이메일"
          inputMode="email"
        />
        <button type="submit" className="primary" disabled={busy}>추가</button>
      </form>
      <small className="hint">
        기본 관리자는 코드에 박혀 있어 화면에서 해제할 수 없습니다 — 명단을 잘못 비워
        아무도 들어오지 못하는 상황을 막기 위한 장치입니다.
      </small>
    </section>
  )
}

/* -------------------------------- 데이터 내보내기 -------------------------------- */

const CUSTOMER_COLS = [
  { key: 'name', label: '거래처명' },
  { key: 'industry', label: '업종' },
  { label: '등급', value: (c) => getGrade(c.grade).label },
  { key: 'contactName', label: '담당자' },
  { key: 'phone', label: '연락처' },
  { key: 'email', label: '이메일' },
  { key: 'ownerName', label: '영업담당' },
  { key: 'memo', label: '메모' },
]

const DEAL_COLS = [
  { key: 'title', label: '제목' },
  { key: 'customerName', label: '거래처' },
  { key: 'serviceName', label: '대상 서비스' },
  { label: '단계', value: (d) => getStage(d.stage).label },
  { label: '상태', value: (d) => (d.lost ? '실패' : d.stage === 'won' ? '수주' : '진행중') },
  { key: 'lostReason', label: '실패 회고' },
  { key: 'amount', label: '금액(원)' },
  { key: 'expectedClose', label: '예상 마감일' },
  { key: 'closedDate', label: '종료일' },
  { key: 'ownerName', label: '영업담당' },
  { key: 'ownerEmail', label: '담당 이메일' },
  { key: 'memo', label: '메모' },
]

const ACTIVITY_COLS = [
  { key: 'date', label: '일자' },
  { label: '종류', value: (a) => getActivityType(a.type).label },
  { key: 'customerName', label: '거래처' },
  { key: 'ownerName', label: '작성자' },
  { key: 'note', label: '내용' },
]

function ExportPanel({ deals, customers, activities, notify }) {
  const save = (name, rows, cols) => {
    if (!rows.length) { notify('내보낼 데이터가 없습니다.'); return }
    downloadCsv(`${name}-${monthKey()}.csv`, toCsv(rows, cols))
    notify(`${rows.length}건을 내려받았습니다.`)
  }

  return (
    <section className="panel">
      <h3>데이터 내보내기</h3>
      <div className="export-row">
        <button type="button" onClick={() => save('거래처', customers, CUSTOMER_COLS)}>
          거래처 {customers.length}건
        </button>
        <button type="button" onClick={() => save('영업기회', deals, DEAL_COLS)}>
          영업기회 {deals.length}건
        </button>
        <button type="button" onClick={() => save('영업활동', activities, ACTIVITY_COLS)}>
          영업활동 {activities.length}건
        </button>
      </div>
      <small className="hint">엑셀에서 바로 열리도록 UTF-8 BOM 을 붙인 CSV 로 받습니다.</small>
    </section>
  )
}
