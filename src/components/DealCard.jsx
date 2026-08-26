import { compactWon, formatDate, relativeDay } from '../lib/format.js'
import { getStage, stageProbability } from '../lib/pipeline.js'

/** 파이프라인 보드/목록에 쓰는 딜 카드. */
export default function DealCard({ deal, onClick }) {
  const prob = stageProbability(deal.stage)
  const overdue =
    !getStage(deal.stage).closed &&
    deal.expectedClose &&
    new Date(deal.expectedClose) < new Date(new Date().toISOString().slice(0, 10))

  return (
    <button type="button" className="deal-card" onClick={onClick}>
      <div className="deal-top">
        <span className="deal-title">{deal.title}</span>
        <span className="deal-amount">{compactWon(deal.amount)}</span>
      </div>
      {deal.customerName && <div className="deal-customer">🏢 {deal.customerName}</div>}
      <div className="deal-meta">
        <span className="deal-owner">👤 {deal.ownerName || '—'}</span>
        {!getStage(deal.stage).closed && <span className="deal-prob">{prob}%</span>}
        {deal.expectedClose && (
          <span className={`deal-due${overdue ? ' overdue' : ''}`}>
            📅 {formatDate(deal.expectedClose)}
            {overdue ? ' (지연)' : ` · ${relativeDay(deal.expectedClose)}`}
          </span>
        )}
      </div>
    </button>
  )
}
