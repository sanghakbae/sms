import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { compactWon, yearKey, yearLabel } from '../lib/format.js'
import { monthlySeries, targetProgress, yearlyWon } from '../lib/stats.js'

export default function Settings() {
  const { user, deals, targets, services, setServices, notify, logout } = useApp()
  const year = yearKey()
  const target = Number(targets[year]) || 0
  const won = useMemo(() => yearlyWon(deals, year), [deals, year])
  const progress = targetProgress(won.amount, target)
  const series = useMemo(() => monthlySeries(deals, year), [deals, year])
  const maxMonth = Math.max(1, ...series.map((m) => m.amount))

  return (
    <main className="page">
      <section className="panel">
        <h3>내 계정</h3>
        <div className="account-box">
          {user.photoURL
            ? <img className="avatar big" src={user.photoURL} alt="" referrerPolicy="no-referrer" />
            : <span className="avatar big">{user.name.charAt(0)}</span>}
          <div>
            <b>{user.name}</b>
            <small>{user.email}{user.isAdmin ? ' · 팀장' : ''}</small>
          </div>
          <button type="button" className="danger ghost" onClick={logout}>로그아웃</button>
        </div>
      </section>

      <section className="panel">
        <h3>{yearLabel(year)} 목표 현황</h3>
        {user.isAdmin && <p className="hint">목표 설정은 <b>팀 관리 → 연 매출목표</b>에서 합니다.</p>}
        <div className="year-summary">
          <div className="ys-top">
            <span>누적 수주 <b>{compactWon(won.amount)}</b> · {won.count}건</span>
            <span>
              목표 <b>{target ? compactWon(target) : '미설정'}</b>
              {progress != null && <b className="pct"> {progress}%</b>}
            </span>
          </div>
          {target > 0 && <div className="goal-bar"><span style={{ width: `${Math.min(100, progress)}%` }} /></div>}
        </div>
        <div className="month-grid">
          {series.map((m) => (
            <div className={`mg-cell${m.amount > 0 ? ' has' : ''}`} key={m.month}>
              <span className="mg-month">{m.monthNo}월</span>
              <div className="mg-bar"><span style={{ height: `${(m.amount / maxMonth) * 100}%` }} /></div>
              <span className="mg-amount">{m.amount > 0 ? compactWon(m.amount) : '—'}</span>
              <span className="mg-count">{m.count > 0 ? `${m.count}건` : ''}</span>
            </div>
          ))}
        </div>
      </section>

      <ServiceCatalog
        services={services}
        canEdit={user.isAdmin}
        setServices={setServices}
        notify={notify}
      />

      <p className="foot-note">영업 관리시스템 · React + Firebase</p>
    </main>
  )
}

/* ------------------------------- 대상 서비스 목록 ------------------------------- */

/** 영업기회에서 고를 수 있는 판매 서비스. 목록 관리는 관리자만. */
function ServiceCatalog({ services, canEdit, setServices, notify }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const add = async (e) => {
    e.preventDefault()
    const next = name.trim()
    if (!next) return
    if (services.some((s) => s.name.toLowerCase() === next.toLowerCase())) {
      notify('이미 있는 서비스입니다.')
      return
    }
    setBusy(true)
    try {
      // id 는 이름과 무관하게 고정돼야 한다 — 이름을 바꿔도 기존 딜 연결이 유지되도록.
      const id = `svc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
      await setServices([...services, { id, name: next }])
      notify(`'${next}' 서비스를 추가했습니다.`)
      setName('')
    } finally { setBusy(false) }
  }

  const remove = async (svc) => {
    if (!window.confirm(`'${svc.name}' 서비스를 목록에서 지울까요?\n\n이미 이 서비스로 등록된 영업기회의 기록은 그대로 남습니다.`)) return
    await setServices(services.filter((s) => s.id !== svc.id))
    notify('서비스를 지웠습니다.')
  }

  return (
    <section className="panel">
      <h3>대상 서비스</h3>
      {!canEdit && <p className="hint">서비스 목록 관리는 팀장만 가능합니다.</p>}

      {services.length === 0
        ? <p className="empty">등록된 서비스가 없습니다.{canEdit ? ' 아래에서 추가하세요.' : ''}</p>
        : (
          <div className="svc-list">
            {services.map((svc) => (
              <div className="svc-row" key={svc.id}>
                <span className="svc-name">{svc.name}</span>
                {canEdit && (
                  <button type="button" className="danger ghost sm" onClick={() => remove(svc)}>삭제</button>
                )}
              </div>
            ))}
          </div>
        )}

      {canEdit && (
        <form onSubmit={add} className="admin-add">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="추가할 서비스명 (예: 카피킬러 캠퍼스)"
          />
          <button type="submit" className="primary" disabled={busy}>추가</button>
        </form>
      )}
      <small className="hint">여기 등록한 서비스를 영업기회에서 고를 수 있습니다.</small>
    </section>
  )
}
