import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  addActivity,
  addCustomer,
  addDeal,
  isFirebaseConfigured,
  onAuthChange,
  removeActivity,
  removeCustomer,
  removeDeal,
  setMonthlyTarget,
  signInWithGoogle,
  signOutUser,
  subscribeActivities,
  subscribeCustomers,
  subscribeDeals,
  subscribeTargets,
  updateCustomer,
  updateDeal,
} from '../lib/store.js'

const Ctx = createContext(null)

function readError(err) {
  if (err?.code === 'permission-denied') return '권한이 없어 데이터를 읽지 못했습니다.'
  return err?.message || '데이터를 불러오지 못했습니다.'
}

export function AppProvider({ children }) {
  const [user, setUser] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [customers, setCustomers] = useState([])
  const [deals, setDeals] = useState([])
  const [activities, setActivities] = useState([])
  const [targets, setTargets] = useState({})
  const [dataError, setDataError] = useState('')
  const [toast, setToast] = useState('')
  const [retry, setRetry] = useState(0)
  // 구독별 최신 오류. Firestore 는 오류가 나면 리스너를 떼어버리므로
  // 어느 구독이 죽었는지 따로 기억했다가 재구독으로 되살린다.
  const errorsRef = useRef({})

  useEffect(() => onAuthChange((u) => {
    setUser(u)
    setAuthReady(true)
    if (!u) {
      setCustomers([])
      setDeals([])
      setActivities([])
      setTargets({})
    }
  }), [])

  // 로그인한 뒤에만 구독한다 — 보안 규칙상 비로그인 상태에서는 읽히지 않는다.
  // retry 가 바뀌면 통째로 재구독한다(오류로 끊긴 리스너 복구용).
  useEffect(() => {
    if (!user || !user.known) return undefined
    errorsRef.current = {}
    setDataError('')

    const sync = () => {
      const first = Object.values(errorsRef.current).find(Boolean)
      setDataError(first || '')
    }
    const onErr = (key) => (e) => { errorsRef.current[key] = readError(e); sync() }
    const onData = (key, setter) => (rows) => {
      if (errorsRef.current[key]) { delete errorsRef.current[key]; sync() }
      setter(rows)
    }

    const unsubs = [
      subscribeCustomers(onData('customers', setCustomers), onErr('customers')),
      subscribeDeals(onData('deals', setDeals), onErr('deals')),
      subscribeActivities(onData('activities', setActivities), onErr('activities')),
      subscribeTargets(onData('targets', setTargets), onErr('targets')),
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [user, retry])

  const retryData = useCallback(() => setRetry((n) => n + 1), [])

  useEffect(() => {
    if (!toast) return undefined
    const id = setTimeout(() => setToast(''), 1900)
    return () => clearTimeout(id)
  }, [toast])

  const notify = useCallback((msg) => setToast(msg), [])

  const login = useCallback(async () => {
    const u = await signInWithGoogle()
    setUser(u)
    return u
  }, [])

  const logout = useCallback(async () => {
    await signOutUser()
  }, [])

  // ----- 쓰기 액션 (uid 를 자동으로 붙여준다) -----
  const actions = useMemo(() => ({
    addCustomer: (data) => addCustomer(user, data),
    updateCustomer,
    removeCustomer,
    addDeal: (data) => addDeal(user, data),
    updateDeal,
    removeDeal,
    addActivity: (data) => addActivity(user, data),
    removeActivity,
    setMonthlyTarget,
  }), [user])

  const value = useMemo(() => ({
    user,
    authReady,
    isFirebaseConfigured,
    customers,
    deals,
    activities,
    targets,
    dataError,
    retryData,
    toast,
    notify,
    login,
    logout,
    ...actions,
  }), [user, authReady, customers, deals, activities, targets, dataError, retryData, toast, notify, login, logout, actions])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
