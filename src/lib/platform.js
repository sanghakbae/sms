// 플랫폼 판별. 화면 안내 문구를 고르는 용도로만 쓴다 —
// 기능 분기에 쓰면 사용자 에이전트 문자열이 바뀔 때마다 깨진다.

/** 홈 화면에서 띄운 상태인가(주소창 없는 전체화면). */
export function isStandalone() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true
}

/**
 * iOS 기기인가.
 * iOS 는 브라우저가 무엇이든 속은 WebKit 이고 설치 방법도 같다 —
 * 그래서 브라우저 종류는 가리지 않는다.
 */
export function isIos() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/iPad|iPhone|iPod/.test(ua)) return true
  // 아이패드는 데스크톱 사파리로 위장한다. 터치 지원 여부로 가려낸다.
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}
