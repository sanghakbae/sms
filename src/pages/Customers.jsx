import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import Modal from '../components/Modal.jsx'
import { GRADES, getGrade } from '../lib/pipeline.js'
import { initial } from '../lib/accounts.js'

const EMPTY = { name: '', industry: '', grade: 'B', contactName: '', phone: '', email: '', memo: '' }

export default function Customers() {
  const { customers, deals, activities, user, addCustomer, updateCustomer, removeCustomer, notify } = useApp()
  const [q, setQ] = useState('')
  const [gradeFilter, setGradeFilter] = useState('')
  const [editing, setEditing] = useState(null) // null | 'new' | customer

  const dealCount = useMemo(() => {
    const m = new Map()
    for (const d of deals) m.set(d.customerId, (m.get(d.customerId) || 0) + 1)
    return m
  }, [deals])

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return customers.filter((c) => {
      if (gradeFilter && c.grade !== gradeFilter) return false
      if (!needle) return true
      return [c.name, c.industry, c.contactName, c.phone].some((v) =>
        String(v || '').toLowerCase().includes(needle))
    })
  }, [customers, q, gradeFilter])

  return (
    <main className="page">
      <div className="toolbar">
        <input
          className="search"
          placeholder="거래처·담당자·연락처 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="button" className="primary" onClick={() => setEditing('new')}>+ 거래처</button>
      </div>

      <div className="chips">
        <button type="button" className={`chip${gradeFilter === '' ? ' on' : ''}`} onClick={() => setGradeFilter('')}>전체</button>
        {GRADES.map((g) => (
          <button
            key={g.id}
            type="button"
            className={`chip${gradeFilter === g.id ? ' on' : ''}`}
            style={{ '--c': g.color }}
            onClick={() => setGradeFilter(gradeFilter === g.id ? '' : g.id)}
          >{g.label}</button>
        ))}
      </div>

      <div className="card-list">
        {list.length === 0 && <p className="empty">거래처가 없습니다. 오른쪽 위 버튼으로 추가하세요.</p>}
        {list.map((c) => {
          const grade = getGrade(c.grade)
          return (
            <button type="button" className="row-card" key={c.id} onClick={() => setEditing(c)}>
              <span className="grade-dot" style={{ background: grade.color }}>{c.grade}</span>
              <span className="row-main">
                <span className="row-title">{c.name}</span>
                <span className="row-sub">
                  {c.industry || '업종 미정'}
                  {c.contactName ? ` · ${c.contactName}` : ''}
                  {dealCount.get(c.id) ? ` · 딜 ${dealCount.get(c.id)}건` : ''}
                </span>
              </span>
              <span className="row-owner" title={c.ownerName || ''}>{initial(c.ownerName)}</span>
            </button>
          )
        })}
      </div>

      {editing && (
        <CustomerModal
          customer={editing === 'new' ? null : editing}
          canDelete={editing !== 'new' && (user.isAdmin || editing.owner === user.uid)}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            if (editing === 'new') { await addCustomer(data); notify('거래처를 추가했습니다.') }
            else { await updateCustomer(editing.id, data); notify('거래처를 수정했습니다.') }
            setEditing(null)
          }}
          onDelete={async () => {
            // 거래처를 지워도 연결된 딜·활동은 남는다. 몇 건이 끊기는지 먼저 알린다.
            const linkedDeals = deals.filter((d) => d.customerId === editing.id).length
            const linkedActs = activities.filter((a) => a.customerId === editing.id).length
            const tail = linkedDeals || linkedActs
              ? `\n\n연결된 영업기회 ${linkedDeals}건, 활동 ${linkedActs}건의 거래처 연결이 끊깁니다.`
              : ''
            if (!window.confirm(`'${editing.name}' 거래처를 삭제할까요? 되돌릴 수 없습니다.${tail}`)) return
            await removeCustomer(editing.id)
            notify('거래처를 삭제했습니다.')
            setEditing(null)
          }}
        />
      )}
    </main>
  )
}

function CustomerModal({ customer, canDelete, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(customer ? { ...EMPTY, ...customer } : EMPTY)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setBusy(true)
    try {
      await onSave({
        name: form.name.trim(),
        industry: form.industry.trim(),
        grade: form.grade,
        contactName: form.contactName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        memo: form.memo.trim(),
      })
    } finally { setBusy(false) }
  }

  return (
    <Modal
      title={customer ? '거래처 수정' : '거래처 추가'}
      onClose={onClose}
      footer={
        <div className="foot-row">
          {canDelete && (
            <button type="button" className="danger" onClick={onDelete}>삭제</button>
          )}
          <div className="spacer" />
          <button type="button" onClick={onClose}>취소</button>
          <button type="submit" form="cust-form" className="primary" disabled={busy}>저장</button>
        </div>
      }
    >
      <form id="cust-form" onSubmit={submit} className="form">
        <label className="field"><span>거래처명 *</span>
          <input value={form.name} onChange={set('name')} placeholder="(주)무하유" autoFocus />
        </label>
        <div className="grid2">
          <label className="field"><span>업종</span>
            <input value={form.industry} onChange={set('industry')} placeholder="제조 · IT · 유통…" />
          </label>
          <label className="field"><span>등급</span>
            <select value={form.grade} onChange={set('grade')}>
              {GRADES.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
          </label>
        </div>
        <div className="grid2">
          <label className="field"><span>담당자</span>
            <input value={form.contactName} onChange={set('contactName')} placeholder="김구매 과장" />
          </label>
          <label className="field"><span>연락처</span>
            <input value={form.phone} onChange={set('phone')} placeholder="010-0000-0000" inputMode="tel" />
          </label>
        </div>
        <label className="field"><span>이메일</span>
          <input value={form.email} onChange={set('email')} placeholder="buyer@company.com" inputMode="email" />
        </label>
        <label className="field"><span>메모</span>
          <textarea value={form.memo} onChange={set('memo')} rows={3} placeholder="특이사항, 니즈, 히스토리…" />
        </label>
      </form>
    </Modal>
  )
}
