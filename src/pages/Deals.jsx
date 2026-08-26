import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import Modal from '../components/Modal.jsx'
import DealCard from '../components/DealCard.jsx'
import { BOARD_STAGES, STAGES, getStage, isOpen } from '../lib/pipeline.js'
import { compactWon, todayISO } from '../lib/format.js'

const EMPTY = { title: '', customerId: '', amount: '', stage: 'lead', expectedClose: '', memo: '' }

export default function Deals() {
  const { deals, customers, user, addDeal, updateDeal, removeDeal, notify } = useApp()
  const [editing, setEditing] = useState(null) // null | 'new' | deal
  const [ownerFilter, setOwnerFilter] = useState('all') // 'all' | 'mine'
  const [q, setQ] = useState('')
  // 실패 딜은 기본 보드에서 빠진다. 켜야만 열이 생기고 열람·수정할 수 있다.
  const [showLost, setShowLost] = useState(false)

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return deals.filter((d) => {
      if (ownerFilter === 'mine' && d.owner !== user.uid) return false
      if (!needle) return true
      return [d.title, d.customerName, d.ownerName, d.memo].some((v) =>
        String(v || '').toLowerCase().includes(needle))
    })
  }, [deals, ownerFilter, user, q])

  const lostCount = useMemo(() => visible.filter((d) => d.stage === 'lost').length, [visible])

  const columns = useMemo(() => {
    const shown = showLost ? STAGES : BOARD_STAGES
    const map = new Map(shown.map((s) => [s.id, []]))
    for (const d of visible) {
      if (map.has(d.stage)) map.get(d.stage).push(d)
    }
    return shown.map((s) => ({ stage: s, items: map.get(s.id) }))
  }, [visible, showLost])

  const lostStage = getStage('lost')

  return (
    <main className="page deals">
      <div className="toolbar">
        <input
          className="search"
          placeholder="영업기회·거래처·담당자 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="button" className="primary" onClick={() => setEditing('new')}>+ 영업기회</button>
      </div>

      <div className="toolbar">
        <div className="seg">
          <button type="button" className={ownerFilter === 'all' ? 'on' : ''} onClick={() => setOwnerFilter('all')}>전체</button>
          <button type="button" className={ownerFilter === 'mine' ? 'on' : ''} onClick={() => setOwnerFilter('mine')}>내 딜</button>
        </div>
        <div className="chips grow">
          <button
            type="button"
            className={`chip${showLost ? ' on' : ''}`}
            style={{ '--c': lostStage.color }}
            onClick={() => setShowLost((v) => !v)}
          >실패 {lostCount}건</button>
        </div>
      </div>

      {visible.length === 0 && (
        <p className="empty">{q.trim() ? '검색 결과가 없습니다.' : '영업기회가 없습니다. 오른쪽 위 버튼으로 추가하세요.'}</p>
      )}

      <div className="board">
        {columns.map(({ stage, items }) => {
          const sum = items.reduce((s, d) => s + (Number(d.amount) || 0), 0)
          return (
            <div className="board-col" key={stage.id}>
              <div className="col-head" style={{ '--c': stage.color }}>
                <span className="col-name">{stage.label}</span>
                <span className="col-count">{items.length}</span>
                <span className="col-sum">{compactWon(sum)}</span>
              </div>
              <div className="col-body">
                {items.length === 0 && <div className="col-empty">비어있음</div>}
                {items.map((d) => (
                  <DealCard key={d.id} deal={d} onClick={() => setEditing(d)} />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {editing && (
        <DealModal
          deal={editing === 'new' ? null : editing}
          customers={customers}
          canDelete={editing !== 'new' && (user.isAdmin || editing.owner === user.uid)}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            if (editing === 'new') { await addDeal(data); notify('영업기회를 추가했습니다.') }
            else { await updateDeal(editing.id, data); notify('영업기회를 수정했습니다.') }
            setEditing(null)
          }}
          onDelete={async () => {
            if (!window.confirm(`'${editing.title}' 영업기회를 삭제할까요? 되돌릴 수 없습니다.`)) return
            await removeDeal(editing.id)
            notify('영업기회를 삭제했습니다.')
            setEditing(null)
          }}
        />
      )}
    </main>
  )
}

function DealModal({ deal, customers, canDelete, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(deal ? { ...EMPTY, ...deal, amount: String(deal.amount ?? '') } : EMPTY)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const chooseCustomer = (e) => {
    const id = e.target.value
    const c = customers.find((x) => x.id === id)
    setForm((f) => ({ ...f, customerId: id, customerName: c?.name || '' }))
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) return
    setBusy(true)
    try {
      const stageChanged = !deal || deal.stage !== form.stage
      const nowClosed = !isOpen(form.stage)
      const payload = {
        title: form.title.trim(),
        customerId: form.customerId || '',
        customerName: form.customerName || (customers.find((c) => c.id === form.customerId)?.name ?? ''),
        amount: Number(form.amount) || 0,
        stage: form.stage,
        expectedClose: form.expectedClose || '',
        memo: (form.memo || '').trim(),
      }
      // 종료 단계로 옮기면 종료일을 오늘로 기록, 다시 진행 단계로 오면 지운다.
      if (stageChanged) {
        payload.closedDate = nowClosed ? (deal?.closedDate || todayISO()) : ''
      }
      await onSave(payload)
    } finally { setBusy(false) }
  }

  const s = getStage(form.stage)

  return (
    <Modal
      title={deal ? '영업기회 수정' : '영업기회 추가'}
      onClose={onClose}
      footer={
        <div className="foot-row">
          {canDelete && <button type="button" className="danger" onClick={onDelete}>삭제</button>}
          <div className="spacer" />
          <button type="button" onClick={onClose}>취소</button>
          <button type="submit" form="deal-form" className="primary" disabled={busy}>저장</button>
        </div>
      }
    >
      <form id="deal-form" onSubmit={submit} className="form">
        <label className="field"><span>제목 *</span>
          <input value={form.title} onChange={set('title')} placeholder="표절검사 연간계약" autoFocus />
        </label>

        <div className="grid2">
          <label className="field"><span>거래처</span>
            <select value={form.customerId} onChange={chooseCustomer}>
              <option value="">선택 안 함</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="field"><span>예상 금액(원)</span>
            <input value={form.amount} onChange={set('amount')} placeholder="5000000" inputMode="numeric" />
          </label>
        </div>

        <div className="field">
          <span>단계</span>
          <div className="stage-picker">
            {STAGES.map((st) => (
              <button
                key={st.id}
                type="button"
                className={`stage-btn${form.stage === st.id ? ' on' : ''}`}
                style={{ '--c': st.color }}
                onClick={() => setForm((f) => ({ ...f, stage: st.id }))}
              >{st.label}</button>
            ))}
          </div>
          <small className="hint">
            {s.closed ? (s.win ? '수주로 마감됩니다.' : '실패로 마감됩니다.') : `기본 성공확률 ${s.probability}%`}
          </small>
        </div>

        <label className="field"><span>예상 마감일</span>
          <input type="date" value={form.expectedClose} onChange={set('expectedClose')} />
        </label>

        <label className="field"><span>메모</span>
          <textarea value={form.memo} onChange={set('memo')} rows={3} placeholder="진행 상황, 경쟁사, 결정권자…" />
        </label>
      </form>
    </Modal>
  )
}
