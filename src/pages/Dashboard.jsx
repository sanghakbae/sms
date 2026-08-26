import { useMemo } from 'react'
import { useApp } from '../context/AppContext.jsx'
import StatCard from '../components/StatCard.jsx'
import { compactWon, formatWon, monthKey, monthLabel } from '../lib/format.js'
import {
  monthlyWon,
  ownerLeaderboard,
  pipelineSummary,
  stageBreakdown,
  targetProgress,
  winRate,
} from '../lib/stats.js'
import { getStage } from '../lib/pipeline.js'

export default function Dashboard() {
  const { deals, customers, targets } = useApp()
  const month = monthKey()

  const won = useMemo(() => monthlyWon(deals, month), [deals, month])
  const pipe = useMemo(() => pipelineSummary(deals), [deals])
  const breakdown = useMemo(() => stageBreakdown(deals), [deals])
  const rate = useMemo(() => winRate(deals), [deals])
  const board = useMemo(() => ownerLeaderboard(deals, month), [deals, month])

  const target = Number(targets[month]) || 0
  const progress = targetProgress(won.amount, target)
  const openTotal = breakdown
    .filter((r) => !r.stage.closed)
    .reduce((s, r) => s + r.count, 0)
  const maxStageAmount = Math.max(1, ...breakdown.filter((r) => !r.stage.closed).map((r) => r.amount))

  return (
    <main className="page dashboard">
      <div className="stat-grid">
        <StatCard
          label={`${monthLabel(month)} 수주`}
          value={compactWon(won.amount)}
          sub={target > 0 ? `목표 ${compactWon(target)} · ${progress ?? 0}%` : `${won.count}건 성사`}
          accent="#10b981"
          progress={progress}
        />
        <StatCard
          label="진행중 파이프라인"
          value={compactWon(pipe.total)}
          sub={`${pipe.count}건 진행중`}
          accent="#6366f1"
        />
        <StatCard
          label="가중 예상매출"
          value={compactWon(pipe.weighted)}
          sub="확률 반영 전망치"
          accent="#0ea5e9"
        />
        <StatCard
          label="수주율"
          value={rate == null ? '—' : `${rate}%`}
          sub={rate == null ? '종료된 딜 없음' : '수주 / (수주+실패)'}
          accent="#f59e0b"
        />
      </div>

      <section className="panel">
        <h3>파이프라인 단계별</h3>
        <div className="funnel">
          {breakdown.filter((r) => !r.stage.closed).map((r) => (
            <div className="funnel-row" key={r.stage.id}>
              <span className="funnel-name" style={{ color: r.stage.color }}>{r.stage.label}</span>
              <div className="funnel-bar">
                <span style={{ width: `${(r.amount / maxStageAmount) * 100}%`, background: r.stage.color }} />
              </div>
              <span className="funnel-val">{r.count}건 · {compactWon(r.amount)}</span>
            </div>
          ))}
          {openTotal === 0 && <p className="empty">진행중인 영업기회가 없습니다.</p>}
        </div>
      </section>

      <section className="panel">
        <h3>담당자별 실적 · {monthLabel(month)}</h3>
        <div className="leaderboard">
          {board.length === 0 && <p className="empty">데이터가 없습니다.</p>}
          {board.map((row, i) => (
            <div className="lb-row" key={row.key}>
              <span className="lb-rank">{i + 1}</span>
              <span className="lb-who">👤 {row.name}</span>
              <span className="lb-num">
                <b>{compactWon(row.wonAmount)}</b>
                <small>{row.wonCount}건 수주 · 진행 {row.openCount}건</small>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel mini">
        <div className="mini-row">
          <span>등록 거래처</span><b>{customers.length}곳</b>
        </div>
        <div className="mini-row">
          <span>이번 달 최고 수주</span>
          <b>{won.deals.length ? topDeal(won.deals) : '—'}</b>
        </div>
      </section>
    </main>
  )
}

function topDeal(deals) {
  const top = deals.reduce((a, b) => ((Number(b.amount) || 0) > (Number(a.amount) || 0) ? b : a))
  return `${top.title} (${formatWon(top.amount)})`
}
