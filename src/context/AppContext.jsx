import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  addActivity,
  addCustomer,
  addDeal,
  assignMissingTeam,
  countMissingTeam,
  ensureDefaultTeam,
  isFirebaseConfigured,
  onAuthChange,
  registerMember,
  removeActivity,
  removeCustomer,
  removeDeal,
  removeInvite,
  removeMember,
  setAdmins,
  setInvite,
  sendInviteEmail,
  setMemberRole,
  setMemberTeam,
  setOwnerTargets,
  setServices,
  setTeamTargets,
  setTeams,
  setYearlyTarget,
  signInWithGoogle,
  signOutUser,
  subscribeActivities,
  subscribeAdmins,
  subscribeAuditLogs,
  subscribeCustomers,
  subscribeDeals,
  subscribeInvites,
  subscribeMembers,
  subscribeOwnerTargets,
  subscribeServices,
  subscribeTargets,
  subscribeTeamTargets,
  subscribeTeams,
  updateActivity,
  updateCustomer,
  updateDeal,
  writeAudit,
} from '../lib/store.js'
import { isAdminEmail } from '../lib/accounts.js'
import {
  canUseData,
  defaultTeamId as getDefaultTeamId,
  myRole as findMyRole,
  myTeamId as findMyTeam,
} from '../lib/teams.js'
import { ACTIONS } from '../lib/audit.js'
import { normalizeEmail } from '../lib/accounts.js'
import { Ctx, useApp } from './ctx.js'

// 기존 import 경로를 유지하기 위해 다시 내보낸다.
export { useApp }

function readError(err) {
  if (err?.code === 'permission-denied') return '권한이 없어 데이터를 읽지 못했습니다.'
  // 팀별 격리를 켠 뒤 처음 겪는 오류는 대개 인덱스가 없어서다.
  // 원문에 콘솔 링크가 들어 있어 그대로 보여주는 게 가장 빠른 안내다.
  if (err?.code === 'failed-precondition') {
    return `색인이 필요합니다. firestore.indexes.json 을 배포해주세요. (${err.message})`
  }
  return err?.message || '데이터를 불러오지 못했습니다.'
}

export function AppProvider({ children }) {
  const [authUser, setAuthUser] = useState(null)
  const [authReady, setAuthReady] = useState(false)

  // 설정·명단 — 팀과 무관하게 로그인만 하면 읽는다.
  const [admins, setAdminList] = useState([])
  const [invites, setInviteList] = useState([])
  const [members, setMembers] = useState([])
  const [teams, setTeamList] = useState([])
  const [services, setServiceList] = useState([])
  const [targets, setTargets] = useState({})
  const [teamTargets, setTeamTargetMap] = useState({})
  const [ownerTargets, setOwnerTargetMap] = useState({})

  // 업무 데이터 — 거래처·영업현황은 전사 공유, 활동은 팀 범위다.
  const [customers, setCustomers] = useState([])
  const [deals, setDeals] = useState([])
  const [activities, setActivities] = useState([])

  const [auditLogs, setAuditLogs] = useState([])
  const [dataError, setDataError] = useState('')
  const [toast, setToast] = useState('')
  const [retry, setRetry] = useState(0)
  // 구독별 최신 오류. Firestore 는 오류가 나면 리스너를 떼어버리므로
  // 어느 구독이 죽었는지 따로 기억했다가 재구독으로 되살린다.
  const errorsRef = useRef({})
  const legacyMigrationRef = useRef('')

  const sync = useCallback(() => {
    const first = Object.values(errorsRef.current).find(Boolean)
    setDataError(first || '')
  }, [])

  const onErr = useCallback((key) => (e) => {
    errorsRef.current[key] = readError(e)
    sync()
  }, [sync])

  const onData = useCallback((key, setter) => (rows) => {
    if (errorsRef.current[key]) { delete errorsRef.current[key]; sync() }
    setter(rows)
  }, [sync])

  useEffect(() => onAuthChange((u) => {
    setAuthUser(u)
    setAuthReady(true)
    if (!u) {
      setCustomers([])
      setDeals([])
      setActivities([])
      setTargets({})
      setTeamTargetMap({})
      setOwnerTargetMap({})
      setAdminList([])
      setInviteList([])
      setMembers([])
      setTeamList([])
      setServiceList([])
      setAuditLogs([])
    }
  }), [])

  // 로그인하면 본인을 팀원 명단에 올린다.
  // 이게 있어야 관리자가 '로그인한 적 있는 사람'을 목록에서 보고 팀에 넣을 수 있다.
  useEffect(() => {
    if (!authUser || !authUser.known) return
    registerMember(authUser)
  }, [authUser])

  const isAdmin = useMemo(
    () => Boolean(authUser && isAdminEmail(authUser.email, admins)),
    [authUser, admins],
  )

  // 내 팀. 명단 스냅샷에서 온다 — 관리자가 팀을 바꾸면 자동으로 따라온다.
  const teamId = useMemo(
    () => findMyTeam(members, authUser?.uid),
    [members, authUser],
  )

  // 팀장/팀원. 관리자는 이 값과 별개다 — 관리자는 팀 소속과 무관하게 전사를 본다.
  const role = useMemo(
    () => findMyRole(members, authUser?.uid),
    [members, authUser],
  )

  const user = useMemo(() => {
    if (!authUser) return null
    return { ...authUser, isAdmin, teamId, role }
  }, [authUser, isAdmin, teamId, role])

  // 1단계 — 설정과 명단. 팀 배정 여부와 무관하게 필요하다
  // (팀이 없는 사람에게 '배정 대기중' 화면을 보여줘야 하므로).
  // 의존성은 authUser 다. 파생값인 user 를 쓰면 스냅샷 → user 변경 → 재구독으로
  // 무한히 다시 구독하게 된다.
  useEffect(() => {
    if (!authUser || !authUser.known) return undefined
    errorsRef.current = {}
    setDataError('')

    const unsubs = [
      subscribeAdmins(onData('admins', setAdminList), onErr('admins')),
      subscribeMembers(onData('members', setMembers), onErr('members')),
      subscribeTeams(onData('teams', setTeamList), onErr('teams')),
      subscribeServices(onData('services', setServiceList), onErr('services')),
      subscribeTargets(onData('targets', setTargets), onErr('targets')),
      subscribeTeamTargets(onData('teamTargets', setTeamTargetMap), onErr('teamTargets')),
      subscribeOwnerTargets(onData('ownerTargets', setOwnerTargetMap), onErr('ownerTargets')),
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [authUser, retry, onData, onErr])

  // 팀 격리 도입 전 데이터는 teamId 가 없다. 관리자가 접속하면 기본 팀인 배지터로
  // 한 번 이관해 전체 수치와 배지터 수치가 같은 기준으로 집계되게 한다.
  useEffect(() => {
    if (!authUser || !isAdmin || teams.length === 0) return
    const baejiterId = getDefaultTeamId(teams)
    if (!baejiterId) return
    const key = `${authUser.uid}:${baejiterId}`
    if (legacyMigrationRef.current === key) return
    legacyMigrationRef.current = key

    const migrate = async () => {
      try {
        await ensureDefaultTeam(teams)
        let total = 0
        for (const name of ['deals', 'customers', 'activities']) {
          total += await assignMissingTeam(name, baejiterId)
        }
        if (total > 0) {
          setToast(`기존 데이터 ${total}건을 배지터 팀에 반영했습니다.`)
          writeAudit(user, ACTIONS.DATA_MIGRATE, {
            targetLabel: '기존 데이터 자동 이관',
            to: '배지터',
            note: `${total}건`,
          })
        }
      } catch (err) {
        legacyMigrationRef.current = ''
        console.warn('배지터 기본 팀 설정·데이터 이관 실패', err)
      }
    }
    migrate()
  }, [authUser, isAdmin, teams, user])

  // 2단계 — 업무 데이터. 내 팀이 정해진 뒤에 구독한다.
  // 팀이 바뀌면 활동 구독을 다시 열어 남의 팀 활동이 남지 않게 한다.
  useEffect(() => {
    if (!authUser || !authUser.known) return undefined
    if (!canUseData(isAdmin, teamId)) {
      setCustomers([])
      setDeals([])
      setActivities([])
      return undefined
    }
    const scope = { isAdmin, teamId }
    const unsubs = [
      // 거래처·영업현황은 전사 공유, 활동은 자기 팀만 본다.
      subscribeCustomers(undefined, onData('customers', setCustomers), onErr('customers')),
      subscribeDeals(undefined, onData('deals', setDeals), onErr('deals')),
      subscribeActivities(scope, onData('activities', setActivities), onErr('activities')),
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [authUser, isAdmin, teamId, retry, onData, onErr])

  // 감사 로그는 관리자만 읽는다. 팀원이 구독하면 규칙에 막혀 오류 띠가 뜬다.
  useEffect(() => {
    if (!authUser || !authUser.known || !isAdmin) {
      setAuditLogs([])
      return undefined
    }
    return subscribeAuditLogs(300, onData('audit', setAuditLogs), onErr('audit'))
  }, [authUser, isAdmin, retry, onData, onErr])

  // 이메일 초대 목록에는 개인정보가 있으므로 관리자만 목록 구독을 연다.
  useEffect(() => {
    if (!authUser || !authUser.known || !isAdmin) {
      setInviteList([])
      return undefined
    }
    return subscribeInvites(onData('invites', setInviteList), onErr('invites'))
  }, [authUser, isAdmin, retry, onData, onErr])

  const retryData = useCallback(() => setRetry((n) => n + 1), [])

  useEffect(() => {
    if (!toast) return undefined
    const id = setTimeout(() => setToast(''), 1900)
    return () => clearTimeout(id)
  }, [toast])

  const notify = useCallback((msg) => setToast(msg), [])

  const login = useCallback(async () => {
    // onAuthChange 가 authUser 를 갱신하므로 여기서 따로 세팅하지 않는다.
    return signInWithGoogle()
  }, [])

  const logout = useCallback(async () => {
    await signOutUser()
  }, [])

  // ----- 쓰기 액션 -----
  // 담당자 uid·teamId 를 자동으로 붙이고, 되돌리기 어려운 작업은 감사 로그를 남긴다.
  // 로그는 기다리지 않는다 — 기록이 늦거나 실패해도 본 작업은 이미 끝나 있어야 한다.
  const actions = useMemo(() => {
    const log = (action, payload) => { writeAudit(user, action, payload) }
    const nameOfMember = (uid) => members.find((m) => m.uid === uid)?.name || uid
    const nameOfTeamId = (id) => (id ? (teams.find((t) => t.id === id)?.name || id) : '미배정')

    return {
      addCustomer: (data) => addCustomer(user, data),
      updateCustomer,
      removeCustomer: async (id) => {
        const target = customers.find((c) => c.id === id)
        await removeCustomer(id)
        log(ACTIONS.CUSTOMER_REMOVE, { targetId: id, targetLabel: target?.name || id })
      },
      addDeal: (data) => addDeal(user, data),
      updateDeal,
      removeDeal: async (id) => {
        const target = deals.find((d) => d.id === id)
        await removeDeal(id)
        log(ACTIONS.DEAL_REMOVE, {
          targetId: id,
          targetLabel: target?.title || id,
          note: target ? `${target.customerName || '거래처 미지정'} · ${target.amount || 0}원` : '',
        })
      },
      addActivity: (data) => addActivity(user, data),
      updateActivity,
      removeActivity: async (id) => {
        const target = activities.find((a) => a.id === id)
        await removeActivity(id)
        log(ACTIONS.ACTIVITY_REMOVE, {
          targetId: id,
          targetLabel: target?.customerName || target?.date || id,
        })
      },

      // 입금은 딜 문서 안에 있지만 '돈' 이라 따로 남긴다.
      recordPayment: async (deal, payments, added) => {
        await updateDeal(deal.id, { payments })
        log(ACTIONS.PAYMENT_ADD, {
          targetId: deal.id,
          targetLabel: deal.title,
          to: `${added.amount}원`,
          note: added.memo || '',
        })
      },
      deletePayment: async (deal, payments, removed) => {
        await updateDeal(deal.id, { payments })
        log(ACTIONS.PAYMENT_REMOVE, {
          targetId: deal.id,
          targetLabel: deal.title,
          from: `${removed.amount}원`,
          note: removed.memo || '',
        })
      },

      setYearlyTarget: async (year, amount) => {
        const before = Number(targets[year]) || 0
        await setYearlyTarget(year, amount)
        log(ACTIONS.TARGET_COMPANY, { targetLabel: `${year}년`, from: before, to: amount })
      },
      setTeamTargets: async (year, allocation) => {
        await setTeamTargets(year, allocation)
        log(ACTIONS.TARGET_TEAM, { targetLabel: `${year}년`, note: `${Object.keys(allocation || {}).length}개 팀` })
      },
      setOwnerTargets: async (year, allocation) => {
        await setOwnerTargets(year, allocation)
        log(ACTIONS.TARGET_OWNER, { targetLabel: `${year}년`, note: `${Object.keys(allocation || {}).length}명` })
      },

      setAdmins: async (emails) => {
        const before = new Set((admins || []).map(normalizeEmail))
        const after = new Set((emails || []).map(normalizeEmail))
        await setAdmins(emails)
        for (const e of after) if (!before.has(e)) log(ACTIONS.ADMIN_ADD, { targetLabel: e })
        for (const e of before) if (!after.has(e)) log(ACTIONS.ADMIN_REMOVE, { targetLabel: e })
      },

      setInvite: async (email, teamId) => {
        await setInvite(user, email, teamId)
        log(ACTIONS.MEMBER_INVITE, {
          targetLabel: normalizeEmail(email),
          to: nameOfTeamId(teamId),
        })
      },
      sendInviteEmail,
      removeInvite: async (email) => {
        await removeInvite(email)
        log(ACTIONS.MEMBER_INVITE_REMOVE, { targetLabel: normalizeEmail(email) })
      },

      setServices,

      setTeams: async (items) => {
        const before = new Map(teams.map((t) => [t.id, t.name]))
        const after = new Map((items || []).map((t) => [t.id, t.name]))
        await setTeams(items)
        for (const [id, name] of after) {
          if (!before.has(id)) log(ACTIONS.TEAM_CREATE, { targetId: id, targetLabel: name })
          else if (before.get(id) !== name) {
            log(ACTIONS.TEAM_RENAME, { targetId: id, from: before.get(id), to: name })
          }
        }
        for (const [id, name] of before) {
          if (!after.has(id)) log(ACTIONS.TEAM_REMOVE, { targetId: id, targetLabel: name })
        }
      },

      setMemberTeam: async (uid, teamId) => {
        const before = members.find((m) => m.uid === uid)?.teamId || ''
        await setMemberTeam(uid, teamId)
        log(ACTIONS.MEMBER_TEAM, {
          targetId: uid,
          targetLabel: nameOfMember(uid),
          from: nameOfTeamId(before),
          to: nameOfTeamId(teamId),
        })
      },
      setMemberRole: async (uid, role) => {
        const before = members.find((m) => m.uid === uid)?.role || 'member'
        await setMemberRole(uid, role)
        log(ACTIONS.MEMBER_ROLE, {
          targetId: uid,
          targetLabel: nameOfMember(uid),
          from: before === 'leader' ? '팀장' : '팀원',
          to: role === 'leader' ? '팀장' : '팀원',
        })
      },
      removeMember: async (uid) => {
        const name = nameOfMember(uid)
        await removeMember(uid)
        log(ACTIONS.MEMBER_REMOVE, { targetId: uid, targetLabel: name })
      },

      assignMissingTeam: async (name, teamId, onProgress) => {
        const total = await assignMissingTeam(name, teamId, onProgress)
        log(ACTIONS.DATA_MIGRATE, {
          targetLabel: name,
          to: nameOfTeamId(teamId),
          note: `${total}건`,
        })
        return total
      },
      countMissingTeam,
    }
  }, [user, members, teams, admins, customers, deals, activities, targets])

  const value = useMemo(() => ({
    user,
    authReady,
    isFirebaseConfigured,
    customers,
    deals,
    activities,
    targets,
    teamTargets,
    ownerTargets,
    admins,
    invites,
    members,
    teams,
    services,
    auditLogs,
    // 팀에 배정되지 않아 아직 아무 데이터도 볼 수 없는 상태인가.
    needsTeam: Boolean(user && !canUseData(user.isAdmin, user.teamId)),
    // 데이터를 만들 수 있는가. 보안 규칙이 '내 팀으로만 만들 수 있다' 를 강제하므로
    // 관리자라도 팀이 없으면 못 만든다 — 눌러야 거부당할 버튼은 미리 잠근다.
    canCreate: Boolean(user && user.teamId),
    dataError,
    retryData,
    toast,
    notify,
    login,
    logout,
    ...actions,
  }), [
    user, authReady, customers, deals, activities, targets, teamTargets, ownerTargets,
    admins, invites, members, teams, services, auditLogs,
    dataError, retryData, toast, notify, login, logout, actions,
  ])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
