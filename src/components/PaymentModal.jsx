// 입금 기록. 수주된 딜에 붙는다.
//
// 선금·중도금·잔금처럼 여러 번 나눠 들어오는 게 보통이라 한 줄씩 쌓는다.
// 딜 문서의 payments 배열을 통째로 바꿔 저장한다 — 항목이 몇 개 안 되고,
// 딜을 고칠 수 있는 사람과 입금을 적을 수 있는 사람이 같아서 문서를 쪼갤 이유가 없다.

import { useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import Modal from './Modal.jsx'
import { compactWon, formatDate, todayISO, wonWithCompact } from '../lib/format.js'
import {
  makePaymentId, paymentsOf, paidTotal, settlementColor, settlementLabel,
  settlementOf, unpaidAmount,
} from '../lib/settlement.js'
import { canEditDoc } from '../lib/teams.js'

export default function PaymentModal({ deal, onClose }) {
  const { user, recordPayment, deletePayment, notify } = useApp()
  const [date, setDate] = useState(todayISO())
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [busy, setBusy] = useState(false)

  const canEdit = canEditDoc(user, deal)
  const list = paymentsOf(deal)
  const paid = paidTotal(deal)
  const left = unpaidAmount(deal)
  const status = settlementOf(deal)
  const typed = Number(String(amount).replace(/[^0-9]/g, '')) || 0

  const add = async (e) => {
    e.preventDefault()
    if (typed <= 0) { notify('입금액을 입력해주세요.'); return }
    setBusy(true)
    try {
      const added = { id: makePaymentId(), date: date || todayISO(), amount: typed, memo: memo.trim() }
      await recordPayment(deal, [...list, added], added)
      notify(`${compactWon(typed)}원 입금을 기록했습니다.`)
      setAmount('')
      setMemo('')
    } finally { setBusy(false) }
  }

  const remove = async (id) => {
    const removed = list.find((p) => p.id === id)
    if (!window.confirm('이 입금 기록을 지울까요?')) return
    await deletePayment(deal, list.filter((p) => p.id !== id), removed)
    notify('입금 기록을 지웠습니다.')
  }

  // 잔액을 그대로 채워준다 — 잔금 입력이 가장 흔하다.
  const fillRemaining = () => setAmount(String(left))

  return (
    <Modal
      title="입금 관리"
      onClose={onClose}
      footer={
        <div className="foot-row">
          <div className="spacer" />
          <button type="button" onClick={onClose}>닫기</button>
        </div>
      }
    >
      <div className="pay-head">
        <div className="ph-title">
          <b>{deal.title}</b>
          <small>{deal.customerName || '거래처 미지정'}</small>
        </div>
        <span className="pill" style={{ '--c': settlementColor(status) }}>
          {settlementLabel(status)}
        </span>
      </div>

      <div className="pay-nums">
        <span><i>수주액</i><b>{compactWon(deal.amount)}</b></span>
        <span><i>입금</i><b className="ok">{compactWon(paid)}</b></span>
        <span><i>미수금</i><b className={left > 0 ? 'warn' : ''}>{compactWon(left)}</b></span>
      </div>
      <div className="pay-bar">
        <span style={{
          width: `${Math.min(100, (Number(deal.amount) || 0) > 0 ? (paid / deal.amount) * 100 : 100)}%`,
          background: settlementColor(status),
        }} />
      </div>

      <h4>입금 내역{list.length > 0 && <span className="count-pill">{list.length}</span>}</h4>
      {list.length === 0
        ? <p className="empty sm">아직 입금 기록이 없습니다.</p>
        : (
          <div className="pay-list">
            {list.map((p) => (
              <div className="pay-row" key={p.id}>
                <span className="pay-date">{formatDate(p.date)}</span>
                <span className="pay-memo">{p.memo || '—'}</span>
                <b>{compactWon(p.amount)}</b>
                {canEdit && (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="입금 기록 삭제"
                    onClick={() => remove(p.id)}
                  >✕</button>
                )}
              </div>
            ))}
          </div>
        )}

      {canEdit ? (
        <form onSubmit={add} className="form pay-form">
          <div className="grid2">
            <label className="field"><span>입금일</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="field"><span>입금액(원)</span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                inputMode="numeric"
              />
              <small className={`amount-preview${typed ? '' : ' zero'}`}>
                {String(amount).trim() === '' ? '숫자만 입력하세요' : wonWithCompact(typed)}
              </small>
            </label>
          </div>
          <label className="field"><span>메모</span>
            <input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="선금 / 중도금 / 잔금, 세금계산서 번호…"
            />
          </label>
          <div className="alloc-actions">
            {left > 0 && (
              <button type="button" onClick={fillRemaining}>잔액 {compactWon(left)} 채우기</button>
            )}
            <button type="submit" className="primary" disabled={busy || typed <= 0}>입금 기록</button>
          </div>
        </form>
      ) : (
        <small className="hint">입금 기록은 담당자·팀장·관리자만 남길 수 있습니다.</small>
      )}
    </Modal>
  )
}
