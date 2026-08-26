// 데이터 계층 — 저장소는 Firestore, 인증은 Google OAuth 하나뿐이다.
// 거래처·영업기회·활동·목표를 모두 Firestore 에 저장한다.

import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'

import { auth, collectionName, db, isFirebaseConfigured } from '../firebase.js'
import { isAdminEmail, isAllowedEmail, normalizeEmail, shortName } from './accounts.js'

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
}

/* ---------------------------- 문서에 담당자 정보 붙이기 --------------------------- */

function ownerFields(user) {
  return { owner: user.uid, ownerName: user.name, ownerEmail: user.email }
}

/* --------------------------------- 구독(읽기) --------------------------------- */

function subscribeCollection(name, order, onData, onError) {
  if (!isFirebaseConfigured) {
    onData([])
    return () => {}
  }
  const ref = collection(db, collectionName(name))
  const q = order ? query(ref, orderBy(order.field, order.dir || 'desc')) : ref
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => onError && onError(err),
  )
}

export function subscribeCustomers(onData, onError) {
  return subscribeCollection('customers', { field: 'name', dir: 'asc' }, onData, onError)
}

export function subscribeDeals(onData, onError) {
  return subscribeCollection('deals', { field: 'updatedAt', dir: 'desc' }, onData, onError)
}

export function subscribeActivities(onData, onError) {
  return subscribeCollection('activities', { field: 'date', dir: 'desc' }, onData, onError)
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

/* --------------------------------- 쓰기(CRUD) --------------------------------- */

export async function addCustomer(user, data) {
  assertConfigured()
  await addDoc(collection(db, collectionName('customers')), {
    ...data,
    ...ownerFields(user),
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
    createdAt: serverTimestamp(),
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

/** 연 매출목표. settings/targets 문서에 'YYYY' 키로 저장한다. */
export async function setYearlyTarget(year, amount) {
  assertConfigured()
  await setDoc(
    doc(db, collectionName('settings'), 'targets'),
    { [String(year)]: Number(amount) || 0 },
    { merge: true },
  )
}

