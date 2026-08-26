import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import Modal from '../components/Modal.jsx'
import DealCard from '../components/DealCard.jsx'
import { LOST, STAGES, getStage, isDealLost, isOpen } from '../lib/pipeline.js'
import { compactWon, monthKey, todayISO } from '../lib/format.js'
import { teamSummary } from '../lib/stats.js'

const EMPTY = {
  title: '', customerId: '', amount: '', stage: 'lead',
  expectedClose: '', memo: '', lost: false, lostReason: '',
}

export default function Deals() {
  const { deals, customers, activities, user, addDeal, updateDeal, removeDeal, notify } = useApp()
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
      return [d.title, d.customerName, d.ownerName, d.memo].some((v) =>
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

  // 담당자 재배정 후보 — 데이터에 남은 담당자들이 곧 팀원 목록이다.
  const members = useMemo(
    () => teamSummary(deals, customers, activities, monthKey())
      .filter((m) => m.uid)
      .map((m) => ({ uid: m.uid, name: m.name, email: m.email })),
    [deals, customers, activities],
  )

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
          customers={customers}
          members={members}
          isAdmin={user.isAdmin}
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

function DealModal({ deal, customers, members, isAdmin, canDelete, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(deal ? { ...EMPTY, ...deal, amount: String(deal.amount ?? '') } : EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const chooseCustomer = (e) => {
    const id = e.target.value
    const c = customers.find((x) => x.id === id)
    setForm((f) => ({ ...f, customerId: id, customerName: c?.name || '' }))
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) return
    // 실패는 이유를 남겨야 다음에 쓸모가 있다.
    if (form.lost && !form.lostReason.trim()) {
      setError('실패 회고를 입력해야 저장할 수 있습니다.')
      return
    }
    setError('')
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
        lost: Boolean(form.lost),
        lostReason: form.lost ? form.lostReason.trim() : '',
      }
      // 종료(수주·실패)되면 종료일을 남기고, 다시 진행 상태로 오면 지운다.
      const closedNow = nowClosed || form.lost
      if (stageChanged || Boolean(form.lost) !== Boolean(deal?.lost)) {
        payload.closedDate = closedNow ? (deal?.closedDate || todayISO()) : ''
      }
      // 담당자 재배정은 관리자만. 보안 규칙에서도 같은 제한을 건다.
      if (deal && isAdmin && form.owner && form.owner !== deal.owner) {
        const m = members.find((x) => x.uid === form.owner)
        if (m) {
          payload.owner = m.uid
          payload.ownerName = m.name
          payload.ownerEmail = m.email
        }
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
        {error && <div className="login-error">{error}</div>}
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
            {form.lost
              ? `${s.label} 단계에서 실패로 마감됩니다.`
              : s.closed ? '수주로 마감됩니다.' : `기본 성공확률 ${s.probability}%`}
          </small>
        </div>

        <div className="field">
          <span>실패 처리</span>
          <label className="check">
            <input
              type="checkbox"
              checked={Boolean(form.lost)}
              onChange={(e) => setForm((f) => ({ ...f, lost: e.target.checked }))}
            />
            <span>이 딜은 <b>{s.label}</b> 단계에서 실패했다</span>
          </label>
          {form.lost && (
            <>
              <textarea
                value={form.lostReason}
                onChange={set('lostReason')}
                rows={3}
                placeholder="왜 실패했나 — 경쟁사, 가격, 시기, 의사결정 라인 등 다음에 참고할 내용"
              />
              <small className="hint">회고는 필수입니다. 단계는 그대로 두므로 어디서 깨졌는지 남습니다.</small>
            </>
          )}
        </div>

        <label className="field"><span>예상 마감일</span>
          <input type="date" value={form.expectedClose} onChange={set('expectedClose')} />
        </label>

        {deal && isAdmin && (
          <label className="field"><span>담당자 (관리자만 변경 가능)</span>
            <select value={form.owner || ''} onChange={set('owner')}>
              {!members.some((m) => m.uid === deal.owner) && (
                <option value={deal.owner || ''}>{deal.ownerName || '현재 담당자'}</option>
              )}
              {members.map((m) => (
                <option key={m.uid} value={m.uid}>{m.name} · {m.email}</option>
              ))}
            </select>
          </label>
        )}

        <label className="field"><span>메모</span>
          <textarea value={form.memo} onChange={set('memo')} rows={3} placeholder="진행 상황, 경쟁사, 결정권자…" />
        </label>
      </form>
    </Modal>
  )
}
