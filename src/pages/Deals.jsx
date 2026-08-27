import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import DealCard from '../components/DealCard.jsx'
import DealModal from '../components/DealModal.jsx'
import { STAGES, getStage, isDealLost, isOpen } from '../lib/pipeline.js'
import { compactWon, todayISO } from '../lib/format.js'

export default function Deals() {
  const { deals, user, canCreate, updateDeal, notify } = useApp()
  const [editing, setEditing] = useState(null) // null | 'new' | deal
  const [ownerFilter, setOwnerFilter] = useState('all') // 'all' | 'mine'
  const [q, setQ] = useState('')
  // 드래그로 옮기는 중인 딜 id 와, 지금 올라가 있는 열.
  const [dragId, setDragId] = useState('')
  const [overStage, setOverStage] = useState('')

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return deals.filter((d) => {
      if (ownerFilter === 'mine' && d.owner !== user.uid) return false
      if (!needle) return true
      return [d.title, d.customerName, d.serviceName, d.ownerName, d.memo].some((v) =>
        String(v || '').toLowerCase().includes(needle))
    })
  }, [deals, ownerFilter, user, q])

  // 실패까지 모든 단계를 열로 세운다 — 열이 없으면 그 딜은 아예 볼 수 없다.
  const columns = useMemo(() => {
    const map = new Map(STAGES.map((s) => [s.id, []]))
    for (const d of visible) {
      if (map.has(d.stage)) map.get(d.stage).push(d)
    }
    return STAGES.map((s) => ({ stage: s, items: map.get(s.id) }))
  }, [visible])

  // 카드를 다른 단계 열에 떨어뜨렸을 때. 종료 단계로 가면 종료일을 기록하고,
  // 다시 진행 단계로 돌아오면 지운다 — 모달 저장과 같은 규칙이다.
  const moveTo = async (deal, stageId) => {
    if (!deal || deal.stage === stageId) return
    const nowClosed = !isOpen(stageId)
    const wasLost = isDealLost(deal)
    await updateDeal(deal.id, {
      stage: stageId,
      // 실패한 딜을 끌어다 옮기면 파이프라인으로 되살린다. 회고는 기록으로 남긴다.
      lost: false,
      closedDate: nowClosed ? (deal.closedDate || todayISO()) : '',
    })
    notify(wasLost
      ? `'${deal.title}' 을(를) ${getStage(stageId).label} 단계로 되살렸습니다.`
      : `'${deal.title}' → ${getStage(stageId).label}`)
  }

  return (
    <main className="page deals">
      <div className="toolbar">
        <input
          className="search"
          placeholder="영업기회·거래처·서비스·담당자 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          type="button"
          className="primary"
          onClick={() => setEditing('new')}
          disabled={!canCreate}
          title={canCreate ? '' : '팀에 배정돼야 만들 수 있습니다.'}
        >+ 영업기회</button>
      </div>

      <div className="toolbar">
        <div className="seg">
          <button type="button" className={ownerFilter === 'all' ? 'on' : ''} onClick={() => setOwnerFilter('all')}>전체</button>
          <button type="button" className={ownerFilter === 'mine' ? 'on' : ''} onClick={() => setOwnerFilter('mine')}>내 딜</button>
        </div>
        <small className="hint">카드를 끌어다 다른 단계로 옮길 수 있습니다.</small>
      </div>

      {visible.length === 0 && (
        <p className="empty">{q.trim() ? '검색 결과가 없습니다.' : '영업기회가 없습니다. 오른쪽 위 버튼으로 추가하세요.'}</p>
      )}

      <div className="board">
        {columns.map(({ stage, items }) => {
          const sum = items.reduce((s, d) => s + (Number(d.amount) || 0), 0)
          // 강조 표시는 상태로, 실제 이동은 드래그 데이터에 실린 id 로 판단한다.
          // 상태에만 기대면 dragstart 직후의 드롭에서 아직 반영이 안 돼 무시될 수 있다.
          const dragging = deals.find((d) => d.id === dragId)
          const canDrop = Boolean(dragging) && dragging.stage !== stage.id
          return (
            <div
              className={`board-col stage-${stage.id}${overStage === stage.id && canDrop ? ' drop-over' : ''}`}
              key={stage.id}
              onDragOver={(e) => { e.preventDefault(); setOverStage(stage.id) }}
              onDragLeave={() => setOverStage((v) => (v === stage.id ? '' : v))}
              onDrop={(e) => {
                e.preventDefault()
                setOverStage('')
                const id = e.dataTransfer.getData('text/plain') || dragId
                const deal = deals.find((d) => d.id === id)
                if (deal) moveTo(deal, stage.id)
                setDragId('')
              }}
            >
              <div className="col-head" style={{ '--c': stage.color }}>
                <span className="col-name">{stage.label}</span>
                <span className="col-count">{items.length}</span>
                <span className="col-sum">{compactWon(sum)}</span>
              </div>
              <div className="col-body">
                {items.length === 0 && <div className="col-empty">비어있음</div>}
                {items.map((d) => (
                  <DealCard
                    key={d.id}
                    deal={d}
                    dragging={dragId === d.id}
                    onDragStart={() => setDragId(d.id)}
                    onDragEnd={() => { setDragId(''); setOverStage('') }}
                    onClick={() => setEditing(d)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {editing && (
        <DealModal
          deal={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </main>
  )
}
