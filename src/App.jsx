import { useState } from 'react'
import { AppProvider, useApp } from './context/AppContext.jsx'
import Login from './pages/Login.jsx'
import PwaBanner from './components/PwaBanner.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Customers from './pages/Customers.jsx'
import Deals from './pages/Deals.jsx'
import Activities from './pages/Activities.jsx'
import Trades from './pages/Trades.jsx'
import Settings from './pages/Settings.jsx'
import Team from './pages/Team.jsx'

const TABS = [
  { id: 'dashboard', label: '대시보드', icon: 'dashboard', title: '대시보드', Page: Dashboard },
  { id: 'deals', label: '영업현황', icon: 'deals', title: '영업현황', Page: Deals },
  { id: 'customers', label: '거래처', icon: 'customers', title: '거래처', Page: Customers },
  { id: 'activities', label: '활동', icon: 'activities', title: '영업 활동', Page: Activities },
  // 수주 이후 — 계약과 입금. 파이프라인이 끝나는 자리에서 현금이 시작된다.
  { id: 'trades', label: '거래', icon: 'trades', title: '거래 · 입금', Page: Trades },
]

// 관리자·팀장에게 보이는 탭. 안에서 보이는 내용은 권한에 따라 갈린다 —
// 관리자는 전사 편성과 목표까지, 팀장은 자기 팀 현황만.
const LEAD_TABS = [
  { id: 'team', label: '팀', icon: 'team', title: '팀', Page: Team },
]

const ADMIN_TABS = [
  { id: 'settings', label: '설정', icon: 'settings', title: '설정', Page: Settings },
]

function NavIcon({ name }) {
  const common = {
    className: 'nav-icon', viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
  }

  if (name === 'dashboard') return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="4" rx="1.5" /><rect x="14" y="11" width="7" height="10" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /></svg>
  if (name === 'deals') return <svg {...common}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><path d="m14.8 9.2 5.4-5.4M16.5 3.8h3.7v3.7" /></svg>
  if (name === 'customers') return <svg {...common}><path d="M4 21V5.5A1.5 1.5 0 0 1 5.5 4H15v17M15 9h3.5A1.5 1.5 0 0 1 20 10.5V21M2.5 21h19" /><path d="M8 8h3M8 12h3M8 16h3" /></svg>
  if (name === 'activities') return <svg {...common}><path d="M7 4.5h10A1.5 1.5 0 0 1 18.5 6v14H5.5V6A1.5 1.5 0 0 1 7 4.5Z" /><path d="M9 4.5V3h6v1.5M8.5 10h7M8.5 14h5" /></svg>
  if (name === 'trades') return <svg {...common}><path d="M6 3h12v18l-2-1.3L14 21l-2-1.3L10 21l-2-1.3L6 21V3Z" /><path d="M9 8h6M9 12h6M9 16h3" /></svg>
  if (name === 'team') return <svg {...common}><circle cx="9" cy="8" r="3" /><path d="M3.5 19v-1.5A4.5 4.5 0 0 1 8 13h2a4.5 4.5 0 0 1 4.5 4.5V19M16 5.5a3 3 0 0 1 0 5.8M16.5 13.2a4.5 4.5 0 0 1 4 4.5V19" /></svg>
  if (name === 'settings') return <svg {...common}><path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6" /></svg>
  return <svg {...common}><path d="M4 18V10M10 18V6M16 18V3M3 18h18" /></svg>
}

function Shell() {
  const { user, authReady, needsTeam, dataError, sync, retryData, toast, isFirebaseConfigured, logout } = useApp()
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
  const tabs = [
    ...TABS,
    ...(canLead ? LEAD_TABS : []),
    ...(user.isAdmin ? ADMIN_TABS : []),
  ]
  const current = tabs.find((t) => t.id === tab) || tabs[0]
  const { Page } = current

  return (
    <div className="app">
      <header className="topbar">
        <h1>{current.title}</h1>
        <div className="topbar-actions">
          <span className="who">
            <span aria-hidden="true">{user.emoji}</span>
            {user.name}
          </span>
          <button type="button" className="topbar-logout" onClick={logout}>로그아웃</button>
        </div>
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
          <span className="ico" aria-hidden="true"><NavIcon name="brand" /></span>
          세일즈
        </div>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-current={current.id === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            <span className="ico" aria-hidden="true"><NavIcon name={t.icon} /></span>
            {t.label}
          </button>
        ))}
      </nav>

      {/* 오프라인이거나 아직 못 올린 쓰기가 있으면 알린다.
          '저장했습니다' 만 띄우면 서버에 갔다고 오해한다. */}
      {(sync.fromCache || sync.pending > 0) && (
        <div className="sync-strip" role="status">
          {sync.pending > 0
            ? `미전송 ${sync.pending}건 · 연결되면 자동으로 올라갑니다`
            : '오프라인 — 저장된 내용을 보고 있습니다'}
        </div>
      )}

      <PwaBanner />

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
