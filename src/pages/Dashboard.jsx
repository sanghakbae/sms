import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import DealModal from '../components/DealModal.jsx'
import ActivityDetail from '../components/ActivityDetail.jsx'
import { stripMarkdown } from '../lib/markdown.js'
import StatCard from '../components/StatCard.jsx'
import {
  compactWon, daysLeftInYear, formatDate, formatWon,
  monthKey, monthLabel, relativeDay, yearKey, yearLabel,
} from '../lib/format.js'
import {
  closingSoon,
  monthOverMonth,
  monthlyWon,
  overdueDeals,
  pipelineSummary,
  stageFunnel,
  targetProgress,
  teamSummary,
  winRate,
  yearlyWon,
} from '../lib/stats.js'
import { initial } from '../lib/accounts.js'

export default function Dashboard() {
  // 대시보드에서 바로 열어보는 상세 — 목록을 눌러 파이프라인/활동으로 이동하지 않아도 되게.
  const [openDeal, setOpenDeal] = useState(null)
  const [openActivity, setOpenActivity] = useState(null)
  const { deals, customers, activities, targets, ownerTargets, user } = useApp()
  const month = monthKey()
  const year = yearKey()

  const won = useMemo(() => monthlyWon(deals, month), [deals, month])
  const yearWon = useMemo(() => yearlyWon(deals, year), [deals, year])
  const pipe = useMemo(() => pipelineSummary(deals), [deals])
  const funnel = useMemo(() => stageFunnel(deals), [deals])
  const rate = useMemo(() => winRate(deals), [deals])
  const board = useMemo(() => teamSummary(deals, customers, activities, month), [deals, customers, activities, month])
  const yearAlloc = useMemo(() => (ownerTargets && ownerTargets[year]) || {}, [ownerTargets, year])
  const mom = useMemo(() => monthOverMonth(deals, month), [deals, month])
  const overdue = useMemo(() => overdueDeals(deals), [deals])
  const soon = useMemo(() => closingSoon(deals, 30), [deals])
  const recent = useMemo(() => (activities || []).slice(0, 5), [activities])

  // 목표는 연 단위로 잡는다. 달성률도 올해 누적 기준.
  const target = Number(targets[year]) || 0
  const progress = targetProgress(yearWon.amount, target)
  const remain = Math.max(0, target - yearWon.amount)
  const daysLeft = daysLeftInYear()
  const openStages = funnel.filter((r) => !r.stage.closed)
  const maxReached = Math.max(1, ...funnel.map((r) => r.reached))
  const totalLost = funnel.reduce((s, r) => s + r.lostCount, 0)

  return (
    <main className="page dashboard">
      {/* 이번 달 목표 — 대시보드에서 가장 먼저 답해야 할 질문. */}
      <section className="hero">
        <div className="hero-main">
          <span className="hero-label">{yearLabel(year)} 누적 수주</span>
          <strong className="hero-value">{compactWon(yearWon.amount)}</strong>
          <span className="hero-sub">
            {yearWon.count}건 성사
            <em className="sep">·</em>
            {monthLabel(month)} {compactWon(won.amount)}
            {mom != null && (
              <em className={mom >= 0 ? 'up' : 'down'}>
                {mom >= 0 ? '▲' : '▼'} 전월 대비 {Math.abs(mom)}%
              </em>
            )}
          </span>
        </div>

        {target > 0 ? (
          <div className="hero-goal">
            <div className="goal-top">
              <span>{yearLabel(year)} 목표 {compactWon(target)}</span>
              <b>{progress}%</b>
            </div>
            <div className="goal-bar">
              <span style={{ width: `${Math.min(100, progress)}%` }} />
            </div>
            <div className="goal-foot">
              {remain > 0
                ? <>남은 {compactWon(remain)} · {daysLeft}일 남음</>
                : <>목표 달성 · {daysLeft}일 남음</>}
            </div>
          </div>
        ) : (
          <div className="hero-goal empty-goal">
            <b>{yearLabel(year)} 목표가 없습니다</b>
            <span>팀 관리 → 연 매출목표에서 지정하면 달성률이 여기에 표시됩니다.</span>
          </div>
        )}
      </section>

      <div className="stat-grid">
        <StatCard
          label="영업기회 파이프라인"
          value={compactWon(pipe.total)}
          sub={`검증 통과 ${pipe.count}건 · 리드 ${pipe.leadCount}건 별도`}
          accent="#6366f1"
        />
        <StatCard
          label="가중 예상매출"
          value={compactWon(pipe.weighted)}
          sub="단계별 확률 반영 · 리드 제외"
          accent="#0ea5e9"
        />
        <StatCard label="수주율" value={rate == null ? '—' : `${rate}%`} sub={rate == null ? '종료된 딜 없음' : `실패 ${totalLost}건 대비`} accent="#f59e0b" />
        <StatCard label="지연" value={`${overdue.length}건`} sub={overdue.length ? '마감일 초과' : '지연 없음'} accent={overdue.length ? '#e5484d' : '#10b981'} />
      </div>

      {/* 단계별 전환 — 어디서 새는지 보려는 것. 잔량 막대 + 다음 단계 전환율. */}
      <section className="panel">
        <h3>단계별 전환</h3>
        {pipe.openCount === 0 ? (
          <p className="empty">진행중인 영업기회가 없습니다.</p>
        ) : (
          <div className="funnel2">
            {openStages.map((r) => (
              <div className={`fn-row${r.stage.preQualified ? ' pre' : ''}`} key={r.stage.id}>
                <span className="fn-name" style={{ color: r.stage.color }}>{r.stage.label}</span>
                <div className="fn-track">
                  <span className="fn-fill" style={{ width: `${(r.reached / maxReached) * 100}%`, background: r.stage.color }} />
                  <span className="fn-inline">{r.count}건 · {compactWon(r.amount)}</span>
                </div>
                <span className="fn-conv">
                  {r.conversion != null ? `→ ${r.conversion}%` : '—'}
                  {r.lostCount > 0 && <em> 실패 {r.lostCount}</em>}
                </span>
              </div>
            ))}
          </div>
        )}
        <small className="hint">
          리드는 아직 검증 전 단서라 예상매출에 넣지 않습니다. 검증을 통과하면 영업기회로 셉니다.
        </small>
      </section>

      {/*
        지금 손대야 할 딜. 대시보드가 행동으로 이어지게 하는 자리다.
        지연은 '없는 게 정상' 이라 비었을 때는 아예 내리고 30일 예정만 남긴다 —
        빈 카드로 자리를 반쯤 비워두면 정작 지연이 생겼을 때 눈에 안 걸린다.
        건수는 위 요약 카드에 이미 있다.
      */}
      <div className={`split${overdue.length === 0 ? ' one' : ''}`}>
        {overdue.length > 0 && (
          <section className="panel">
            <h3>지연된 영업기회 <b className="count-warn">{overdue.length}</b></h3>
            <div className="mini-deals">
              {overdue.slice(0, 5).map((d) => (
                <MiniDeal key={d.id} deal={d} overdue onClick={() => setOpenDeal(d)} />
              ))}
            </div>
          </section>
        )}

        <section className="panel">
          <h3>30일 내 마감 예정</h3>
          {soon.length === 0
            ? <p className="empty">예정된 마감이 없습니다.</p>
            : (
              <div className="mini-deals">
                {soon.slice(0, 5).map((d) => (
                  <MiniDeal key={d.id} deal={d} onClick={() => setOpenDeal(d)} />
                ))}
              </div>
            )}
        </section>
      </div>

      <div className="split">
        <section className="panel">
          <h3>담당자별 실적 · {monthLabel(month)}</h3>
          {board.length === 0 && <p className="empty">데이터가 없습니다.</p>}
          <div className="leaderboard">
            {board.map((row, i) => {
              const alloc = Number(yearAlloc[row.email]) || 0
              const pct = targetProgress(row.yearWonAmount, alloc)
              const me = row.email === user.email
              return (
                <div className={`lb-row${me ? ' me' : ''}`} key={row.key}>
                  <span className="lb-rank">{i + 1}</span>
                  <span className="lb-who">{row.name}</span>
                  <span className="lb-num">
                    <b>{compactWon(row.wonAmount)}</b>
                    <small>
                      {alloc > 0
                        ? `연 ${compactWon(row.yearWonAmount)} / ${compactWon(alloc)} · ${pct}%`
                        : `${row.wonCount}건 수주 · 진행 ${row.openCount}건`}
                    </small>
                  </span>
                </div>
              )
            })}
          </div>
        </section>

        <section className="panel">
          <h3>최근 활동</h3>
          {recent.length === 0
            ? <p className="empty">기록된 활동이 없습니다.</p>
            : (
              <div className="recent">
                {recent.map((a) => (
                  <button
                    type="button"
                    className="rc-row"
                    key={a.id}
                    onClick={() => setOpenActivity(a)}
                  >
                    <span className="rc-avatar">{initial(a.ownerName)}</span>
                    <span className="rc-body">
                      <span className="rc-head">
                        <b>{a.customerName || '거래처 미지정'}</b>
                        <span>{formatDate(a.date)} · {relativeDay(a.date)}</span>
                      </span>
                      {/* 서식 기호를 떼고 한 줄만 — 목록에서 마크다운을 그리면 줄이 흐트러진다. */}
                      {a.note && <span className="rc-note">{stripMarkdown(a.note)}</span>}
                    </span>
                  </button>
                ))}
              </div>
            )}
        </section>
      </div>

      <section className="panel mini">
        <div className="mini-row"><span>등록 거래처</span><b>{customers.length}곳</b></div>
        <div className="mini-row">
          <span>이번 달 최고 수주</span>
          <b>{won.deals.length ? topDeal(won.deals) : '—'}</b>
        </div>
      </section>

      {openDeal && <DealModal deal={openDeal} onClose={() => setOpenDeal(null)} />}
      {openActivity && (
        <ActivityDetail activity={openActivity} onClose={() => setOpenActivity(null)} />
      )}
    </main>
  )
}

/** 대시보드 목록용 한 줄 딜. 보드 카드보다 조용하게. 누르면 상세가 열린다. */
function MiniDeal({ deal, overdue, onClick }) {
  return (
    <button type="button" className={`md-row${overdue ? ' overdue' : ''}`} onClick={onClick}>
      <span className="md-main">
        <b>{deal.title}</b>
        <small>{deal.customerName || '거래처 미지정'} · {deal.ownerName || '담당 없음'}</small>
      </span>
      <span className="md-side">
        <b>{compactWon(deal.amount)}</b>
        <small>{formatDate(deal.expectedClose)} · {relativeDay(deal.expectedClose)}</small>
      </span>
    </button>
  )
}

function topDeal(deals) {
  const top = deals.reduce((a, b) => ((Number(b.amount) || 0) > (Number(a.amount) || 0) ? b : a))
  return `${top.title} (${formatWon(top.amount)})`
}
