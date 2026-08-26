import { useMemo } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { compactWon, monthKey, monthLabel, shiftMonth } from '../lib/format.js'
import { monthlyWon, targetProgress } from '../lib/stats.js'

export default function Settings() {
  const { user, deals, targets, logout } = useApp()

  // 최근 6개월 목록.
  const months = useMemo(() => {
    const base = monthKey()
    return [0, 1, 2, 3, 4, 5].map((i) => shiftMonth(base, -i))
  }, [])

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
        <h3>월별 목표 현황</h3>
        {user.isAdmin && <p className="hint">목표 금액 설정은 <b>팀 관리 → 팀 매출목표</b>에서 합니다.</p>}
        <div className="target-list">
          {months.map((m) => {
            const t = Number(targets[m]) || 0
            const w = monthlyWon(deals, m)
            const p = targetProgress(w.amount, t)
            return (
              <div className="target-row" key={m}>
                <span className="tr-month">{monthLabel(m)}</span>
                {/* 달성률 막대는 목표가 있을 때만 뜻이 있다. 없으면 빈 막대 대신 이유를 적는다. */}
                {t > 0
                  ? <div className="tr-bar"><span style={{ width: `${Math.min(100, p ?? 0)}%` }} /></div>
                  : <span className="tr-none">목표 미설정</span>}
                <span className="tr-num">
                  {compactWon(w.amount)} / {t ? compactWon(t) : '—'}
                  {p != null && <small> {p}%</small>}
                </span>
              </div>
            )
          })}
        </div>
      </section>

      <p className="foot-note">영업 관리시스템 · React + Firebase</p>
    </main>
  )
}
