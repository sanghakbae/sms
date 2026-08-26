import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
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
  useEffect(() => {
    if (!user || !user.known) return undefined
    setDataError('')
    const onErr = (e) => setDataError(readError(e))
    const unsubs = [
      subscribeCustomers(setCustomers, onErr),
      subscribeDeals(setDeals, onErr),
      subscribeActivities(setActivities, onErr),
      subscribeTargets(setTargets, onErr),
    ]
    return () => unsubs.forEach((fn) => fn())
  }, [user])

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
    toast,
    notify,
    login,
    logout,
    ...actions,
  }), [user, authReady, customers, deals, activities, targets, dataError, toast, notify, login, logout, actions])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
