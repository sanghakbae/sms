import { useState } from 'react'
import { AppProvider, useApp } from './context/AppContext.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Customers from './pages/Customers.jsx'
import Deals from './pages/Deals.jsx'
import Activities from './pages/Activities.jsx'
import Settings from './pages/Settings.jsx'

const TABS = [
  { id: 'dashboard', label: '대시보드', icon: '📊', title: '대시보드', Page: Dashboard },
  { id: 'deals', label: '영업기회', icon: '🎯', title: '영업 파이프라인', Page: Deals },
  { id: 'customers', label: '거래처', icon: '🏢', title: '거래처', Page: Customers },
  { id: 'activities', label: '활동', icon: '📝', title: '영업 활동', Page: Activities },
  { id: 'settings', label: '설정', icon: '⚙️', title: '설정', Page: Settings },
]

function Shell() {
  const { user, authReady, dataError, retryData, toast, isFirebaseConfigured } = useApp()
  const [tab, setTab] = useState('dashboard')

  if (!isFirebaseConfigured) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-brand">
            <div className="login-mark" aria-hidden="true">🔌</div>
            <h1>설정이 필요합니다</h1>
            <p>.env 에 VITE_FIREBASE_* 값을 채워주세요.</p>
          </div>
        </div>
      </div>
    )
  }

  if (!authReady) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-brand">
            <div className="login-mark" aria-hidden="true">📈</div>
            <p>불러오는 중…</p>
          </div>
        </div>
      </div>
    )
  }

  if (!user) return <Login />

  if (!user.known) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-brand">
            <div className="login-mark" aria-hidden="true">🚫</div>
            <h1>접근 권한이 없습니다</h1>
            <p>등록된 영업팀 계정만 사용할 수 있습니다.</p>
          </div>
        </div>
      </div>
    )
  }

  const current = TABS.find((t) => t.id === tab) || TABS[0]
  const { Page } = current

  return (
    <div className="app">
      <header className="topbar">
        <h1>{current.title}</h1>
        <span className="who">
          <span aria-hidden="true">{user.emoji}</span>
          {user.name}
        </span>
      </header>

      {dataError && (
        <div className="err-strip">
          <span>⚠️ {dataError}</span>
          <button type="button" onClick={retryData}>다시 시도</button>
        </div>
      )}

      <Page />

      <nav className="tabbar">
        <div className="tabbar-brand">
          <span className="ico" aria-hidden="true">📈</span>
          세일즈
        </div>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            <span className="ico" aria-hidden="true">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  )
}
