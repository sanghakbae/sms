// 거래 — 수주 이후. 계약이 끝나고 돈이 들어왔는지를 본다.
//
// 파이프라인은 '수주' 에서 끝나지만 현금은 거기서 시작한다.
// 수주액과 입금액을 나눠 보지 않으면 목표 달성률이 실제 현금과 어긋난다.

import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import PaymentModal from '../components/PaymentModal.jsx'
import StatCard from '../components/StatCard.jsx'
import { compactWon, formatDate, yearLabel } from '../lib/format.js'
import {
  PAID, SETTLEMENT,
  settlementColor, settlementLabel, tradeSummary, trades,
} from '../lib/settlement.js'
import { closedMonth } from '../lib/stats.js'

export default function Trades() {
  const { deals, user } = useApp()
  const [filter, setFilter] = useState('')
  const [year, setYear] = useState('')
  const [open, setOpen] = useState(null)

  const teamDeals = useMemo(
    () => deals.filter((d) => d.teamId === user.teamId),
    [deals, user.teamId],
  )
  const all = useMemo(() => trades(teamDeals), [teamDeals])

  const years = useMemo(() => {
    const set = new Set()
    for (const t of all) {
      const m = closedMonth(t)
      if (m) set.add(m.slice(0, 4))
    }
    return [...set].sort().reverse()
  }, [all])

  const rows = useMemo(() => all.filter((t) => {
    if (filter && t.settlement !== filter) return false
    if (year && closedMonth(t).slice(0, 4) !== year) return false
    return true
  }), [all, filter, year])

  const sum = useMemo(() => tradeSummary(rows), [rows])

  // 목록이 갱신되면 열려 있는 모달도 최신 문서로.
  const current = open ? teamDeals.find((d) => d.id === open.id) || null : null

  return (
    <main className="page">
      <div className="stat-grid trade-summary-grid">
        <StatCard label="거래" value={`${sum.count}건`} sub={`수주 ${compactWon(sum.wonAmount)}`} />
        <StatCard label="입금" value={compactWon(sum.paidAmount)} sub={`완납 ${sum.settledCount}건`} accent="#10b981" />
        <StatCard
          label="미수금"
          value={compactWon(sum.unpaidAmount)}
          sub={sum.unpaidCount ? `${sum.unpaidCount}건 미완납` : '모두 받음'}
          accent={sum.unpaidAmount > 0 ? '#e5484d' : '#10b981'}
        />
        <StatCard
          label="회수율"
          value={sum.wonAmount > 0 ? `${Math.round((sum.paidAmount / sum.wonAmount) * 100)}%` : '—'}
          sub="입금 / 수주"
        />
      </div>

      <div className="chips">
        <button type="button" className={`chip${filter === '' ? ' on' : ''}`} onClick={() => setFilter('')}>전체</button>
        {SETTLEMENT.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`chip${filter === s.id ? ' on' : ''}`}
            style={{ '--c': s.color }}
            onClick={() => setFilter(filter === s.id ? '' : s.id)}
          >{s.label}</button>
        ))}
        {years.length > 1 && (
          <select className="chip-select" value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">전체 연도</option>
            {years.map((y) => <option key={y} value={y}>{yearLabel(y)}</option>)}
          </select>
        )}
      </div>

      {rows.length === 0
        ? <p className="empty">해당하는 거래가 없습니다.</p>
        : (
          <div className="trade-list">
            {rows.map((t) => (
              <button
                type="button"
                className="trade-row"
                key={t.id}
                onClick={() => setOpen(t)}
                style={{ '--c': settlementColor(t.settlement) }}
              >
                <span className="tr-main">
                  <b>{t.title}</b>
                  <small>
                    {t.customerName || '거래처 미지정'}
                    {t.serviceName ? ` · ${t.serviceName}` : ''}
                    {t.closedDate ? ` · ${formatDate(t.closedDate)} 수주` : ''}
                  </small>
                </span>
                <span className="tr-nums">
                  <b>{compactWon(t.amount)}</b>
                  <small>
                    {t.settlement === PAID
                      ? '완납'
                      : `입금 ${compactWon(t.paid)} · 미수 ${compactWon(t.unpaid)}`}
                  </small>
                </span>
                <span className="pill" style={{ '--c': settlementColor(t.settlement) }}>
                  {settlementLabel(t.settlement)}
                </span>
              </button>
            ))}
          </div>
        )}

      {current && <PaymentModal deal={current} onClose={() => setOpen(null)} />}
    </main>
  )
}
