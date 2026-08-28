// 영업기회 추가·수정 모달.
// 파이프라인 화면 밖(대시보드 등)에서도 열 수 있어야 해서 페이지에서 떼어냈다.
// 바깥에서는 deal 과 onClose 만 주면 된다 — 나머지는 컨텍스트에서 가져온다.

import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import Modal from './Modal.jsx'
import MarkdownEditor from './MarkdownEditor.jsx'
import { STAGES, getStage, isOpen, normalizeStageId } from '../lib/pipeline.js'
import { formatAmountInput, monthKey, todayISO, wonWithCompact } from '../lib/format.js'
import { teamSummary } from '../lib/stats.js'
import { canEditDoc } from '../lib/teams.js'

const EMPTY = {
  title: '', customerId: '', serviceId: '', amount: '', stage: 'contact',
  expectedClose: '', memo: '', lost: false, lostReason: '',
}

/**
 * deal 이 null 이면 '추가', 있으면 '수정'.
 * 저장·삭제는 여기서 직접 한다 — 호출하는 쪽마다 같은 코드를 되풀이하지 않도록.
 */
export default function DealModal({ deal, onClose }) {
  const {
    deals, customers, activities, services, user,
    addDeal, updateDeal, removeDeal, notify,
  } = useApp()

  // 담당자 재배정 후보 — 데이터에 남은 담당자들이 곧 팀원 목록이다.
  const members = useMemo(
    () => teamSummary(deals, customers, activities, monthKey())
      .filter((m) => m.uid)
      .map((m) => ({ uid: m.uid, name: m.name, email: m.email })),
    [deals, customers, activities],
  )
  const canEdit = !deal || canEditDoc(user, deal)

  return (
    <DealForm
      deal={deal}
      customers={customers}
      services={services}
      members={members}
      isAdmin={user.isAdmin}
      canEdit={canEdit}
      canDelete={Boolean(deal) && canEdit}
      onClose={onClose}
      onSave={async (data) => {
        if (deal) { await updateDeal(deal.id, data); notify('영업기회를 수정했습니다.') }
        else { await addDeal(data); notify('영업기회를 추가했습니다.') }
        onClose()
      }}
      onDelete={async () => {
        if (!window.confirm(`'${deal.title}' 영업기회를 삭제할까요? 되돌릴 수 없습니다.`)) return
        await removeDeal(deal.id)
        notify('영업기회를 삭제했습니다.')
        onClose()
      }}
    />
  )
}

function DealForm({ deal, customers, services, members, isAdmin, canEdit, canDelete, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(deal
    ? {
        ...EMPTY,
        ...deal,
        stage: normalizeStageId(deal.stage),
        amount: formatAmountInput(deal.amount),
        // 되살린 딜에는 예전 회고가 남아 있다. 지금 실패 상태가 아니면 빈 칸에서 시작해
        // 옛 사유가 새 실패의 회고로 잘못 저장되지 않게 한다.
        lostReason: deal.lost ? (deal.lostReason || '') : '',
      }
    : EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm((f) => ({
    ...f,
    [k]: k === 'amount' ? formatAmountInput(e.target.value) : e.target.value,
  }))

  const chooseService = (e) => {
    const id = e.target.value
    const svc = services.find((x) => x.id === id)
    // 이름도 같이 저장한다 — 목록에서 서비스가 지워져도 딜에는 남아야 한다.
    setForm((f) => ({ ...f, serviceId: id, serviceName: svc?.name || '' }))
  }

  const chooseCustomer = (e) => {
    const id = e.target.value
    const c = customers.find((x) => x.id === id)
    setForm((f) => ({ ...f, customerId: id, customerName: c?.name || '' }))
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) return
    // 실패는 이유를 남겨야 다음에 쓸모가 있다.
    if (form.lost && !(form.lostReason || '').trim()) {
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
        serviceId: form.serviceId || '',
        serviceName: form.serviceName || (services.find((x) => x.id === form.serviceId)?.name ?? ''),
        amount: amountTyped,
        stage: form.stage,
        expectedClose: form.expectedClose || '',
        memo: (form.memo || '').trim(),
        lost: Boolean(form.lost),
        lostReason: form.lost ? (form.lostReason || '').trim() : '',
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
  // 자릿수 실수를 눈으로 잡을 수 있게 입력값을 바로 읽어준다.
  const amountTyped = Number(String(form.amount).replace(/[^0-9]/g, '')) || 0

  return (
    <Modal
      title={deal ? (canEdit ? '영업기회 수정' : '영업기회 상세') : '영업기회 추가'}
      onClose={onClose}
      footer={
        <div className="foot-row">
          {canDelete && <button type="button" className="danger" onClick={onDelete}>삭제</button>}
          <div className="spacer" />
          <button type="button" onClick={onClose}>{canEdit ? '취소' : '닫기'}</button>
          {canEdit && (
            <button type="submit" form="deal-form" className="primary" disabled={busy}>저장</button>
          )}
        </div>
      }
    >
      <form id="deal-form" onSubmit={submit} className="form">
        <fieldset className="form-lock" disabled={!canEdit}>
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
          <label className="field"><span>대상 서비스</span>
            <select value={form.serviceId || ''} onChange={chooseService}>
              <option value="">선택 안 함</option>
              {/* 목록에서 지워진 서비스라도 이 딜에 붙어 있으면 계속 보여준다. */}
              {form.serviceId && !services.some((x) => x.id === form.serviceId) && (
                <option value={form.serviceId}>{form.serviceName || '지워진 서비스'}</option>
              )}
              {services.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          <label className="field"><span>예상 금액(원)</span>
            <input value={form.amount} onChange={set('amount')} placeholder="5,000,000" inputMode="numeric" />
            <small className={`amount-preview${amountTyped ? '' : ' zero'}`}>
              {String(form.amount).trim() === '' ? '숫자만 입력하세요' : wonWithCompact(amountTyped)}
            </small>
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
          <StageGuide stage={s} lost={form.lost} />
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
              <MarkdownEditor
                value={form.lostReason}
                onChange={(v) => setForm((f) => ({ ...f, lostReason: v }))}
                rows={4}
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

          <div className="field"><span>메모</span>
            <MarkdownEditor
              value={form.memo}
              onChange={(v) => setForm((f) => ({ ...f, memo: v }))}
              rows={4}
              placeholder="진행 상황, 경쟁사, 결정권자…"
            />
          </div>
        </fieldset>
      </form>
    </Modal>
  )
}

/* -------------------------------- 단계 안내 -------------------------------- */

/**
 * 고른 단계가 무엇인지 풀어서 보여준다.
 * 단계 이름만으로는 사람마다 기준이 달라져 파이프라인 숫자를 믿을 수 없게 된다.
 */
function StageGuide({ stage, lost }) {
  const [open, setOpen] = useState(false)

  if (lost) {
    return (
      <small className="hint warn-text">
        {stage.label} 단계에서 실패로 마감됩니다. 단계는 그대로 두므로 어디서 깨졌는지 남습니다.
      </small>
    )
  }

  return (
    <div className="stage-guide">
      <div className="sg-top">
        <span className="sg-dot" style={{ background: stage.color }} />
        <b>{stage.label}</b>
        <span className="sg-prob">
          {stage.closed ? '마감' : `성공확률 ${stage.probability}%`}
        </span>
        <button
          type="button"
          className="ghost sm"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >{open ? '접기' : '자세히'}</button>
      </div>
      <p className="sg-summary">{stage.summary}</p>
      {open && (
        <dl className="sg-detail">
          <dt>여기로 올리는 조건</dt><dd>{stage.entry}</dd>
          <dt>다음으로 넘어가는 신호</dt><dd>{stage.exit}</dd>
          <dt>자주 하는 실수</dt><dd>{stage.watch}</dd>
        </dl>
      )}
    </div>
  )
}
