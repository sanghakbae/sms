import { useState } from 'react'
import { AppProvider, useApp } from './context/AppContext.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Customers from './pages/Customers.jsx'
import Deals from './pages/Deals.jsx'
import Activities from './pages/Activities.jsx'
import Trades from './pages/Trades.jsx'
import Settings from './pages/Settings.jsx'
import Team from './pages/Team.jsx'

const TABS = [
  { id: 'dashboard', label: '대시보드', icon: '📊', title: '대시보드', Page: Dashboard },
  { id: 'deals', label: '영업기회', icon: '🎯', title: '영업 파이프라인', Page: Deals },
  { id: 'customers', label: '거래처', icon: '🏢', title: '거래처', Page: Customers },
  { id: 'activities', label: '활동', icon: '📝', title: '영업 활동', Page: Activities },
  // 수주 이후 — 계약과 입금. 파이프라인이 끝나는 자리에서 현금이 시작된다.
  { id: 'trades', label: '거래', icon: '🧾', title: '거래 · 입금', Page: Trades },
  { id: 'settings', label: '설정', icon: '⚙️', title: '설정', Page: Settings },
]

// 관리자·팀장에게 보이는 탭. 안에서 보이는 내용은 권한에 따라 갈린다 —
// 관리자는 전사 편성과 목표까지, 팀장은 자기 팀 현황만.
const LEAD_TABS = [
  { id: 'team', label: '팀', icon: '🛡️', title: '팀', Page: Team },
]

function Shell() {
  const { user, authReady, needsTeam, dataError, retryData, toast, isFirebaseConfigured, logout } = useApp()
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

  // 로그인은 했지만 아직 팀에 배정되지 않은 상태.
  // 이때는 아무 데이터도 볼 수 없다 — 빈 화면을 던지지 말고 왜 비었는지 알려준다.
  if (needsTeam) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-brand">
            <div className="login-mark" aria-hidden="true">🕗</div>
            <h1>팀 배정을 기다리는 중입니다</h1>
            <p>
              <b>{user.name}</b> 님으로 로그인했습니다.<br />
              관리자가 팀에 배정하면 바로 이용할 수 있습니다.
            </p>
            <p className="login-sub">
              배정되면 이 화면은 자동으로 넘어갑니다. 다시 로그인하지 않아도 됩니다.
            </p>
          </div>
          <button type="button" className="ghost block" onClick={logout}>로그아웃</button>
        </div>
      </div>
    )
  }

  // 관리자·팀장 탭은 권한이 있을 때만 목록에 넣는다.
  // 권한이 사라지면 선택 중이던 탭도 자동으로 첫 탭으로 돌아간다.
  const canLead = user.isAdmin || user.role === 'leader'
  const tabs = canLead ? [...TABS, ...LEAD_TABS] : TABS
  const current = tabs.find((t) => t.id === tab) || tabs[0]
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
        {tabs.map((t) => (
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
