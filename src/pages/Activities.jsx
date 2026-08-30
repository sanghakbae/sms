import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import ActivityDetail, { ActivityModal } from '../components/ActivityDetail.jsx'
import { ACTIVITY_TYPES, getActivityType } from '../lib/pipeline.js'
import { formatDate, relativeDay } from '../lib/format.js'

export default function Activities() {
  const { activities, customers, user, canCreate, addActivity, notify } = useApp()
  const [adding, setAdding] = useState(false)
  const [opened, setOpened] = useState(null) // 상세를 연 활동
  const [typeFilter, setTypeFilter] = useState('')

  const teamActivities = useMemo(
    () => (user.isAdmin ? activities : activities.filter((a) => a.teamId === user.teamId)),
    [activities, user.isAdmin, user.teamId],
  )
  const list = useMemo(
    () => (typeFilter ? teamActivities.filter((a) => a.type === typeFilter) : teamActivities),
    [teamActivities, typeFilter],
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

  // 목록이 갱신되면 열려 있는 상세도 최신 문서로 바꿔준다.
  // 안 그러면 수정한 내용이 모달에 반영되지 않는다.
  const current = opened ? teamActivities.find((a) => a.id === opened.id) || null : null
  useEffect(() => {
    if (opened && !current) setOpened(null) // 남이 지웠다
  }, [opened, current])

  return (
    <main className="page">
      <div className="toolbar activity-toolbar">
        <div className="chips grow activity-filters">
          <button type="button" className={`chip${typeFilter === '' ? ' on' : ''}`} onClick={() => setTypeFilter('')}>전체</button>
          {ACTIVITY_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`chip${typeFilter === t.id ? ' on' : ''}`}
              onClick={() => setTypeFilter(typeFilter === t.id ? '' : t.id)}
              aria-label={t.label}
              title={t.label}
            >
              {/* 좁은 화면에서는 아이콘만 남긴다 — 라벨까지 넣으면 한 줄을 넘긴다.
                  글자가 사라져도 뜻이 통하도록 aria-label 과 title 을 붙인다. */}
              <span aria-hidden="true">{t.icon}</span>
              <span className="chip-label">{t.label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="primary"
          onClick={() => setAdding(true)}
          disabled={!canCreate}
          title={canCreate ? '' : '팀에 배정돼야 만들 수 있습니다.'}
        >+ 활동</button>
      </div>

      <div className="timeline">
        {groups.length === 0 && <p className="empty">활동 기록이 없습니다.</p>}
        {groups.map(([date, items]) => (
          <div className="tl-group" key={date}>
            <div className="tl-date">{formatDate(date)} <small>{relativeDay(date)}</small></div>
            {items.map((a) => {
              const t = getActivityType(a.type)
              return (
                <button
                  type="button"
                  className="tl-item"
                  key={a.id}
                  onClick={() => setOpened(a)}
                >
                  <span className="tl-icon">{t.icon}</span>
                  <span className="tl-body">
                    <span className="tl-head">
                      <b>{t.label}</b>
                      {a.customerName && <span className="tl-cust">🏢 {a.customerName}</span>}
                      <span className="tl-owner">👤 {a.ownerName || ''}</span>
                    </span>
                    {a.note && <span className="tl-note-line">{firstLine(a.note)}</span>}
                  </span>
                  <span className="tl-more" aria-hidden="true">›</span>
                </button>
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

      {current && (
        <ActivityDetail activity={current} onClose={() => setOpened(null)} />
      )}
    </main>
  )
}

/** 목록에 보여줄 한 줄 요약. 서식 기호는 떼고 첫 줄만. */
function firstLine(note) {
  const line = String(note || '').split('\n').find((l) => l.trim()) || ''
  return line.replace(/^\s*(?:#{1,3}\s+|>\s?|[-*]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/, '').trim()
}
