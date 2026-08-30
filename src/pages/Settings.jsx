import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { compactWon, formatDate, yearKey, yearLabel } from '../lib/format.js'
import { monthlySeries, targetProgress, yearlyWon } from '../lib/stats.js'
import { ALLOWED_DOMAINS, BOOTSTRAP_ADMINS, initial } from '../lib/accounts.js'
import { teamName as nameOfTeam } from '../lib/teams.js'
import { actionLabel, actionsIn, describe, isHighRisk, matches } from '../lib/audit.js'

export default function Settings() {
  const { user, deals, targets, services, teams, admins, members, auditLogs, setServices, notify } = useApp()
  const year = yearKey()
  const target = Number(targets[year]) || 0
  const won = useMemo(() => yearlyWon(deals, year), [deals, year])
  const progress = targetProgress(won.amount, target)
  const series = useMemo(() => monthlySeries(deals, year), [deals, year])
  const maxMonth = Math.max(1, ...series.map((m) => m.amount))

  return (
    <main className="page">
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

      {user.isAdmin && (
        <>
          <ServiceCatalog services={services} setServices={setServices} notify={notify} />
          <SecurityPanel teams={teams} admins={admins} members={members} />
          <AuditPanel logs={auditLogs} />
        </>
      )}

      <footer className="app-foot">
        <a href="/privacy.html" target="_blank" rel="noopener noreferrer">개인정보처리방침</a>
        <span className="app-foot-sep" aria-hidden="true">·</span>
        <span>개인정보 보호책임자 배상학</span>
        <span className="app-foot-sep" aria-hidden="true">·</span>
        <a href="mailto:bae@sanghak.kr">bae@sanghak.kr</a>
      </footer>
    </main>
  )
}

/* ------------------------------- 대상 서비스 목록 ------------------------------- */

/** 영업기회에서 고를 수 있는 판매 서비스. 목록 관리는 관리자만. */
function ServiceCatalog({ services, setServices, notify }) {
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

      {services.length === 0
        ? <p className="empty">등록된 서비스가 없습니다. 아래에서 추가하세요.</p>
        : (
          <div className="svc-list">
            {services.map((svc) => (
              <div className="svc-row" key={svc.id}>
                <span className="svc-name">{svc.name}</span>
                <button type="button" className="danger ghost sm" onClick={() => remove(svc)}>삭제</button>
              </div>
            ))}
          </div>
        )}

      <form onSubmit={add} className="admin-add">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="추가할 서비스명 (예: 카피킬러 캠퍼스)"
        />
        <button type="submit" className="primary" disabled={busy}>추가</button>
      </form>
      <small className="hint">여기 등록한 서비스를 영업기회에서 고를 수 있습니다.</small>
    </section>
  )
}

/* -------------------------------- 보안 설정 -------------------------------- */

/**
 * 지금 이 시스템이 어떤 상태인지 한눈에.
 * 켜고 끄는 스위치가 아니라 '현재 설정' 을 읽는 화면이다 —
 * 접근 제어의 실제 근거는 firestore.rules 이고, 화면에서 바꿀 수 있게 만들면
 * 규칙과 어긋난 값이 생겨 무엇이 참인지 알 수 없게 된다.
 */
function SecurityPanel({ teams, admins, members }) {
  const adminCount = new Set([
    ...BOOTSTRAP_ADMINS,
    ...(admins || []).map((e) => String(e).toLowerCase()),
  ]).size
  const leaders = (members || []).filter((m) => m.role === 'leader')
  const unassigned = (members || []).filter((m) => !m.teamId)

  const rows = [
    {
      label: '로그인 방식',
      value: 'Google OAuth',
      note: '이메일 인증(email_verified)된 계정만 통과합니다.',
      ok: true,
    },
    {
      label: '접근 도메인 제한',
      value: ALLOWED_DOMAINS.length ? ALLOWED_DOMAINS.join(', ') : '없음',
      note: ALLOWED_DOMAINS.length
        ? '이 도메인 계정만 들어올 수 있습니다.'
        : '인증된 구글 계정이면 누구나 로그인됩니다. 팀에 배정되기 전에는 데이터를 볼 수 없습니다.',
      ok: ALLOWED_DOMAINS.length > 0,
    },
    {
      label: '데이터 공개 범위',
      value: '전사 공유 + 팀 격리',
      note: '거래처·영업현황은 전사 공유, 대시보드·활동·거래는 자기 팀만 봅니다.',
      ok: true,
    },
    {
      label: '권한',
      value: `관리자 ${adminCount} · 팀장 ${leaders.length} · 팀 ${teams.length}`,
      note: unassigned.length
        ? `배정 대기 ${unassigned.length}명 — 팀에 넣기 전에는 아무 데이터도 볼 수 없습니다.`
        : '모든 사용자가 팀에 배정돼 있습니다.',
      ok: true,
    },
    {
      label: '감사 로그',
      value: '켜짐 · 덧붙이기 전용',
      note: '삭제·권한 변경·목표 변경·입금을 기록합니다. 고치거나 지울 수 없습니다.',
      ok: true,
    },
  ]

  return (
    <section className="panel">
      <h3>보안 설정</h3>
      <div className="sec-list">
        {rows.map((r) => (
          <div className="sec-row" key={r.label}>
            <div className="sec-main">
              <b>{r.label}</b>
              <small>{r.note}</small>
            </div>
            <span className={`sec-val${r.ok ? '' : ' warn'}`}>{r.value}</span>
          </div>
        ))}
      </div>

      <div className="sec-note">
        <b>보안 규칙은 배포해야 적용됩니다.</b>
        <p>
          <code>firestore.rules</code> 와 <code>src/lib/accounts.js</code> 는 같은 기준을
          중복 구현합니다. 한쪽만 고치면 화면은 열리는데 데이터가 거부되거나 그 반대가 됩니다.
        </p>
        <pre><code>firebase deploy --only firestore:rules,firestore:indexes</code></pre>
      </div>
    </section>
  )
}

/* -------------------------------- 감사 로그 -------------------------------- */

function AuditPanel({ logs }) {
  const [q, setQ] = useState('')
  const [action, setAction] = useState('')

  const kinds = useMemo(() => actionsIn(logs), [logs])
  const rows = useMemo(
    () => (logs || []).filter((l) => (!action || l.action === action) && matches(l, q)),
    [logs, action, q],
  )

  return (
    <section className="panel">
      <h3>감사 로그</h3>
      <p className="hint">
        삭제·권한 변경·목표 변경·입금처럼 되돌리기 어려운 작업만 남깁니다.
        기록은 고치거나 지울 수 없습니다.
      </p>

      <div className="toolbar">
        <input
          className="search"
          placeholder="사람·작업·대상 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="chip-select" value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">전체 작업</option>
          {kinds.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
        </select>
      </div>

      {rows.length === 0
        ? <p className="empty">{logs.length === 0 ? '아직 기록이 없습니다.' : '검색 결과가 없습니다.'}</p>
        : (
          <div className="audit-list">
            {rows.map((l) => (
              <div className={`audit-row${isHighRisk(l.action) ? ' high' : ''}`} key={l.id}>
                <span className="avatar sm">{initial(l.actorName)}</span>
                <div className="audit-body">
                  <div className="audit-head">
                    <b>{actionLabel(l.action)}</b>
                    <span className="audit-who" title={l.actorEmail}>{l.actorName || '알 수 없음'}</span>
                  </div>
                  <small className="audit-detail">{describe(l) || '—'}</small>
                  {l.note && <small className="audit-note">{l.note}</small>}
                </div>
                <span className="audit-at">{stamp(l.at)}</span>
              </div>
            ))}
          </div>
        )}
      {logs.length >= 300 && (
        <small className="hint">최근 300건만 보여줍니다.</small>
      )}
    </section>
  )
}

/** Firestore Timestamp → 화면용 문자열. 아직 서버 시각이 안 온 경우도 있다. */
function stamp(at) {
  if (!at?.toDate) return '방금'
  const d = at.toDate()
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return `${formatDate(iso)} ${hm}`
}
