import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import Modal from '../components/Modal.jsx'
import { ACTIVITY_TYPES, getActivityType } from '../lib/pipeline.js'
import { formatDate, relativeDay, todayISO } from '../lib/format.js'

const EMPTY = { type: 'visit', customerId: '', date: todayISO(), note: '' }

export default function Activities() {
  const { activities, customers, user, addActivity, removeActivity, notify } = useApp()
  const [adding, setAdding] = useState(false)
  const [typeFilter, setTypeFilter] = useState('')

  const list = useMemo(
    () => (typeFilter ? activities.filter((a) => a.type === typeFilter) : activities),
    [activities, typeFilter],
  )

  // 날짜별 그룹.
  const groups = useMemo(() => {
    const m = new Map()
    for (const a of list) {
      const k = a.date || '미지정'
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(a)
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [list])

  return (
    <main className="page">
      <div className="toolbar">
        <div className="chips grow">
          <button type="button" className={`chip${typeFilter === '' ? ' on' : ''}`} onClick={() => setTypeFilter('')}>전체</button>
          {ACTIVITY_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`chip${typeFilter === t.id ? ' on' : ''}`}
              onClick={() => setTypeFilter(typeFilter === t.id ? '' : t.id)}
            >{t.icon} {t.label}</button>
          ))}
        </div>
        <button type="button" className="primary" onClick={() => setAdding(true)}>+ 활동</button>
      </div>

      <div className="timeline">
        {groups.length === 0 && <p className="empty">활동 기록이 없습니다.</p>}
        {groups.map(([date, items]) => (
          <div className="tl-group" key={date}>
            <div className="tl-date">{formatDate(date)} <small>{relativeDay(date)}</small></div>
            {items.map((a) => {
              const t = getActivityType(a.type)
              const canDelete = user.isAdmin || a.owner === user.uid
              return (
                <div className="tl-item" key={a.id}>
                  <span className="tl-icon">{t.icon}</span>
                  <div className="tl-body">
                    <div className="tl-head">
                      <b>{t.label}</b>
                      {a.customerName && <span className="tl-cust">🏢 {a.customerName}</span>}
                      <span className="tl-owner">👤 {a.ownerName || ''}</span>
                    </div>
                    {a.note && <p className="tl-note">{a.note}</p>}
                  </div>
                  {canDelete && (
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="삭제"
                      onClick={async () => {
                        if (!window.confirm('이 활동 기록을 삭제할까요? 되돌릴 수 없습니다.')) return
                        await removeActivity(a.id)
                        notify('활동을 삭제했습니다.')
                      }}
                    >✕</button>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {adding && (
        <ActivityModal
          customers={customers}
          onClose={() => setAdding(false)}
          onSave={async (data) => { await addActivity(data); notify('활동을 기록했습니다.'); setAdding(false) }}
        />
      )}
    </main>
  )
}

function ActivityModal({ customers, onClose, onSave }) {
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const c = customers.find((x) => x.id === form.customerId)
      await onSave({
        type: form.type,
        customerId: form.customerId || '',
        customerName: c?.name || '',
        date: form.date || todayISO(),
        note: form.note.trim(),
      })
    } finally { setBusy(false) }
  }

  return (
    <Modal
      title="활동 기록"
      onClose={onClose}
      footer={
        <div className="foot-row">
          <div className="spacer" />
          <button type="button" onClick={onClose}>취소</button>
          <button type="submit" form="act-form" className="primary" disabled={busy}>저장</button>
        </div>
      }
    >
      <form id="act-form" onSubmit={submit} className="form">
        <div className="field">
          <span>종류</span>
          <div className="stage-picker">
            {ACTIVITY_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`stage-btn${form.type === t.id ? ' on' : ''}`}
                onClick={() => setForm((f) => ({ ...f, type: t.id }))}
              >{t.icon} {t.label}</button>
            ))}
          </div>
        </div>
        <div className="grid2">
          <label className="field"><span>거래처</span>
            <select value={form.customerId} onChange={set('customerId')}>
              <option value="">선택 안 함</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="field"><span>날짜</span>
            <input type="date" value={form.date} onChange={set('date')} />
          </label>
        </div>
        <label className="field"><span>내용</span>
          <textarea value={form.note} onChange={set('note')} rows={3} placeholder="논의 내용, 다음 액션…" autoFocus />
        </label>
      </form>
    </Modal>
  )
}
