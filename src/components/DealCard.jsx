import { compactWon, formatDate, relativeDay } from '../lib/format.js'
import { dealProbability, isDealLost } from '../lib/pipeline.js'
import { isOverdue } from '../lib/stats.js'
import { stripMarkdown } from '../lib/markdown.js'

/** 파이프라인 보드/목록에 쓰는 딜 카드. */
export default function DealCard({ deal, onClick, dragging, onDragStart, onDragEnd }) {
  const lost = isDealLost(deal)
  const prob = dealProbability(deal)
  const overdue = isOverdue(deal)

  return (
    <button
      type="button"
      className={`deal-card${dragging ? ' dragging' : ''}${lost ? ' lost' : ''}`}
      draggable={Boolean(onDragStart)}
      onDragStart={(e) => {
        // 텍스트 데이터를 실어야 파이어폭스에서도 드래그가 시작된다.
        e.dataTransfer.setData('text/plain', deal.id)
        e.dataTransfer.effectAllowed = 'move'
        onDragStart?.()
      }}
      onDragEnd={() => onDragEnd?.()}
      onClick={onClick}
    >
      <div className="deal-top">
        <span className="deal-title">{deal.title}</span>
        <span className="deal-amount">{compactWon(deal.amount)}</span>
      </div>
      {deal.customerName && <div className="deal-customer">🏢 {deal.customerName}</div>}
      {deal.serviceName && <div className="deal-service">{deal.serviceName}</div>}
      {lost && deal.lostReason && (
        <div className="deal-retro">📉 {stripMarkdown(deal.lostReason)}</div>
      )}
      <div className="deal-meta">
        <span className="deal-owner">👤 {deal.ownerName || '—'}</span>
        {lost
          ? <span className="deal-lost">실패</span>
          : prob < 100 && <span className="deal-prob">{prob}%</span>}
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
