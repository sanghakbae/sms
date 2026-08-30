// 데이터 계층 — 저장소는 Firestore, 인증은 Google OAuth 하나뿐이다.
// 거래처·영업기회·활동·목표를 모두 Firestore 에 저장한다.

import {
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithPopup,
  signInWithPopup,
  signOut,
} from 'firebase/auth'
import {
  addDoc,
  clearIndexedDbPersistence,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'

import { auth, collectionName, db, isFirebaseConfigured } from '../firebase.js'
import { isAdminEmail, isAllowedEmail, normalizeEmail, shortName } from './accounts.js'
import { sendChat, teamRequestText } from './notify.js'
import { ROLE_MEMBER, UNASSIGNED, defaultTeamId, normalizeTeams } from './teams.js'

export { isFirebaseConfigured }

function assertConfigured() {
  if (!isFirebaseConfigured) {
    throw new Error('Firebase 설정(.env)이 없습니다. VITE_FIREBASE_* 값을 채워주세요.')
  }
}

/* ----------------------------------- 인증 ------------------------------------ */

function toUser(fbUser) {
  const email = (fbUser.email || '').toLowerCase()
  return {
    uid: fbUser.uid,
    email,
    name: shortName(fbUser.displayName, email),
    photoURL: fbUser.photoURL || '',
    // 여기서는 코드에 박힌 기본 관리자만 알 수 있다.
    // Firestore 관리자 명단까지 반영한 최종 판정은 AppContext 가 한다.
    isAdmin: isAdminEmail(email),
    known: isAllowedEmail(email), // 허용 도메인/관리자만 true
  }
}

export function onAuthChange(callback) {
  if (!isFirebaseConfigured) {
    callback(null)
    return () => {}
  }
  return onAuthStateChanged(auth, (fbUser) => {
    callback(fbUser ? toUser(fbUser) : null)
  })
}

export async function signInWithGoogle() {
  assertConfigured()
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  const cred = await signInWithPopup(auth, provider)
  return toUser(cred.user)
}

export async function signOutUser() {
  if (!isFirebaseConfigured) return
  await signOut(auth)
  // 오프라인 캐시에는 거래처 연락처·딜 금액·메모가 그대로 남는다.
  // 공용 기기나 분실 기기에서 다음 사람이 열어보지 못하게 로그아웃 때 비운다.
  // 실패해도 로그아웃 자체는 이미 끝났으므로 막지 않는다.
  try {
    await clearIndexedDbPersistence(db)
  } catch (err) {
    // 다른 탭이 열려 있으면 지울 수 없다(failed-precondition). 그건 정상이다.
    if (err?.code !== 'failed-precondition') console.warn('로컬 캐시 정리 실패', err)
  }
}

/**
 * 현재 관리자의 Gmail 계정에서 팀 초대 메일을 바로 보낸다.
 *
 * 별도 유료 메일 서버나 공개 API 키를 두지 않는다. 최초 발송 때만 Google 이
 * gmail.send 권한을 확인하고, 이후 메일은 이 앱이 아니라 로그인한 관리자의
 * 주소에서 전송된다.
 */
export async function sendInviteEmail(to, teamName, inviteUrl = 'https://sms.sanghak.kr/') {
  assertConfigured()
  if (!auth.currentUser) throw new Error('다시 로그인한 뒤 초대해주세요.')

  const provider = new GoogleAuthProvider()
  provider.addScope('https://www.googleapis.com/auth/gmail.send')
  provider.setCustomParameters({
    login_hint: auth.currentUser.email || '',
    include_granted_scopes: 'true',
  })

  const result = await reauthenticateWithPopup(auth.currentUser, provider)
  const credential = GoogleAuthProvider.credentialFromResult(result)
  const token = credential?.accessToken
  if (!token) throw new Error('메일 발송 권한을 확인하지 못했습니다.')

  const subject = '[영업 관리] 팀 초대'
  const text = `${teamName} 팀으로 초대되었습니다.\n\nGoogle 계정으로 로그인해주세요.\n${inviteUrl}`
  const message = [
    `To: ${to}`,
    `Subject: =?UTF-8?B?${utf8Base64(subject)}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    utf8Base64(text),
  ].join('\r\n')

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: utf8Base64Url(message) }),
  })

  if (!response.ok) {
    const detail = await response.json().catch(() => null)
    const reason = detail?.error?.message || 'Gmail에서 메일을 보내지 못했습니다.'
    throw new Error(reason)
  }
}

function utf8Base64(value) {
  const bytes = new TextEncoder().encode(String(value))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function utf8Base64Url(value) {
  return utf8Base64(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

/** 로그인한 계정 앞으로 저장된 사전 팀 초대. */
export async function getInvite(email) {
  if (!isFirebaseConfigured) return null
  const key = normalizeEmail(email)
  if (!key) return null
  const snap = await getDoc(doc(db, collectionName('invites'), key))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

/* ---------------------------- 문서에 담당자 정보 붙이기 --------------------------- */

function ownerFields(user) {
  return { owner: user.uid, ownerName: user.name, ownerEmail: user.email }
}

/**
 * 문서가 어느 팀 것인지. 팀별 격리의 기준이라 생성할 때 반드시 박아야 한다.
 *
 * 보안 규칙은 필터가 아니다 — 팀원의 목록 쿼리는 where('teamId','==',내팀) 으로
 * 나가고, 이 필드가 없는 문서는 그 결과에 들어오지 않는다(관리자에게만 보인다).
 */
function teamFields(user) {
  return { teamId: user?.teamId || UNASSIGNED }
}

/* --------------------------------- 구독(읽기) --------------------------------- */

/**
 * scope = { isAdmin, teamId } — 팀원은 자기 팀 문서만 받는다.
 *
 * 규칙에만 기대면 안 된다. 보안 규칙은 '필터'가 아니라 '검사'라서,
 * 전체 컬렉션을 그냥 구독하면 남의 팀 문서 하나 때문에 쿼리가 통째로 거부된다.
 * 그래서 여기서 where 로 좁혀 보낸다. 규칙은 그 뒤를 받쳐주는 이중 잠금이다.
 */
function subscribeCollection(name, order, onData, onError, scope) {
  if (!isFirebaseConfigured) {
    onData([])
    return () => {}
  }
  const scoped = scope && !scope.isAdmin
  // 팀이 없는 일반 팀원은 볼 게 없다 — 빈 쿼리를 날리지 않고 바로 빈 목록을 준다.
  if (scoped && !scope.teamId) {
    onData([])
    return () => {}
  }
  const ref = collection(db, collectionName(name))
  const clauses = []
  if (scoped) clauses.push(where('teamId', '==', scope.teamId))
  if (order) clauses.push(orderBy(order.field, order.dir || 'desc'))
  const q = clauses.length ? query(ref, ...clauses) : ref
  return onSnapshot(
    q,
    (snap) => {
      // 오프라인이면 캐시에서 온다. 아직 서버에 못 올린 쓰기가 있으면
      // hasPendingWrites 가 참이다 — 화면이 '저장됨' 이라고 단정하지 않게 알린다.
      reportSync(name, {
        fromCache: snap.metadata.fromCache,
        pending: snap.docs.filter((d) => d.metadata.hasPendingWrites).length,
      })
      onData(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    },
    (err) => onError && onError(err),
  )
}

export function subscribeCustomers(scope, onData, onError) {
  return subscribeCollection('customers', { field: 'name', dir: 'asc' }, onData, onError, scope)
}

export function subscribeDeals(scope, onData, onError) {
  return subscribeCollection('deals', { field: 'updatedAt', dir: 'desc' }, onData, onError, scope)
}

export function subscribeActivities(scope, onData, onError) {
  return subscribeCollection('activities', { field: 'date', dir: 'desc' }, onData, onError, scope)
}

export function subscribeTargets(onData, onError) {
  if (!isFirebaseConfigured) {
    onData({})
    return () => {}
  }
  const ref = doc(db, collectionName('settings'), 'targets')
  return onSnapshot(
    ref,
    (snap) => onData(snap.exists() ? snap.data() : {}),
    (err) => onError && onError(err),
  )
}

/* ------------------------------- 동기화 상태 알림 ------------------------------- */
//
// 오프라인 캐시를 켜면 '저장했습니다' 가 거짓이 될 수 있다 — 로컬에만 쌓였을 뿐
// 서버에는 아직 못 갔기 때문이다. 컬렉션별 상태를 모아 화면이 알리게 한다.

const syncState = new Map()
const syncListeners = new Set()

function reportSync(name, info) {
  const prev = syncState.get(name)
  if (prev && prev.fromCache === info.fromCache && prev.pending === info.pending) return
  syncState.set(name, info)
  const merged = {
    fromCache: [...syncState.values()].some((v) => v.fromCache),
    pending: [...syncState.values()].reduce((sum, v) => sum + v.pending, 0),
  }
  for (const fn of syncListeners) fn(merged)
}

/** 동기화 상태 구독. { fromCache, pending } 를 받는다. */
export function onSyncState(fn) {
  syncListeners.add(fn)
  return () => syncListeners.delete(fn)
}

/* --------------------------------- 쓰기(CRUD) --------------------------------- */

export async function addCustomer(user, data) {
  assertConfigured()
  await addDoc(collection(db, collectionName('customers')), {
    ...data,
    ...ownerFields(user),
    ...teamFields(user),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function updateCustomer(id, data) {
  assertConfigured()
  await updateDoc(doc(db, collectionName('customers'), id), {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

export async function removeCustomer(id) {
  assertConfigured()
  await deleteDoc(doc(db, collectionName('customers'), id))
}

export async function addDeal(user, data) {
  assertConfigured()
  await addDoc(collection(db, collectionName('deals')), {
    ...data,
    amount: Number(data.amount) || 0,
    ...ownerFields(user),
    ...teamFields(user),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function updateDeal(id, data) {
  assertConfigured()
  const patch = { ...data, updatedAt: serverTimestamp() }
  if (patch.amount != null) patch.amount = Number(patch.amount) || 0
  await updateDoc(doc(db, collectionName('deals'), id), patch)
}

export async function removeDeal(id) {
  assertConfigured()
  await deleteDoc(doc(db, collectionName('deals'), id))
}

export async function addActivity(user, data) {
  assertConfigured()
  await addDoc(collection(db, collectionName('activities')), {
    ...data,
    ...ownerFields(user),
    ...teamFields(user),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

/** 활동 기록 수정. 작성자 본인·팀장·관리자만 (규칙에서 같이 막는다). */
export async function updateActivity(id, data) {
  assertConfigured()
  await updateDoc(doc(db, collectionName('activities'), id), {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

export async function removeActivity(id) {
  assertConfigured()
  await deleteDoc(doc(db, collectionName('activities'), id))
}

/** settings/targets 문서에 월별 목표를 병합 저장(팀장만). */
/** 관리자 명단(settings/admins). 문서가 없으면 빈 배열. */
export function subscribeAdmins(onData, onError) {
  if (!isFirebaseConfigured) {
    onData([])
    return () => {}
  }
  const ref = doc(db, collectionName('settings'), 'admins')
  return onSnapshot(
    ref,
    (snap) => onData(snap.exists() ? (snap.data().emails || []) : []),
    (err) => onError && onError(err),
  )
}

export async function setAdmins(emails) {
  assertConfigured()
  const clean = [...new Set((emails || []).map(normalizeEmail).filter(Boolean))]
  await setDoc(doc(db, collectionName('settings'), 'admins'), { emails: clean }, { merge: true })
}

/** 관리자용 이메일 초대 목록. */
export function subscribeInvites(onData, onError) {
  if (!isFirebaseConfigured) {
    onData([])
    return () => {}
  }
  return onSnapshot(
    collection(db, collectionName('invites')),
    (snap) => onData(snap.docs.map((entry) => ({ id: entry.id, ...entry.data() }))),
    (err) => onError && onError(err),
  )
}

export async function setInvite(user, email, teamId) {
  assertConfigured()
  const cleanEmail = normalizeEmail(email)
  const cleanTeamId = String(teamId || '').trim()
  if (!cleanEmail || !cleanTeamId) throw new Error('이메일과 팀을 모두 선택해주세요.')
  await setDoc(doc(db, collectionName('invites'), cleanEmail), {
    email: cleanEmail,
    teamId: cleanTeamId,
    invitedBy: user.uid,
    invitedByEmail: user.email,
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

export async function removeInvite(email) {
  assertConfigured()
  const cleanEmail = normalizeEmail(email)
  if (!cleanEmail) return
  await deleteDoc(doc(db, collectionName('invites'), cleanEmail))
}

/** 판매 대상 서비스 목록(settings/services). 문서가 없으면 빈 배열. */
export function subscribeServices(onData, onError) {
  if (!isFirebaseConfigured) {
    onData([])
    return () => {}
  }
  const ref = doc(db, collectionName('settings'), 'services')
  return onSnapshot(
    ref,
    (snap) => onData(snap.exists() ? (snap.data().items || []) : []),
    (err) => onError && onError(err),
  )
}

export async function setServices(items) {
  assertConfigured()
  const clean = (items || [])
    .map((it) => ({
      id: String(it.id || '').trim(),
      name: String(it.name || '').trim(),
    }))
    .filter((it) => it.id && it.name)
  await setDoc(doc(db, collectionName('settings'), 'services'), { items: clean }, { merge: true })
}

/** 영업자별 목표 할당(settings/ownerTargets). { 'YYYY': { 이메일: 금액 } } */
export function subscribeOwnerTargets(onData, onError) {
  if (!isFirebaseConfigured) {
    onData({})
    return () => {}
  }
  const ref = doc(db, collectionName('settings'), 'ownerTargets')
  return onSnapshot(
    ref,
    (snap) => onData(snap.exists() ? snap.data() : {}),
    (err) => onError && onError(err),
  )
}

export async function setOwnerTargets(year, allocation) {
  assertConfigured()
  const clean = {}
  for (const [email, amount] of Object.entries(allocation || {})) {
    const key = normalizeEmail(email)
    const value = Number(amount) || 0
    if (key && value > 0) clean[key] = value
  }
  // 그 해 전체를 통째로 덮어쓴다 — 0으로 지운 항목이 남지 않도록.
  await setDoc(
    doc(db, collectionName('settings'), 'ownerTargets'),
    { [String(year)]: clean },
    { merge: true },
  )
}

/** 연 매출목표. settings/targets 문서에 'YYYY' 키로 저장한다. */
/** 메뉴 접근 권한(settings/menuAccess). { 메뉴id: 'all'|'lead'|'admin' } */
export function subscribeMenuAccess(onData, onError) {
  if (!isFirebaseConfigured) {
    onData({})
    return () => {}
  }
  const ref = doc(db, collectionName('settings'), 'menuAccess')
  return onSnapshot(
    ref,
    (snap) => onData(snap.exists() ? snap.data() : {}),
    (err) => onError && onError(err),
  )
}

/** 메뉴 권한 저장(관리자만 — 규칙에서 막는다). */
export async function setMenuAccess(access) {
  assertConfigured()
  await setDoc(doc(db, collectionName('settings'), 'menuAccess'), access || {}, { merge: true })
}

/** 알림 설정(settings/notify). 구글챗 웹훅 주소를 담는다. */
export function subscribeNotify(onData, onError) {
  if (!isFirebaseConfigured) {
    onData({})
    return () => {}
  }
  const ref = doc(db, collectionName('settings'), 'notify')
  return onSnapshot(
    ref,
    (snap) => onData(snap.exists() ? snap.data() : {}),
    (err) => onError && onError(err),
  )
}

/** 웹훅 주소 저장(관리자만 — 규칙에서 막는다). 빈 값이면 알림을 끈다. */
export async function setNotifyWebhook(webhook) {
  assertConfigured()
  await setDoc(
    doc(db, collectionName('settings'), 'notify'),
    { chatWebhook: String(webhook || '').trim() },
    { merge: true },
  )
}

export async function setYearlyTarget(year, amount) {
  assertConfigured()
  await setDoc(
    doc(db, collectionName('settings'), 'targets'),
    { [String(year)]: Number(amount) || 0 },
    { merge: true },
  )
}


/* --------------------------------- 팀원 명단 --------------------------------- */
//
// members/{uid} — 로그인하면 본인이 자기 문서를 올린다.
// 관리자가 이메일을 손으로 받아 적는 대신, '로그인한 적 있는 사람'이 목록에 뜨고
// 관리자는 거기서 팀에 넣는다. teamId 는 본인이 못 쓴다(규칙에서 막는다) —
// 안 막으면 아무나 남의 팀에 들어가 그 팀 데이터를 볼 수 있다.

/** 로그인 직후 본인 문서를 올린다(없으면 만들고, 있으면 신원 정보만 갱신). */
/** 팀 배정 대기 알림. 등록된 웹훅이 없으면 조용히 넘어간다. */
async function notifyTeamRequest(user) {
  try {
    const snap = await getDoc(doc(db, collectionName('settings'), 'notify'))
    const webhook = snap.exists() ? snap.data().chatWebhook : ''
    if (!webhook) return
    const site = typeof window === 'undefined' ? '' : window.location.origin
    await sendChat(webhook, teamRequestText(user, site))
  } catch (err) {
    // 알림은 부가 기능이다. 실패해도 본류(로그인)를 막지 않는다.
    console.warn('팀 배정 알림 실패', err)
  }
}

export async function registerMember(user) {
  if (!isFirebaseConfigured || !user?.uid) return
  const ref = doc(db, collectionName('members'), user.uid)
  // 신원 정보는 Auth 토큰에서 온 값만 쓴다 — 화면에서 바꿀 수 있는 값이 아니다.
  const identity = {
    email: user.email,
    name: user.name,
    photoURL: user.photoURL || '',
    lastLoginAt: serverTimestamp(),
  }
  try {
    const snap = await getDoc(ref)
    const invite = await getInvite(user.email)
    const invitedTeamId = String(invite?.teamId || UNASSIGNED)
    if (snap.exists()) {
      const currentTeamId = String(snap.data().teamId || UNASSIGNED)
      await updateDoc(ref, {
        ...identity,
        ...(!currentTeamId && invitedTeamId ? { teamId: invitedTeamId } : {}),
      })
    } else {
      // 설정에 저장된 기본 팀만 자동 배정한다. 일반 사용자가 임의의 팀 id 를 넣는 것은
      // firestore.rules 가 막고, bootstrap 관리자는 옛 설정의 팀 이름에서도 복구한다.
      const teamRef = doc(db, collectionName('settings'), 'teams')
      const teamSnap = await getDoc(teamRef)
      const teamData = teamSnap.exists() ? teamSnap.data() : {}
      const initialTeamId = invitedTeamId || teamData.defaultTeamId
        || (user.isAdmin ? defaultTeamId(teamData.items || []) : UNASSIGNED)
      await setDoc(ref, {
        ...identity,
        teamId: initialTeamId,
        role: ROLE_MEMBER,
        createdAt: serverTimestamp(),
      })
      // 자동 배정이 안 됐으면 관리자가 손으로 넣어줘야 쓸 수 있다 —
      // 기다리는 사람이 생겼음을 알린다. 실패해도 로그인은 그대로 진행된다.
      if (!initialTeamId) notifyTeamRequest(user)
    }
  } catch (err) {
    // 명단 등록이 실패해도 앱은 떠야 한다 — 관리자가 목록에서 못 볼 뿐이다.
    // 조용히 삼키면 원인을 못 찾으니 콘솔에는 남긴다.
    console.warn('팀원 명단 등록 실패', err)
  }
}

export function subscribeMembers(onData, onError) {
  if (!isFirebaseConfigured) {
    onData([])
    return () => {}
  }
  const ref = collection(db, collectionName('members'))
  return onSnapshot(
    ref,
    (snap) => onData(snap.docs.map((d) => ({
      uid: d.id,
      ...d.data(),
      teamId: d.data().teamId || UNASSIGNED,
      role: d.data().role || ROLE_MEMBER,
    }))),
    (err) => onError && onError(err),
  )
}

/** 팀 배정·이동·해제(관리자만). teamId 를 빈 문자열로 주면 팀에서 빼는 것이다. */
export async function setMemberTeam(uid, teamId) {
  assertConfigured()
  await updateDoc(doc(db, collectionName('members'), uid), {
    teamId: String(teamId || UNASSIGNED),
  })
}

/**
 * 팀장·팀원 역할 지정(관리자만).
 * 본인이 자기 역할을 올릴 수 없게 규칙에서도 막는다 — 안 막으면 누구나 팀장이 된다.
 */
export async function setMemberRole(uid, role) {
  assertConfigured()
  await updateDoc(doc(db, collectionName('members'), uid), {
    role: role === 'leader' ? 'leader' : ROLE_MEMBER,
  })
}

/** 명단에서 완전히 지운다. 그 사람이 만든 데이터는 남는다. */
export async function removeMember(uid) {
  assertConfigured()
  await deleteDoc(doc(db, collectionName('members'), uid))
}

/* ---------------------------------- 팀 목록 ---------------------------------- */

/** settings/teams. 문서가 없으면 빈 배열. */
export function subscribeTeams(onData, onError) {
  if (!isFirebaseConfigured) {
    onData([])
    return () => {}
  }
  const ref = doc(db, collectionName('settings'), 'teams')
  return onSnapshot(
    ref,
    (snap) => onData(snap.exists() ? normalizeTeams(snap.data().items || []) : []),
    (err) => onError && onError(err),
  )
}

export async function setTeams(items) {
  assertConfigured()
  const clean = normalizeTeams(items)
  await setDoc(
    doc(db, collectionName('settings'), 'teams'),
    { items: clean, defaultTeamId: defaultTeamId(clean) },
    { merge: true },
  )
}

/** 옛 팀 설정에 기본 팀 id 가 없으면 관리자가 한 번 자동으로 보완한다. */
export async function ensureDefaultTeam(items) {
  assertConfigured()
  const id = defaultTeamId(items)
  if (!id) return
  const ref = doc(db, collectionName('settings'), 'teams')
  const snap = await getDoc(ref)
  if (snap.exists() && snap.data().defaultTeamId === id) return
  await setDoc(ref, { defaultTeamId: id }, { merge: true })
}

/** 팀별 연 목표. settings/teamTargets 에 { 'YYYY': { teamId: 금액 } } 로 둔다. */
export function subscribeTeamTargets(onData, onError) {
  if (!isFirebaseConfigured) {
    onData({})
    return () => {}
  }
  const ref = doc(db, collectionName('settings'), 'teamTargets')
  return onSnapshot(
    ref,
    (snap) => onData(snap.exists() ? snap.data() : {}),
    (err) => onError && onError(err),
  )
}

export async function setTeamTargets(year, allocation) {
  assertConfigured()
  const clean = {}
  for (const [teamId, amount] of Object.entries(allocation || {})) {
    const key = String(teamId || '').trim()
    const value = Number(amount) || 0
    if (key && value > 0) clean[key] = value
  }
  // 그 해 전체를 덮어쓴다 — 0으로 지운 팀이 남지 않도록.
  await setDoc(
    doc(db, collectionName('settings'), 'teamTargets'),
    { [String(year)]: clean },
    { merge: true },
  )
}

/* ------------------------------ 기존 데이터 팀 배정 ----------------------------- */

/**
 * teamId 가 없는 옛 문서를 팀에 넣는다(관리자만).
 *
 * 팀별 격리를 켜기 전에 만들어진 문서에는 teamId 가 없다. 그런 문서는
 * 팀원의 where('teamId','==',...) 쿼리에 걸리지 않아 화면에서 사라진 것처럼 보인다.
 * 관리자에게는 계속 보이므로, 관리자가 이 함수로 한 번 채워줘야 한다.
 *
 * 배치는 500건 제한이 있어 나눠 커밋한다.
 * onProgress(done, total) 로 진행 상황을 알려준다 — 185건이면 눈에 보이는 시간이 걸린다.
 */
export async function assignMissingTeam(name, teamId, onProgress) {
  assertConfigured()
  const target = String(teamId || '').trim()
  if (!target) throw new Error('배정할 팀을 골라주세요.')

  const snap = await getDocs(collection(db, collectionName(name)))
  // teamId 가 없거나 빈 문서만 건드린다 — 이미 배정된 건 그대로 둔다.
  const todo = snap.docs.filter((d) => !d.data().teamId)
  const total = todo.length
  if (total === 0) return 0

  const CHUNK = 400
  let done = 0
  for (let i = 0; i < todo.length; i += CHUNK) {
    const batch = writeBatch(db)
    for (const d of todo.slice(i, i + CHUNK)) batch.update(d.ref, { teamId: target })
    await batch.commit()
    done += Math.min(CHUNK, todo.length - i)
    if (onProgress) onProgress(done, total)
  }
  return total
}

/** teamId 가 없는 문서가 몇 건인지 센다. 배정 전에 규모를 알려주려는 것. */
export async function countMissingTeam(name) {
  assertConfigured()
  const snap = await getDocs(collection(db, collectionName(name)))
  return snap.docs.filter((d) => !d.data().teamId).length
}

/* ---------------------------------- 활동 댓글 --------------------------------- */
//
// activities/{id}/comments/{cid} — 하위 컬렉션으로 둔다.
// 활동 문서에 배열로 넣으면 댓글 하나 달 때마다 활동 전체를 덮어써야 하고,
// '작성자는 자기 활동을 수정할 수 있다' 는 규칙 때문에 작성자가 팀장 댓글을
// 지워버릴 수 있다. 문서를 나눠야 권한을 따로 걸 수 있다.

/** 한 활동의 댓글. 모달을 열 때만 구독한다. */
export function subscribeComments(activityId, onData, onError) {
  if (!isFirebaseConfigured || !activityId) {
    onData([])
    return () => {}
  }
  const ref = collection(db, collectionName('activities'), activityId, 'comments')
  return onSnapshot(
    query(ref, orderBy('createdAt', 'asc')),
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => onError && onError(err),
  )
}

/** 댓글 달기. 팀장·관리자만 (규칙에서 같이 막는다). */
export async function addComment(user, activityId, text) {
  assertConfigured()
  const body = String(text || '').trim()
  if (!body) throw new Error('내용을 입력해주세요.')
  await addDoc(collection(db, collectionName('activities'), activityId, 'comments'), {
    text: body,
    ...ownerFields(user),
    createdAt: serverTimestamp(),
  })
}

export async function updateComment(activityId, commentId, text) {
  assertConfigured()
  const body = String(text || '').trim()
  if (!body) throw new Error('내용을 입력해주세요.')
  await updateDoc(doc(db, collectionName('activities'), activityId, 'comments', commentId), {
    text: body,
    updatedAt: serverTimestamp(),
  })
}

export async function removeComment(activityId, commentId) {
  assertConfigured()
  await deleteDoc(doc(db, collectionName('activities'), activityId, 'comments', commentId))
}

/* --------------------------------- 감사 로그 --------------------------------- */
//
// auditLogs — 덧붙이기만 가능하다. 규칙에서 update·delete 를 모두 막는다.
// 읽기는 관리자만. 로그가 실패해도 원래 작업은 진행돼야 하므로 절대 던지지 않는다.

/** 로그 한 줄. 실패해도 조용히 넘어간다 — 로그 때문에 본 작업이 막히면 안 된다. */
export async function writeAudit(user, action, payload = {}) {
  if (!isFirebaseConfigured || !user?.uid || !action) return
  try {
    await addDoc(collection(db, collectionName('auditLogs')), {
      action,
      actor: user.uid,
      actorName: user.name || '',
      actorEmail: user.email || '',
      teamId: user.teamId || UNASSIGNED,
      targetId: String(payload.targetId || ''),
      targetLabel: String(payload.targetLabel || ''),
      from: payload.from == null ? '' : String(payload.from),
      to: payload.to == null ? '' : String(payload.to),
      note: String(payload.note || ''),
      at: serverTimestamp(),
    })
  } catch (err) {
    // 남기지 못했다는 사실 자체는 콘솔에 남긴다.
    console.warn('감사 로그 기록 실패', action, err)
  }
}

/** 최근 로그. 관리자만 읽을 수 있다(규칙). */
export function subscribeAuditLogs(max, onData, onError) {
  if (!isFirebaseConfigured) {
    onData([])
    return () => {}
  }
  const ref = collection(db, collectionName('auditLogs'))
  return onSnapshot(
    query(ref, orderBy('at', 'desc'), limit(Number(max) || 200)),
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => onError && onError(err),
  )
}
