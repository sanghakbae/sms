import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import Modal from '../components/Modal.jsx'
import MarkdownEditor from '../components/MarkdownEditor.jsx'
import { GRADES, INDUSTRIES, INDUSTRY_GROUPS, getGrade, getStage } from '../lib/pipeline.js'
import { customerHistory, settlementColor, settlementLabel } from '../lib/settlement.js'
import { compactWon, formatDate } from '../lib/format.js'
import { canEditDoc } from '../lib/teams.js'
import { runWrite } from '../lib/guard.js'

const EMPTY = { name: '', industry: '', grade: 'B', contactName: '', phone: '', email: '', memo: '' }

export default function Customers() {
  const { customers, deals, activities, user, canCreate, addCustomer, updateCustomer, removeCustomer, notify } = useApp()
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
        <button
          type="button"
          className="primary"
          onClick={() => setEditing('new')}
          disabled={!canCreate}
          title={canCreate ? '' : '팀에 배정돼야 만들 수 있습니다.'}
        >+ 거래처</button>
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
            <button type="button" className="row-card customer-card" key={c.id} onClick={() => setEditing(c)}>
              {/* 글자 하나만 두면 이니셜로 읽힌다 — 무엇의 등급인지 붙여준다. */}
              <span
                className="grade-dot"
                style={{ background: grade.color }}
                title={`${grade.label} 거래처`}
                aria-label={`등급 ${grade.label}`}
              >{c.grade}</span>
              <span className="row-main">
                <span className="row-title">{c.name}</span>
                <span className="row-sub">
                  {c.industry || '업종 미정'}
                  {c.contactName ? ` · ${c.contactName}` : ''}
                  {dealCount.get(c.id) ? ` · 딜 ${dealCount.get(c.id)}건` : ''}
                </span>
              </span>
              {/* 담당자는 이니셜 대신 이름으로 — 첫 글자만으로는 누군지 알 수 없다. */}
              <span className="row-owner">{c.ownerName || '담당 없음'}</span>
            </button>
          )
        })}
      </div>

      {editing && (
        <CustomerModal
          customer={editing === 'new' ? null : editing}
          deals={deals}
          canEdit={editing === 'new' || canEditDoc(user, editing)}
          canDelete={editing !== 'new' && canEditDoc(user, editing)}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            const isNew = editing === 'new'
            const ok = await runWrite(notify, isNew ? '등록' : '수정', () => (
              isNew ? addCustomer(data) : updateCustomer(editing.id, data)
            ))
            if (!ok) return
            notify(isNew ? '거래처를 추가했습니다.' : '거래처를 수정했습니다.')
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
            if (!await runWrite(notify, '삭제', () => removeCustomer(editing.id))) return
            notify('거래처를 삭제했습니다.')
            setEditing(null)
          }}
        />
      )}
    </main>
  )
}

function CustomerModal({ customer, deals, canEdit, canDelete, onClose, onSave, onDelete }) {
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
      title={customer ? (canEdit ? '거래처 수정' : '거래처 상세') : '거래처 추가'}
      onClose={onClose}
      footer={
        <div className="foot-row">
          {canDelete && (
            <button type="button" className="danger" onClick={onDelete}>삭제</button>
          )}
          <div className="spacer" />
          <button type="button" onClick={onClose}>{canEdit ? '취소' : '닫기'}</button>
          {canEdit && (
            <button type="submit" form="cust-form" className="primary" disabled={busy}>저장</button>
          )}
        </div>
      }
    >
      <form id="cust-form" onSubmit={submit} className="form">
        <fieldset className="form-lock" disabled={!canEdit}>
          <label className="field"><span>거래처명 *</span>
            <input value={form.name} onChange={set('name')} placeholder="(주)무하유" autoFocus />
          </label>
        <div className="grid2">
          <label className="field"><span>업종</span>
            <select value={form.industry} onChange={set('industry')}>
              <option value="">선택 안 함</option>
              {/* 목록에 없는 예전 값도 그대로 남긴다 — 지우면 그 거래처의 업종이 사라진다. */}
              {form.industry && !INDUSTRIES.includes(form.industry) && (
                <option value={form.industry}>{form.industry} (기존)</option>
              )}
              {INDUSTRY_GROUPS.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.items.map((name) => <option key={name} value={name}>{name}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="field"><span>등급</span>
            <select value={form.grade} onChange={set('grade')}>
              {GRADES.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
            {/* 기준을 적어두지 않으면 사람마다 다르게 매겨 등급이 의미를 잃는다. */}
            <small className="hint">
              {getGrade(form.grade).desc}
              <em> · {getGrade(form.grade).cadence}</em>
            </small>
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
          <div className="field"><span>메모</span>
            <MarkdownEditor
              value={form.memo}
              onChange={(v) => setForm((f) => ({ ...f, memo: v }))}
              rows={4}
              placeholder="특이사항, 니즈, 히스토리…"
            />
          </div>
        </fieldset>
      </form>

      {customer && <CustomerHistory customer={customer} deals={deals} />}
    </Modal>
  )
}

/* -------------------------------- 거래 이력 -------------------------------- */

/**
 * 이 거래처와 무엇을 얼마에 했나.
 * 수주는 '계약이 끝났다' 는 뜻이지 '돈을 받았다' 는 뜻이 아니라, 입금까지 함께 보여준다.
 */
function CustomerHistory({ customer, deals }) {
  const h = useMemo(() => customerHistory(customer.id, deals), [customer.id, deals])

  if (h.dealCount === 0) {
    return (
      <section className="cust-hist">
        <h4>거래 이력</h4>
        <p className="empty sm">아직 이 거래처로 만든 영업기회가 없습니다.</p>
      </section>
    )
  }

  return (
    <section className="cust-hist">
      <h4>거래 이력</h4>

      <div className="ch-sum">
        <span><i>누적 수주</i><b>{compactWon(h.wonAmount)}</b><small>{h.won.length}건</small></span>
        <span><i>입금</i><b className="ok">{compactWon(h.paidAmount)}</b>
          <small>{h.unpaidAmount > 0 ? `미수 ${compactWon(h.unpaidAmount)}` : '전액 회수'}</small>
        </span>
        <span><i>진행중</i><b>{compactWon(h.openAmount)}</b><small>{h.open.length}건</small></span>
        <span><i>실패</i><b>{h.lost.length}건</b><small>회고 있음</small></span>
      </div>

      {h.won.length > 0 && (
        <>
          <h5>수주 · 입금</h5>
          <div className="ch-list">
            {h.won.map((d) => (
              <div className="ch-row" key={d.id}>
                <span className="ch-main">
                  <b>{d.title}</b>
                  <small>
                    {d.closedDate ? `${formatDate(d.closedDate)} 수주` : '종료일 미기록'}
                    {d.serviceName ? ` · ${d.serviceName}` : ''}
                  </small>
                </span>
                <span className="ch-nums">
                  <b>{compactWon(d.amount)}</b>
                  <small>{d.unpaid > 0 ? `미수 ${compactWon(d.unpaid)}` : '완납'}</small>
                </span>
                <span className="pill" style={{ '--c': settlementColor(d.settlement) }}>
                  {settlementLabel(d.settlement)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {h.open.length > 0 && (
        <>
          <h5>진행중</h5>
          <div className="ch-list">
            {h.open.map((d) => {
              const st = getStage(d.stage)
              return (
                <div className="ch-row" key={d.id}>
                  <span className="ch-main">
                    <b>{d.title}</b>
                    <small>
                      {d.expectedClose ? `${formatDate(d.expectedClose)} 마감 예정` : '마감일 미정'}
                    </small>
                  </span>
                  <span className="ch-nums"><b>{compactWon(d.amount)}</b></span>
                  <span className="pill" style={{ '--c': st.color }}>{st.label}</span>
                </div>
              )
            })}
          </div>
        </>
      )}

      {h.lost.length > 0 && (
        <>
          <h5>실패 회고</h5>
          <div className="ch-list">
            {h.lost.map((d) => (
              <div className="ch-row lost" key={d.id}>
                <span className="ch-main">
                  <b>{d.title}</b>
                  <small>{d.lostReason || '회고 없음'}</small>
                </span>
                <span className="ch-nums"><b>{compactWon(d.amount)}</b>
                  <small>{getStage(d.stage).label} 단계</small>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
