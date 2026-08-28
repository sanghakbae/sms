import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import {
  compactWon, daysLeftInYear, formatAmountInput, monthKey, monthLabel, wonWithCompact, yearKey, yearLabel,
} from '../lib/format.js'
import {
  allocationSummary, monthlySeries, targetProgress, teamSummary, yearlyWon, yearsWithData,
} from '../lib/stats.js'
import { getActivityType, getGrade, getStage } from '../lib/pipeline.js'
import {
  BOOTSTRAP_ADMINS,
  initial,
  isAdminEmail,
  isBootstrapAdmin,
  looksLikeEmail,
  normalizeEmail,
} from '../lib/accounts.js'
import { downloadCsv, toCsv } from '../lib/csv.js'
import {
  ROLES,
  ROLE_LEADER,
  teamTotals,
  groupByTeam,
  makeTeamId,
  memberRows,
  teamAllocationSummary,
  teamProgress,
  teamName as nameOfTeam,
  unassignedRows,
} from '../lib/teams.js'

const MEMBER_COLUMNS = ['이번달 수주', '진행중', '지연', '실패', '연 목표', '거래처·활동']
const count = (value) => (Number(value) || 0).toLocaleString('ko-KR')

function MemberTableHead() {
  return (
    <div className="team-table-head" aria-hidden="true">
      <span className="team-head-member">팀원</span>
      <div className="team-metric-head">
        {MEMBER_COLUMNS.map((label) => <span key={label}>{label}</span>)}
      </div>
    </div>
  )
}

function MemberMetrics({ member: m, allocOf }) {
  const target = allocOf(m.email)
  return (
    <div className="team-nums member-metrics">
      <span data-label="이번달 수주"><b>{compactWon(m.wonAmount)}<small>({count(m.wonCount)}건)</small></b></span>
      <span data-label="진행중"><b>{compactWon(m.openAmount)}<small>({count(m.openCount)}건)</small></b></span>
      <span data-label="지연"><b className={m.overdueCount ? 'warn' : ''}>{count(m.overdueCount)}건</b></span>
      <span data-label="실패"><b>{count(m.lostCount)}건</b></span>
      <span data-label="연 목표">
        <b>{target ? compactWon(target) : '—'}{target ? <small>({targetProgress(m.yearWonAmount, target)}%)</small> : null}</b>
      </span>
      <span data-label="거래처·활동"><b>{count(m.customerCount)}건·{count(m.activityCount)}건</b></span>
    </div>
  )
}

/** 관리자 전용 화면 — 팀 편성, 목표 배분, 팀원 현황, 관리자 명단, 내보내기. */
export default function Team() {
  const {
    deals, customers, activities, admins, members, teams,
    targets, teamTargets, ownerTargets,
    user, setAdmins, setYearlyTarget, setOwnerTargets,
    setTeams, setTeamTargets, setMemberTeam, setMemberRole, removeMember,
    assignMissingTeam, countMissingTeam, notify,
  } = useApp()
  const month = monthKey()

  // 실적 집계에 팀원 명단을 겹친다 —
  // 로그인만 하고 아직 아무것도 안 만든 사람도 목록에 나와야 목표를 미리 줄 수 있다.
  const derived = useMemo(
    () => teamSummary(deals, customers, activities, month),
    [deals, customers, activities, month],
  )
  const rows = useMemo(() => memberRows(members, derived), [members, derived])
  const groups = useMemo(() => groupByTeam(rows, teams), [rows, teams])
  const waiting = useMemo(() => unassignedRows(rows), [rows])

  const yearAlloc = (ownerTargets && ownerTargets[yearKey()]) || {}
  const allocOf = (email) => Number(yearAlloc[email]) || 0

  // 팀장은 자기 팀만 본다. 편성·목표 설정은 관리자 몫이라 화면에서 뺀다 —
  // 보안 규칙에서도 막히므로, 눌러봐야 거부당할 버튼을 보여주지 않는다.
  if (!user.isAdmin) {
    const mine = groups.find((g) => g.team.id === user.teamId)
    return (
      <LeaderView
        group={mine}
        month={month}
        teamTargets={teamTargets}
        allocOf={allocOf}
        admins={admins}
      />
    )
  }

  return (
    <main className="page">
      <TeamRoster
        teams={teams}
        groups={groups}
        waiting={waiting}
        admins={admins}
        setTeams={setTeams}
        setMemberTeam={setMemberTeam}
        setMemberRole={setMemberRole}
        removeMember={removeMember}
        notify={notify}
      />

      <MigratePanel
        teams={teams}
        assignMissingTeam={assignMissingTeam}
        countMissingTeam={countMissingTeam}
        notify={notify}
      />

      <TeamTarget
        deals={deals}
        targets={targets}
        setYearlyTarget={setYearlyTarget}
        notify={notify}
      />

      <TeamAllocation
        teams={teams}
        groups={groups}
        targets={targets}
        teamTargets={teamTargets}
        setTeamTargets={setTeamTargets}
        notify={notify}
      />

      <OwnerAllocation
        groups={groups}
        teamTargets={teamTargets}
        ownerTargets={ownerTargets}
        setOwnerTargets={setOwnerTargets}
        notify={notify}
      />

      <section className="panel">
        <h3>팀원 현황 · {monthLabel(month)}</h3>
        {groups.length === 0 && <p className="empty">아직 만든 팀이 없습니다. 위에서 팀을 만들어주세요.</p>}
        {groups.map((g) => (
          <div className="team-group" key={g.team.id}>
            <div className="tg-head">
              <b>{g.team.name}</b>
              <small>{g.members.length}명</small>
            </div>
            {g.members.length === 0 && <p className="empty sm">팀원이 없습니다.</p>}
            {g.members.length > 0 && <MemberTableHead />}
            <div className="team-list">
              {g.members.map((m) => (
                <div className="team-row member-row" key={m.key}>
                  <span className="avatar">{initial(m.name)}</span>
                  {/* 이메일은 화면에 띄우지 않는다 — 같은 이름이 겹칠 때만 tooltip 으로 확인한다. */}
                  <div className="team-who" title={m.email || ''}>
                    <b>
                      {m.name}
                      {isAdminEmail(m.email, admins) && <span className="tag admin">관리자</span>}
                      {m.role === ROLE_LEADER && <span className="tag leader">팀장</span>}
                      {!m.registered && <span className="tag">옛 데이터</span>}
                    </b>
                  </div>
                  <MemberMetrics member={m} allocOf={allocOf} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <AdminRoster admins={admins} rows={rows} user={user} setAdmins={setAdmins} notify={notify} />

      <ExportPanel deals={deals} customers={customers} activities={activities} notify={notify} />
    </main>
  )
}

/* ------------------------------- 팀장 화면(모니터링) ------------------------------ */

/**
 * 팀장이 자기 팀을 지켜보는 화면.
 * 고칠 수 있는 것은 데이터(딜·활동)뿐이고, 여기서는 상태만 본다.
 * 편성과 목표는 관리자가 정한다 — 팀장이 자기 목표를 낮출 수 있으면 목표가 아니다.
 */
function LeaderView({ group, month, teamTargets, allocOf, admins }) {
  const year = yearKey()
  const teamTarget = group ? Number((teamTargets?.[year] || {})[group.team.id]) || 0 : 0

  if (!group) {
    return (
      <main className="page">
        <section className="panel">
          <h3>팀</h3>
          <p className="empty">소속된 팀을 찾을 수 없습니다. 관리자에게 문의해주세요.</p>
        </section>
      </main>
    )
  }

  const totals = teamTotals(group.members)
  const progress = teamTarget > 0 ? Math.round((totals.yearWonAmount / teamTarget) * 100) : null

  return (
    <main className="page">
      <section className="panel">
        <h3>{group.team.name} · {yearLabel(year)}</h3>
        <div className="year-summary">
          <div className="ys-top">
            <span>연 누적 수주 <b>{compactWon(totals.yearWonAmount)}</b> · {totals.yearWonCount}건</span>
            <span>
              팀 목표 <b>{teamTarget ? compactWon(teamTarget) : '미배분'}</b>
              {progress != null && <b className="pct"> {progress}%</b>}
            </span>
          </div>
          {teamTarget > 0 && (
            <div className="goal-bar"><span style={{ width: `${Math.min(100, progress)}%` }} /></div>
          )}
        </div>
        <div className="team-nums lead-nums">
          <span><i>진행중</i><b>{compactWon(totals.openAmount)}</b><small>{totals.openCount}건</small></span>
          <span><i>지연</i><b className={totals.overdueCount ? 'warn' : ''}>{totals.overdueCount}건</b><small>마감 초과</small></span>
          <span><i>실패</i><b>{totals.lostCount}건</b><small>회고 대상</small></span>
          <span><i>거래처·활동</i><b>{totals.customerCount}·{totals.activityCount}</b><small>등록 건수</small></span>
        </div>
      </section>

      <section className="panel">
        <h3>팀원 현황 · {monthLabel(month)}</h3>
        {group.members.length === 0 && <p className="empty">팀원이 없습니다.</p>}
        {group.members.length > 0 && <MemberTableHead />}
        <div className="team-list">
          {group.members.map((m) => (
            <div className="team-row member-row" key={m.key}>
              <span className="avatar">{initial(m.name)}</span>
              <div className="team-who" title={m.email || ''}>
                <b>
                  {m.name}
                  {isAdminEmail(m.email, admins) && <span className="tag admin">관리자</span>}
                  {m.role === ROLE_LEADER && <span className="tag leader">팀장</span>}
                </b>
              </div>
              <MemberMetrics member={m} allocOf={allocOf} />
            </div>
          ))}
        </div>
        <small className="hint">
          팀원 활동을 눌러 <b>피드백</b>을 남길 수 있습니다(활동 탭).
          목표 배분과 팀 편성은 관리자가 정합니다.
        </small>
      </section>
    </main>
  )
}

/* --------------------------------- 팀 편성 --------------------------------- */

/**
 * 팀을 만들고 사람을 넣는다.
 *
 * '팀원 추가' 는 이메일을 받아 적는 방식이 아니다 — 로그인하면 본인이 명단에 올라오고
 * (store.js 의 registerMember), 관리자는 그 목록에서 팀을 골라 넣는다.
 * 팀에 넣는 것이 곧 승인이다. 팀이 없으면 데이터를 보지도, 만들지도 못한다.
 */
function TeamRoster({
  teams, groups, waiting, admins, setTeams, setMemberTeam, setMemberRole, removeMember, notify,
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [renaming, setRenaming] = useState(null) // { id, name } | null

  const addTeam = async (e) => {
    e.preventDefault()
    const next = name.trim()
    if (!next) return
    if (teams.some((t) => t.name.toLowerCase() === next.toLowerCase())) {
      notify('같은 이름의 팀이 이미 있습니다.')
      return
    }
    setBusy(true)
    try {
      // id 는 이름과 무관하게 고정한다 — 팀 이름을 바꿔도 소속과 목표가 유지되도록.
      await setTeams([...teams, { id: makeTeamId(), name: next }])
      notify(`'${next}' 팀을 만들었습니다.`)
      setName('')
    } finally { setBusy(false) }
  }

  const rename = async (e) => {
    e.preventDefault()
    const next = renaming.name.trim()
    if (!next) return
    await setTeams(teams.map((t) => (t.id === renaming.id ? { ...t, name: next } : t)))
    notify('팀 이름을 바꿨습니다.')
    setRenaming(null)
  }

  const dropTeam = async (team, memberCount) => {
    const tail = memberCount
      ? `\n\n소속된 ${memberCount}명은 '미배정'으로 돌아가고, 그동안 만든 데이터는 이 팀에 남습니다.`
      : ''
    if (!window.confirm(`'${team.name}' 팀을 지울까요?${tail}`)) return
    await setTeams(teams.filter((t) => t.id !== team.id))
    notify('팀을 지웠습니다.')
  }

  const assign = async (row, teamId) => {
    if (!row.uid) {
      notify('로그인 기록이 없는 계정은 팀에 넣을 수 없습니다.')
      return
    }
    await setMemberTeam(row.uid, teamId)
    notify(teamId
      ? `${row.name} 을(를) ${nameOfTeam(teams, teamId)} 에 넣었습니다.`
      : `${row.name} 을(를) 팀에서 뺐습니다.`)
  }

  const changeRole = async (row, role) => {
    if (!row.uid) return
    await setMemberRole(row.uid, role)
    notify(role === ROLE_LEADER
      ? `${row.name} 을(를) 팀장으로 지정했습니다.`
      : `${row.name} 을(를) 팀원으로 바꿨습니다.`)
  }

  const drop = async (row) => {
    if (!window.confirm(`${row.name} 을(를) 명단에서 지울까요?\n\n그동안 만든 데이터는 그대로 남습니다. 다시 로그인하면 목록에 다시 올라옵니다.`)) return
    await removeMember(row.uid)
    notify('명단에서 지웠습니다.')
  }

  return (
    <section className="panel">
      <h3>팀 편성</h3>

      {/* 로그인은 했지만 아직 팀이 없는 사람 — 여기서 팀에 넣는다. */}
      <div className="roster-block">
        <h4>
          배정 대기
          {waiting.length > 0 && <span className="count-pill">{waiting.length}</span>}
        </h4>
        {waiting.length === 0
          ? <p className="empty sm">대기 중인 사용자가 없습니다.</p>
          : (
            <>
              <p className="hint">
                로그인한 계정이 자동으로 올라옵니다. 팀에 넣기 전에는 데이터를 보거나
                만들 수 없습니다.
              </p>
              <div className="roster-list">
                {waiting.map((r) => (
                  <div className="roster-row" key={r.key}>
                    <span className="avatar">{initial(r.name)}</span>
                    <div className="roster-who" title={r.email || ''}>
                      <b>
                        {r.name}
                        {isAdminEmail(r.email, admins) && <span className="tag admin">관리자</span>}
                        {!r.registered && <span className="tag">옛 데이터</span>}
                      </b>
                    </div>
                    <div className="roster-act">
                      <select
                        value=""
                        onChange={(e) => e.target.value && assign(r, e.target.value)}
                        disabled={teams.length === 0 || !r.uid}
                        aria-label={`${r.name} 팀 배정`}
                      >
                        <option value="">
                          {teams.length === 0 ? '팀을 먼저 만드세요' : '팀 선택…'}
                        </option>
                        {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                      {r.uid && (
                        <button type="button" className="danger ghost sm" onClick={() => drop(r)}>
                          제외
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
      </div>

      {/* 팀 목록 + 소속 인원 */}
      <div className="roster-block">
        <h4>팀 {teams.length > 0 && <span className="count-pill">{teams.length}</span>}</h4>
        {groups.length === 0 && <p className="empty sm">아직 팀이 없습니다.</p>}
        {groups.map((g) => (
          <div className={`team-card${g.missing ? ' missing' : ''}${g.members.length === 0 ? ' empty-team' : ''}`} key={g.team.id}>
            <div className="tc-head">
              {renaming?.id === g.team.id ? (
                <form onSubmit={rename} className="tc-rename">
                  <input
                    value={renaming.name}
                    onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
                    aria-label="팀 이름"
                    autoFocus
                  />
                  <button type="submit" className="primary sm">저장</button>
                  <button type="button" className="sm" onClick={() => setRenaming(null)}>취소</button>
                </form>
              ) : (
                <>
                  <b>{g.team.name}</b>
                  <small>
                    {g.members.length}명
                    {(() => {
                      const leaders = g.members.filter((m) => m.role === ROLE_LEADER)
                      return leaders.length
                        ? ` · 팀장 ${leaders.map((m) => m.name).join(', ')}`
                        : ' · 팀장 없음'
                    })()}
                  </small>
                  <div className="spacer" />
                  {!g.missing && (
                    <>
                      <button
                        type="button"
                        className="ghost sm"
                        onClick={() => setRenaming({ id: g.team.id, name: g.team.name })}
                      >이름 변경</button>
                      <button
                        type="button"
                        className="danger ghost sm"
                        onClick={() => dropTeam(g.team, g.members.length)}
                      >삭제</button>
                    </>
                  )}
                </>
              )}
            </div>

            {g.missing && (
              <p className="hint warn-text">
                지워진 팀에 소속이 남아 있습니다. 아래 인원을 다른 팀으로 옮겨주세요.
              </p>
            )}

            {g.members.length === 0
              ? <p className="empty sm">팀원이 없습니다. 위 '배정 대기'에서 넣어주세요.</p>
              : (
                <div className="roster-list">
                  {g.members.map((r) => (
                    <div className="roster-row" key={r.key}>
                      <span className="avatar">{initial(r.name)}</span>
                      <div className="roster-who" title={r.email || ''}>
                        <b>
                          {r.name}
                          {isAdminEmail(r.email, admins) && <span className="tag admin">관리자</span>}
                          {r.role === ROLE_LEADER && <span className="tag leader">팀장</span>}
                        </b>
                      </div>
                      <div className="roster-act">
                        <select
                          className={r.role === ROLE_LEADER ? 'is-leader' : ''}
                          value={r.role}
                          onChange={(e) => changeRole(r, e.target.value)}
                          disabled={!r.uid}
                          aria-label={`${r.name} 권한`}
                        >
                          {ROLES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                        </select>
                        <select
                          value={r.teamId}
                          onChange={(e) => assign(r, e.target.value)}
                          disabled={!r.uid}
                          aria-label={`${r.name} 소속 팀`}
                        >
                          {g.missing && <option value={r.teamId}>{g.team.name}</option>}
                          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                          <option value="">미배정으로</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>
        ))}

        <form onSubmit={addTeam} className="admin-add">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="새 팀 이름 (예: 대학영업 1팀)"
          />
          <button type="submit" className="primary" disabled={busy}>팀 만들기</button>
        </form>
      </div>
    </section>
  )
}

/* --------------------------- 기존 데이터 팀 배정(이관) --------------------------- */

const MIGRATE_TARGETS = [
  { name: 'deals', label: '영업기회' },
  { name: 'customers', label: '거래처' },
  { name: 'activities', label: '영업활동' },
]

/**
 * 팀별 범위를 켜기 전에 만들어진 문서에는 teamId 가 없다.
 * 거래처·영업현황 목록에서는 공유 데이터로 보이지만 팀 대시보드·거래 집계와
 * 활동 목록에는 들어오지 않는다. 여기서 한 번 채워 팀 실적에 연결한다.
 */
function MigratePanel({ teams, assignMissingTeam, countMissingTeam, notify }) {
  const [counts, setCounts] = useState(null)
  const [teamId, setTeamId] = useState('')
  const [busy, setBusy] = useState('')
  const [progress, setProgress] = useState('')

  const check = async () => {
    setBusy('check')
    try {
      const out = {}
      for (const t of MIGRATE_TARGETS) out[t.name] = await countMissingTeam(t.name)
      setCounts(out)
    } catch (err) {
      notify(err.message || '확인에 실패했습니다.')
    } finally { setBusy('') }
  }

  const run = async (target) => {
    if (!teamId) { notify('배정할 팀을 골라주세요.'); return }
    const n = counts?.[target.name] || 0
    if (!window.confirm(`팀이 없는 ${target.label} ${n}건을 '${nameOfTeam(teams, teamId)}' 에 배정할까요?\n\n되돌리려면 다시 손으로 고쳐야 합니다.`)) return
    setBusy(target.name)
    setProgress('')
    try {
      const total = await assignMissingTeam(target.name, teamId, (done, all) => {
        setProgress(`${done} / ${all}`)
      })
      notify(`${target.label} ${total}건을 배정했습니다.`)
      await check()
    } catch (err) {
      notify(err.message || '배정에 실패했습니다.')
    } finally { setBusy(''); setProgress('') }
  }

  const totalMissing = counts
    ? MIGRATE_TARGETS.reduce((s, t) => s + (counts[t.name] || 0), 0)
    : null

  return (
    <section className="panel">
      <h3>기존 데이터 팀 배정</h3>
      <p className="hint">
        팀별 범위를 켜기 전에 만들어진 데이터에는 소속 팀이 없습니다. 공유 목록에는
        보이지만 <b>팀 대시보드·활동·거래에는 집계되지 않습니다.</b> 한 번 배정해주세요.
      </p>

      {counts === null ? (
        <button type="button" className="block" onClick={check} disabled={busy === 'check'}>
          {busy === 'check' ? '확인 중…' : '미배정 데이터 확인'}
        </button>
      ) : totalMissing === 0 ? (
        <p className="empty sm">미배정 데이터가 없습니다.</p>
      ) : (
        <>
          <label className="field"><span>배정할 팀</span>
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="">팀 선택…</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <div className="migrate-list">
            {MIGRATE_TARGETS.map((t) => {
              const n = counts[t.name] || 0
              return (
                <div className="migrate-row" key={t.name}>
                  <span>{t.label}</span>
                  <b className={n ? 'warn' : ''}>{n}건</b>
                  <button
                    type="button"
                    className="primary sm"
                    disabled={!n || !teamId || Boolean(busy)}
                    onClick={() => run(t)}
                  >
                    {busy === t.name ? (progress || '배정 중…') : '배정'}
                  </button>
                </div>
              )
            })}
          </div>
          <button type="button" className="ghost sm" onClick={check} disabled={Boolean(busy)}>
            다시 확인
          </button>
        </>
      )}
    </section>
  )
}

/* ------------------------------- 팀별 목표 배분 ------------------------------- */

/** 전사 연 목표를 팀에 나눠준다. 합계가 전사 목표와 맞는지 항상 보여준다. */
function TeamAllocation({ teams, groups, targets, teamTargets, setTeamTargets, notify }) {
  const year = yearKey()
  const companyTarget = Number(targets[year]) || 0
  const saved = useMemo(() => (teamTargets && teamTargets[year]) || {}, [teamTargets, year])
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)

  const current = useMemo(() => {
    if (draft) return draft
    const out = {}
    for (const t of teams) out[t.id] = saved[t.id] ? formatAmountInput(saved[t.id]) : ''
    return out
  }, [draft, teams, saved])

  const parsed = useMemo(() => {
    const out = {}
    for (const [id, v] of Object.entries(current)) {
      out[id] = Number(String(v).replace(/[^0-9]/g, '')) || 0
    }
    return out
  }, [current])

  const rows = useMemo(() => teamProgress(groups, parsed), [groups, parsed])
  const summary = useMemo(
    () => teamAllocationSummary(teams, parsed, companyTarget),
    [teams, parsed, companyTarget],
  )

  const splitEvenly = () => {
    if (!companyTarget || teams.length === 0) return
    const each = Math.floor(companyTarget / teams.length)
    const next = {}
    teams.forEach((t, i) => {
      // 나머지는 첫 팀이 떠안는다 — 합계가 목표와 정확히 맞아야 하므로.
      next[t.id] = formatAmountInput(i === 0 ? companyTarget - each * (teams.length - 1) : each)
    })
    setDraft(next)
  }

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await setTeamTargets(year, parsed)
      notify(`${yearLabel(year)} 팀별 목표를 저장했습니다.`)
      setDraft(null)
    } finally { setBusy(false) }
  }

  if (teams.length === 0) return null

  return (
    <section className="panel">
      <h3>팀별 목표 배분 · {yearLabel(year)}</h3>
      {companyTarget === 0 && (
        <p className="hint">먼저 위에서 <b>연 매출목표</b>를 정하면 배분 잔액을 계산해 드립니다.</p>
      )}

      <form onSubmit={save}>
        <div className="alloc-list">
          {rows.filter((r) => !r.missing).map((r) => (
            <div className="alloc-row team-alloc-row" key={r.team.id}>
              <div className="alloc-who">
                <b>{r.team.name}</b>
                <small>{r.totals.memberCount}명</small>
              </div>
              <div className="alloc-input">
                <input
                  value={current[r.team.id] ?? ''}
                  onChange={(e) => setDraft({ ...current, [r.team.id]: formatAmountInput(e.target.value) })}
                  placeholder="0"
                  inputMode="numeric"
                  aria-label={`${r.team.name} 목표 금액`}
                />
                <small>{r.target > 0 ? compactWon(r.target) : '미배분'}</small>
              </div>
              <div className="alloc-actual">
                <b>{compactWon(r.totals.yearWonAmount)}</b>
                <small>
                  {r.progress != null ? `달성 ${r.progress}%` : `${r.totals.yearWonCount}건 수주`}
                </small>
              </div>
            </div>
          ))}
        </div>

        <div className={`alloc-total${summary.unallocated === 0 ? ' ok' : ''}`}>
          <span>
            배분 합계 <b>{compactWon(summary.allocated)}</b>
            {companyTarget > 0 && <> / 전사 목표 {compactWon(companyTarget)}</>}
          </span>
          {companyTarget > 0 && (
            <span className={summary.unallocated < 0 ? 'over' : ''}>
              {summary.unallocated === 0
                ? '정확히 맞음'
                : summary.unallocated > 0
                  ? `미배분 ${compactWon(summary.unallocated)}`
                  : `초과 ${compactWon(-summary.unallocated)}`}
            </span>
          )}
        </div>
        {summary.orphan > 0 && (
          <small className="hint">
            지워진 팀에 {compactWon(summary.orphan)} 이 배분돼 있습니다(합계에 포함).
          </small>
        )}

        <div className="alloc-actions">
          <button type="button" onClick={splitEvenly} disabled={!companyTarget}>균등 배분</button>
          {draft && <button type="button" onClick={() => setDraft(null)}>되돌리기</button>}
          <button type="submit" className="primary" disabled={busy}>배분 저장</button>
        </div>
      </form>
    </section>
  )
}

/* ------------------------------- 팀 목표(수주액) ------------------------------- */

function TeamTarget({ deals, targets, setYearlyTarget, notify }) {
  const [year, setYear] = useState(yearKey())
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)

  const years = useMemo(() => yearsWithData(deals), [deals])
  const target = Number(targets[year]) || 0
  const won = useMemo(() => yearlyWon(deals, year), [deals, year])
  const progress = targetProgress(won.amount, target)
  const series = useMemo(() => monthlySeries(deals, year), [deals, year])
  const maxMonth = Math.max(1, ...series.map((m) => m.amount))
  const remain = Math.max(0, target - won.amount)
  const typed = Number(String(amount).replace(/[^0-9]/g, '')) || 0
  const isThisYear = year === yearKey()

  const save = async (e) => {
    e.preventDefault()
    if (String(amount).trim() === '') { notify('금액을 입력해주세요.'); return }
    setBusy(true)
    try {
      await setYearlyTarget(year, typed)
      notify(`${yearLabel(year)} 목표를 ${compactWon(typed)} 로 저장했습니다.`)
      setAmount('')
    } finally { setBusy(false) }
  }

  return (
    <section className="panel">
      <h3>연 매출목표</h3>
      <form onSubmit={save} className="form">
        <div className="grid2">
          <label className="field"><span>연도</span>
            <select value={year} onChange={(e) => setYear(e.target.value)}>
              {years.map((y) => <option key={y} value={y}>{yearLabel(y)}</option>)}
            </select>
          </label>
          <label className="field"><span>연 목표 수주액(원)</span>
            <input
              value={amount}
              onChange={(e) => setAmount(formatAmountInput(e.target.value))}
              placeholder={target ? formatAmountInput(target) : '3,000,000,000'}
              inputMode="numeric"
            />
            <small className={`amount-preview${typed ? '' : ' zero'}`}>
              {String(amount).trim() === '' ? '숫자만 입력하세요' : wonWithCompact(typed)}
            </small>
          </label>
        </div>
        <button type="submit" className="primary block" disabled={busy}>목표 저장</button>
      </form>

      {/* 연 목표 대비 현재 위치 */}
      <div className="year-summary">
        <div className="ys-top">
          <span>{yearLabel(year)} 누적 수주 <b>{compactWon(won.amount)}</b> · {won.count}건</span>
          <span>
            목표 <b>{target ? compactWon(target) : '미설정'}</b>
            {progress != null && <b className="pct"> {progress}%</b>}
          </span>
        </div>
        {target > 0 && (
          <>
            <div className="goal-bar"><span style={{ width: `${Math.min(100, progress)}%` }} /></div>
            <div className="ys-foot">
              {remain > 0
                ? `남은 ${compactWon(remain)}${isThisYear ? ` · ${daysLeftInYear()}일 남음` : ''}`
                : '목표 달성'}
            </div>
          </>
        )}
      </div>

      {/* 1~12월 실적 — 연 목표가 어떻게 쌓이는지 */}
      <div className="month-grid">
        {series.map((m) => (
          <div className={`mg-cell${m.amount > 0 ? ' has' : ''}`} key={m.month}>
            <span className="mg-month">{m.monthNo}월</span>
            <div className="mg-bar">
              <span style={{ height: `${(m.amount / maxMonth) * 100}%` }} />
            </div>
            <span className="mg-amount">{m.amount > 0 ? compactWon(m.amount) : '—'}</span>
            <span className="mg-count">{m.count > 0 ? `${m.count}건` : ''}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ------------------------------ 영업자별 목표 할당 ------------------------------ */

/**
 * 팀 목표를 그 팀 영업자에게 나눠준다.
 *
 * 대상은 '팀에 속한 사람' 전부다 — 아직 데이터를 하나도 안 만든 사람도 포함된다.
 * 예전에는 데이터를 만든 사람만 목록에 나와서, 새로 합류한 영업자에게는
 * 목표를 미리 줄 수가 없었다.
 */
function OwnerAllocation({ groups, teamTargets, ownerTargets, setOwnerTargets, notify }) {
  const year = yearKey()
  const saved = useMemo(() => (ownerTargets && ownerTargets[year]) || {}, [ownerTargets, year])
  const teamTargetOf = useMemo(() => (teamTargets && teamTargets[year]) || {}, [teamTargets, year])

  // 입력 중인 값. 저장 전까지는 화면에서만 들고 있는다.
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)

  // 팀에 속한 사람 전체(팀 구분 없이 한 판에 저장한다 — 저장 단위가 연도별 한 문서라서).
  const everyone = useMemo(
    () => groups.flatMap((g) => g.members).filter((m) => m.email),
    [groups],
  )

  const current = useMemo(() => {
    if (draft) return draft
    const out = {}
    for (const m of everyone) out[m.email] = saved[m.email] ? formatAmountInput(saved[m.email]) : ''
    return out
  }, [draft, everyone, saved])

  const parsed = useMemo(() => {
    const out = {}
    for (const [email, v] of Object.entries(current)) {
      out[email] = Number(String(v).replace(/[^0-9]/g, '')) || 0
    }
    return out
  }, [current])

  const set = (email) => (e) => setDraft({
    ...current,
    [email]: formatAmountInput(e.target.value),
  })

  // 팀 목표를 그 팀 인원수로 똑같이 나눠 채운다. 손으로 계산하지 않게.
  const splitTeam = (group) => {
    const target = Number(teamTargetOf[group.team.id]) || 0
    const list = group.members.filter((m) => m.email)
    if (!target || list.length === 0) return
    const each = Math.floor(target / list.length)
    const next = { ...current }
    list.forEach((m, i) => {
      // 나머지는 첫 사람이 떠안는다 — 합계가 팀 목표와 정확히 맞아야 하므로.
      next[m.email] = formatAmountInput(i === 0 ? target - each * (list.length - 1) : each)
    })
    setDraft(next)
  }

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      // 목록 밖 계정에 남아 있던 할당까지 함께 넘겨야 조용히 지워지지 않는다.
      const merged = { ...saved, ...parsed }
      await setOwnerTargets(year, merged)
      notify(`${yearLabel(year)} 영업자별 목표를 저장했습니다.`)
      setDraft(null)
    } finally { setBusy(false) }
  }

  if (everyone.length === 0) return null

  return (
    <section className="panel">
      <h3>영업자별 목표 할당 · {yearLabel(year)}</h3>

      <form onSubmit={save}>
        {groups.map((g) => {
          const list = g.members.filter((m) => m.email)
          if (list.length === 0) return null
          const teamTarget = Number(teamTargetOf[g.team.id]) || 0
          const summary = allocationSummary(list, parsed, teamTarget)
          return (
            <div className="alloc-team" key={g.team.id}>
              <div className="tg-head">
                <b>{g.team.name}</b>
                <small>
                  {teamTarget > 0 ? `팀 목표 ${compactWon(teamTarget)}` : '팀 목표 미배분'}
                </small>
                <div className="spacer" />
                <button
                  type="button"
                  className="ghost sm"
                  onClick={() => splitTeam(g)}
                  disabled={!teamTarget}
                >균등 배분</button>
              </div>

              <div className="alloc-list">
                {summary.rows.map((r) => (
                  <div className="alloc-row" key={r.key}>
                    <span className="avatar">{initial(r.name)}</span>
                    <div className="alloc-who" title={r.email}>
                      <b>{r.name}</b>
                    </div>
                    <div className="alloc-input">
                      <input
                        value={current[r.email] ?? ''}
                        onChange={set(r.email)}
                        placeholder="0"
                        inputMode="numeric"
                        aria-label={`${r.name} 목표 금액`}
                      />
                      <small>{r.target > 0 ? compactWon(r.target) : '미할당'}</small>
                    </div>
                    <div className="alloc-actual">
                      <b>{compactWon(r.yearWonAmount)}</b>
                      <small>
                        {r.progress != null ? `달성 ${r.progress}%` : `${r.yearWonCount}건 수주`}
                      </small>
                    </div>
                  </div>
                ))}
              </div>

              <div className={`alloc-total${teamTarget > 0 && summary.unallocated === 0 ? ' ok' : ''}`}>
                <span>
                  할당 합계 <b>{compactWon(summary.allocated)}</b>
                  {teamTarget > 0 && <> / 팀 목표 {compactWon(teamTarget)}</>}
                </span>
                {teamTarget > 0 && (
                  <span className={summary.unallocated < 0 ? 'over' : ''}>
                    {summary.unallocated === 0
                      ? '정확히 맞음'
                      : summary.unallocated > 0
                        ? `미할당 ${compactWon(summary.unallocated)}`
                        : `초과 ${compactWon(-summary.unallocated)}`}
                  </span>
                )}
              </div>
            </div>
          )
        })}

        <div className="alloc-actions">
          {draft && <button type="button" onClick={() => setDraft(null)}>되돌리기</button>}
          <button type="submit" className="primary" disabled={busy}>할당 저장</button>
        </div>
      </form>
    </section>
  )
}

/* --------------------------------- 관리자 명단 --------------------------------- */

function AdminRoster({ admins, rows, user, setAdmins, notify }) {
  const [pick, setPick] = useState('')
  const [busy, setBusy] = useState(false)

  // 코드에 박힌 기본 관리자는 항상 위에, 지울 수 없는 항목으로 보여준다.
  const roster = useMemo(() => {
    const extra = (admins || []).map(normalizeEmail).filter((e) => !isBootstrapAdmin(e))
    return [
      ...BOOTSTRAP_ADMINS.map((e) => ({ email: e, fixed: true })),
      ...[...new Set(extra)].map((e) => ({ email: e, fixed: false })),
    ]
  }, [admins])

  // 이름으로 찾기 위한 색인. 명단에 없는 관리자(코드에 박힌 계정 등)는 이메일만 보여준다.
  const nameOf = useMemo(() => {
    const m = new Map()
    for (const r of rows || []) if (r.email) m.set(r.email, r.name)
    return m
  }, [rows])

  // 아직 관리자가 아닌 사람만 고를 수 있게 한다.
  // 이메일을 손으로 받아 적던 방식은 오타 한 글자로 조용히 실패했다 —
  // 로그인한 적 있는 계정 중에서만 고르면 그런 일이 없다.
  const candidates = useMemo(() => {
    const taken = new Set(roster.map((r) => r.email))
    return (rows || [])
      .filter((r) => r.email && r.registered && !taken.has(r.email))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }, [rows, roster])

  const add = async (e) => {
    e.preventDefault()
    const next = normalizeEmail(pick)
    if (!looksLikeEmail(next)) { notify('추가할 사람을 골라주세요.'); return }
    if (roster.some((r) => r.email === next)) { notify('이미 관리자입니다.'); return }
    setBusy(true)
    try {
      await setAdmins([...(admins || []), next])
      notify(`${nameOf.get(next) || next} 을(를) 관리자로 추가했습니다.`)
      setPick('')
    } finally { setBusy(false) }
  }

  const remove = async (target) => {
    const who = nameOf.get(target) || target
    if (!window.confirm(`${who} 의 관리자 권한을 해제할까요?`)) return
    await setAdmins((admins || []).filter((e) => normalizeEmail(e) !== target))
    notify('관리자 권한을 해제했습니다.')
  }

  return (
    <section className="panel">
      <h3>관리자 명단</h3>
      <div className="admin-list">
        {roster.map((r) => (
          <div className="admin-row" key={r.email}>
            <span className="admin-who">
              <span className="avatar sm">{initial(nameOf.get(r.email) || r.email)}</span>
              {/* 이름을 앞세우고 계정은 tooltip 으로만 — 화면에는 이름만 남긴다. */}
              <b title={r.email}>{nameOf.get(r.email) || r.email}</b>
            </span>
            {r.fixed
              ? <span className="tag">기본 · 해제 불가</span>
              : r.email === normalizeEmail(user.email)
                ? <span className="tag">본인</span>
                : <button type="button" className="danger ghost sm" onClick={() => remove(r.email)}>해제</button>}
          </div>
        ))}
      </div>

      {candidates.length === 0 ? (
        <p className="empty sm">추가할 수 있는 사람이 없습니다. 로그인한 적 있는 계정만 고를 수 있습니다.</p>
      ) : (
        <form onSubmit={add} className="admin-add">
          <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="관리자로 추가할 사람">
            <option value="">추가할 사람 선택…</option>
            {candidates.map((c) => (
              <option key={c.key} value={c.email}>{c.name}</option>
            ))}
          </select>
          <button type="submit" className="primary" disabled={busy || !pick}>추가</button>
        </form>
      )}

      <small className="hint">
        <b>관리자</b>는 전사 데이터를 보고 팀 편성·목표를 정합니다.
        <b>팀장</b>은 자기 팀 데이터를 모두 고칠 수 있고 활동에 피드백을 남깁니다(위 팀 편성에서 지정).
        <b>팀원</b>은 자기 팀 데이터를 보고 자기가 만든 것만 고칩니다.
        <br />
        기본 관리자는 코드에 박혀 있어 화면에서 해제할 수 없습니다 — 명단을 잘못 비워
        아무도 들어오지 못하는 상황을 막기 위한 장치입니다.
      </small>
    </section>
  )
}

/* -------------------------------- 데이터 내보내기 -------------------------------- */

const CUSTOMER_COLS = [
  { key: 'name', label: '거래처명' },
  { key: 'industry', label: '업종' },
  { label: '등급', value: (c) => getGrade(c.grade).label },
  { key: 'contactName', label: '담당자' },
  { key: 'phone', label: '연락처' },
  { key: 'email', label: '이메일' },
  { key: 'ownerName', label: '영업담당' },
  { key: 'memo', label: '메모' },
]

const DEAL_COLS = [
  { key: 'title', label: '제목' },
  { key: 'customerName', label: '거래처' },
  { key: 'serviceName', label: '대상 서비스' },
  { label: '단계', value: (d) => getStage(d.stage).label },
  { label: '상태', value: (d) => (d.lost ? '실패' : d.stage === 'won' ? '수주' : '진행중') },
  { key: 'lostReason', label: '실패 회고' },
  { key: 'amount', label: '금액(원)' },
  { key: 'expectedClose', label: '예상 마감일' },
  { key: 'closedDate', label: '종료일' },
  { key: 'ownerName', label: '영업담당' },
  { key: 'ownerEmail', label: '담당 이메일' },
  { key: 'memo', label: '메모' },
]

const ACTIVITY_COLS = [
  { key: 'date', label: '일자' },
  { label: '종류', value: (a) => getActivityType(a.type).label },
  { key: 'customerName', label: '거래처' },
  { key: 'ownerName', label: '작성자' },
  { key: 'note', label: '내용' },
]

function ExportPanel({ deals, customers, activities, notify }) {
  const save = (name, rows, cols) => {
    if (!rows.length) { notify('내보낼 데이터가 없습니다.'); return }
    downloadCsv(`${name}-${monthKey()}.csv`, toCsv(rows, cols))
    notify(`${rows.length}건을 내려받았습니다.`)
  }

  return (
    <section className="panel">
      <h3>데이터 내보내기</h3>
      <div className="export-row">
        <button type="button" onClick={() => save('거래처', customers, CUSTOMER_COLS)}>
          거래처 {customers.length}건
        </button>
        <button type="button" onClick={() => save('영업기회', deals, DEAL_COLS)}>
          영업기회 {deals.length}건
        </button>
        <button type="button" onClick={() => save('영업활동', activities, ACTIVITY_COLS)}>
          영업활동 {activities.length}건
        </button>
      </div>
      <small className="hint">엑셀에서 바로 열리도록 UTF-8 BOM 을 붙인 CSV 로 받습니다.</small>
    </section>
  )
}
