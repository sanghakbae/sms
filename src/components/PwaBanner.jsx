import { useEffect, useState } from 'react'
import { applyUpdate, onPwaState } from '../pwa.js'
import { isIos, isStandalone } from '../lib/platform.js'

const IOS_HINT_KEY = 'pwa.iosHintDismissed'

/**
 * 화면 아래 띄우는 PWA 안내 두 가지.
 *  - 새 버전이 받아졌을 때: 누르면 교체하고 새로고침한다.
 *  - 아이폰에서 아직 홈 화면에 안 넣었을 때: 설치 방법을 알려준다.
 *    아이폰 사파리에는 설치 버튼이 없어서 직접 알려주지 않으면 방법을 모른다.
 */
export default function PwaBanner() {
  const [needRefresh, setNeedRefresh] = useState(false)
  const [showIosHint, setShowIosHint] = useState(false)

  useEffect(() => onPwaState((s) => setNeedRefresh(s.needRefresh)), [])

  useEffect(() => {
    if (!isIos() || isStandalone()) return
    try {
      if (localStorage.getItem(IOS_HINT_KEY)) return
    } catch { /* 저장소가 막혀 있어도 안내는 띄운다 */ }
    // 열자마자 띄우면 성가시다. 잠깐 써 본 뒤에 알린다.
    const id = setTimeout(() => setShowIosHint(true), 4000)
    return () => clearTimeout(id)
  }, [])

  const dismissIos = () => {
    setShowIosHint(false)
    try { localStorage.setItem(IOS_HINT_KEY, '1') } catch { /* 무시 */ }
  }

  if (needRefresh) {
    return (
      <div className="pwa-banner" role="status">
        <span>새 버전이 준비됐습니다.</span>
        <button type="button" className="pwa-cta" onClick={applyUpdate}>지금 새로고침</button>
        <button type="button" className="pwa-x" onClick={() => setNeedRefresh(false)} aria-label="닫기">✕</button>
      </div>
    )
  }

  if (showIosHint) {
    return (
      <div className="pwa-banner" role="status">
        <span>홈 화면에 추가하면 앱처럼 쓸 수 있습니다. 공유 <b>⎋</b> → <b>홈 화면에 추가</b></span>
        <button type="button" className="pwa-x" onClick={dismissIos} aria-label="닫기">✕</button>
      </div>
    )
  }

  return null
}
