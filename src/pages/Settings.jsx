import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { compactWon, monthKey, monthLabel } from '../lib/format.js'
import { monthlyWon, targetProgress } from '../lib/stats.js'

export default function Settings() {
  const { user, deals, targets, setMonthlyTarget, logout, notify } = useApp()
  const [month, setMonth] = useState(monthKey())
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)

  const current = Number(targets[month]) || 0
  const won = useMemo(() => monthlyWon(deals, month), [deals, month])
  const progress = targetProgress(won.amount, current)

  const save = async (e) => {
    e.preventDefault()
    if (!user.isAdmin) return
    setBusy(true)
    try {
      await setMonthlyTarget(month, Number(amount) || 0)
      notify('목표를 저장했습니다.')
      setAmount('')
    } finally { setBusy(false) }
  }

  // 최근 6개월 목록.
  const months = useMemo(() => {
    const out = []
    const d = new Date(`${monthKey()}-01T00:00:00`)
    for (let i = 0; i < 6; i += 1) {
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
      d.setMonth(d.getMonth() - 1)
    }
    return out
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
        <h3>월 매출목표</h3>
        {user.isAdmin ? (
          <form onSubmit={save} className="form">
            <div className="grid2">
              <label className="field"><span>월</span>
                <select value={month} onChange={(e) => setMonth(e.target.value)}>
                  {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
                </select>
              </label>
              <label className="field"><span>목표 금액(원)</span>
                <input value={amount} onChange={(e) => setAmount(e.target.value)}
                  placeholder={current ? String(current) : '50000000'} inputMode="numeric" />
              </label>
            </div>
            <div className="target-now">
              현재 {monthLabel(month)} 목표: <b>{current ? compactWon(current) : '미설정'}</b>
              {' · '}수주 {compactWon(won.amount)}
              {progress != null && ` (${progress}%)`}
            </div>
            <button type="submit" className="primary block" disabled={busy}>목표 저장</button>
          </form>
        ) : (
          <p className="empty">목표 설정은 팀장만 가능합니다.</p>
        )}
      </section>

      <section className="panel">
        <h3>월별 목표 현황</h3>
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
