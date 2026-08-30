import { useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { ALLOWED_DOMAINS } from '../lib/accounts.js'

export default function Login() {
  const { login } = useApp()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const onGoogle = async () => {
    setError('')
    setBusy(true)
    try {
      await login()
    } catch (e) {
      setError(friendly(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-glow" aria-hidden="true" />
      <div className="login-card">
        <div className="login-brand">
          <div className="login-mark" aria-hidden="true">📈</div>
          <h1>영업관리</h1>
          <p>영업 관리시스템</p>
        </div>

        <button type="button" className="google-btn" onClick={onGoogle} disabled={busy}>
          <GoogleIcon />
          {busy ? '로그인 중…' : 'Google 계정으로 로그인'}
        </button>

        {error && <div className="login-error">{error}</div>}

        <p className="login-hint">
          {ALLOWED_DOMAINS.length > 0
            ? `${ALLOWED_DOMAINS.map((d) => `@${d}`).join(', ')} 계정만 접근할 수 있습니다.`
            : 'Google 계정으로 로그인하면 바로 사용할 수 있습니다.'}
        </p>

        <p className="login-foot">
          <a href="/privacy.html" target="_blank" rel="noopener noreferrer">개인정보처리방침</a>
        </p>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

function friendly(e) {
  const code = e?.code || ''
  if (code.includes('popup-closed-by-user')) return '로그인 창이 닫혔습니다. 다시 시도해주세요.'
  if (code.includes('popup-blocked')) return '팝업이 차단되었습니다. 팝업을 허용해주세요.'
  if (code.includes('unauthorized-domain')) return '허용되지 않은 도메인입니다. Firebase 승인 도메인을 확인하세요.'
  if (code.includes('operation-not-allowed')) return 'Firebase 콘솔에서 Google 로그인을 활성화해야 합니다.'
  return e?.message || '로그인에 실패했습니다.'
}
