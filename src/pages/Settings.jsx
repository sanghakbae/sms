import { useMemo } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { compactWon, yearKey, yearLabel } from '../lib/format.js'
import { monthlySeries, targetProgress, yearlyWon } from '../lib/stats.js'

export default function Settings() {
  const { user, deals, targets, logout } = useApp()
  const year = yearKey()
  const target = Number(targets[year]) || 0
  const won = useMemo(() => yearlyWon(deals, year), [deals, year])
  const progress = targetProgress(won.amount, target)
  const series = useMemo(() => monthlySeries(deals, year), [deals, year])
  const maxMonth = Math.max(1, ...series.map((m) => m.amount))

  return (
    <main className="page">
      <section className="panel">
        <h3>내 계정</h3>
        <div className="account-box">
          {user.photoURL
            ? <img className="avatar big" src={user.photoURL} alt="" referrerPolicy="no-referrer" />
            : <span className="avatar big">{user.name.charAt(0)}</span>}
          <div>
            <b>{user.name}</b>
            <small>{user.email}{user.isAdmin ? ' · 팀장' : ''}</small>
          </div>
          <button type="button" className="danger ghost" onClick={logout}>로그아웃</button>
        </div>
      </section>

      <section className="panel">
        <h3>{yearLabel(year)} 목표 현황</h3>
        {user.isAdmin && <p className="hint">목표 설정은 <b>팀 관리 → 연 매출목표</b>에서 합니다.</p>}
        <div className="year-summary">
          <div className="ys-top">
            <span>누적 수주 <b>{compactWon(won.amount)}</b> · {won.count}건</span>
            <span>
              목표 <b>{target ? compactWon(target) : '미설정'}</b>
              {progress != null && <b className="pct"> {progress}%</b>}
            </span>
          </div>
          {target > 0 && <div className="goal-bar"><span style={{ width: `${Math.min(100, progress)}%` }} /></div>}
        </div>
        <div className="month-grid">
          {series.map((m) => (
            <div className={`mg-cell${m.amount > 0 ? ' has' : ''}`} key={m.month}>
              <span className="mg-month">{m.monthNo}월</span>
              <div className="mg-bar"><span style={{ height: `${(m.amount / maxMonth) * 100}%` }} /></div>
              <span className="mg-amount">{m.amount > 0 ? compactWon(m.amount) : '—'}</span>
              <span className="mg-count">{m.count > 0 ? `${m.count}건` : ''}</span>
            </div>
          ))}
        </div>
      </section>

      <p className="foot-note">영업 관리시스템 · React + Firebase</p>
    </main>
  )
}
