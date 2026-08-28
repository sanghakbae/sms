// 활동 하나를 열어서 보는 모달 — 상세·수정·팀장 피드백.
// 대시보드에서도 열 수 있어야 해서 페이지에서 떼어냈다.

import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import Modal from './Modal.jsx'
import Markdown from './Markdown.jsx'
import MarkdownEditor from './MarkdownEditor.jsx'
import { ACTIVITY_TYPES, getActivityType } from '../lib/pipeline.js'
import { formatDate, relativeDay, todayISO } from '../lib/format.js'
import { canEditDoc } from '../lib/teams.js'
import { initial } from '../lib/accounts.js'
import { addComment, removeComment, subscribeComments } from '../lib/store.js'
import { isBlank } from '../lib/markdown.js'

const EMPTY = { type: 'visit', customerId: '', date: todayISO(), note: '' }

/* --------------------------------- 활동 상세 --------------------------------- */

/**
 * 활동 하나를 열어서 본다.
 * 작성자·팀장·관리자는 고칠 수 있고, 팀장 이상은 댓글로 피드백을 남긴다.
 */
export default function ActivityDetail({ activity, onClose }) {
  const { customers, user, updateActivity, removeActivity, notify } = useApp()
  const [editing, setEditing] = useState(false)

  const canEdit = canEditDoc(user, activity)
  // 댓글은 팀장 이상만 단다. 팀원은 자기 활동에 달린 피드백을 읽기만 한다.
  const canComment = Boolean(user?.isAdmin || user?.role === 'leader')
  const t = getActivityType(activity.type)

  if (editing) {
    return (
      <ActivityModal
        activity={activity}
        customers={customers}
        onClose={() => setEditing(false)}
        onSave={async (data) => {
          await updateActivity(activity.id, data)
          notify('활동을 수정했습니다.')
          setEditing(false)
        }}
      />
    )
  }

  return (
    <Modal
      title="활동 기록"
      onClose={onClose}
      className="activity-detail-modal"
      footer={
        <div className="foot-row">
          {canEdit && (
            <button
              type="button"
              className="danger"
              onClick={async () => {
                if (!window.confirm('이 활동 기록을 삭제할까요? 되돌릴 수 없습니다.\n\n달린 댓글도 함께 사라집니다.')) return
                await removeActivity(activity.id)
                notify('활동을 삭제했습니다.')
                onClose()
              }}
            >삭제</button>
          )}
          <div className="spacer" />
          <button type="button" onClick={onClose}>닫기</button>
          {canEdit && (
            <button type="button" className="primary" onClick={() => setEditing(true)}>수정</button>
          )}
        </div>
      }
    >
      <div className="act-detail">
        <div className="ad-head">
          <span className="ad-icon">{t.icon}</span>
          <div>
            <b>{t.label}</b>
            <small>
              {formatDate(activity.date)} · {relativeDay(activity.date)}
              {activity.customerName ? ` · 🏢 ${activity.customerName}` : ''}
            </small>
          </div>
        </div>
        <div className="ad-owner">👤 {activity.ownerName || '작성자 없음'}</div>

        {activity.note
          ? <Markdown text={activity.note} className="ad-note" />
          : <p className="empty sm">내용이 없습니다.</p>}
      </div>

      <CommentThread
        activityId={activity.id}
        user={user}
        canComment={canComment}
        notify={notify}
      />
    </Modal>
  )
}

/* ---------------------------------- 댓글 ---------------------------------- */

function CommentThread({ activityId, user, canComment, notify }) {
  const [comments, setComments] = useState([])
  const [error, setError] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setError('')
    return subscribeComments(
      activityId,
      setComments,
      (e) => setError(e?.code === 'permission-denied'
        ? '댓글을 읽을 권한이 없습니다.'
        : e?.message || '댓글을 불러오지 못했습니다.'),
    )
  }, [activityId])

  const submit = async (e) => {
    e.preventDefault()
    if (isBlank(text)) return
    setBusy(true)
    try {
      await addComment(user, activityId, text)
      setText('')
      notify('댓글을 남겼습니다.')
    } catch (err) {
      notify(err.message || '댓글을 남기지 못했습니다.')
    } finally { setBusy(false) }
  }

  return (
    <section className="cmt">
      {error && <p className="hint warn-text">{error}</p>}

      <div className="cmt-list">
        {comments.map((c) => (
          <div className="cmt-row" key={c.id}>
            <span className="avatar sm">{initial(c.ownerName)}</span>
            <div className="cmt-body">
              <div className="cmt-head">
                <b>{c.ownerName || '이름 없음'}</b>
                {c.updatedAt && <small>수정됨</small>}
              </div>
              <Markdown text={c.text} className="cmt-text" />
            </div>
            {(user?.isAdmin || c.owner === user?.uid) && (
              <button
                type="button"
                className="icon-btn"
                aria-label="댓글 삭제"
                onClick={async () => {
                  if (!window.confirm('이 댓글을 지울까요?')) return
                  await removeComment(activityId, c.id)
                  notify('댓글을 지웠습니다.')
                }}
              >✕</button>
            )}
          </div>
        ))}
      </div>

      {canComment ? (
        <form onSubmit={submit} className="cmt-form">
          <MarkdownEditor
            value={text}
            onChange={setText}
            rows={1}
            placeholder="잘한 점, 다음에 할 것…"
            hint="팀원에게 남기는 피드백입니다."
          />
          <button type="submit" className="primary" disabled={busy || isBlank(text)}>
            피드백 남기기
          </button>
        </form>
      ) : (
        <small className="hint">피드백은 팀장 이상만 남길 수 있습니다.</small>
      )}
    </section>
  )
}

/* ------------------------------- 활동 추가·수정 ------------------------------- */

export function ActivityModal({ activity, customers, onClose, onSave }) {
  const [form, setForm] = useState(activity ? { ...EMPTY, ...activity } : EMPTY)
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
        note: (form.note || '').trim(),
      })
    } finally { setBusy(false) }
  }

  return (
    <Modal
      title={activity ? '활동 수정' : '활동 기록'}
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
        <div className="field"><span>내용</span>
          <MarkdownEditor
            value={form.note}
            onChange={(v) => setForm((f) => ({ ...f, note: v }))}
            rows={4}
            placeholder="논의 내용, 다음 액션…"
            autoFocus
          />
        </div>
      </form>
    </Modal>
  )
}
