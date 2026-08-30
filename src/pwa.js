// 서비스워커 등록과 '새 버전' 알림.
//
// registerType: 'prompt' 이라 새 버전이 받아져도 자동으로 갈아치우지 않는다.
// 작성 중인 폼이 새로고침에 날아가면 안 되므로, 사용자가 누를 때 교체한다.

import { registerSW } from 'virtual:pwa-register'

let updateSW = null
let registration = null
let initialized = false
const listeners = new Set()
let state = { needRefresh: false, offlineReady: false }
const UPDATE_CHECK_MS = 30 * 60 * 1000

function emit(next) {
  state = { ...state, ...next }
  for (const fn of listeners) fn(state)
}

/** 상태 변화를 구독한다. 해제 함수를 돌려준다. */
export function onPwaState(fn) {
  listeners.add(fn)
  fn(state)
  return () => listeners.delete(fn)
}

/** 사용자가 '지금 새로고침' 을 눌렀을 때. */
export function applyUpdate() {
  if (updateSW) updateSW(true)
}

export function getPwaState() {
  return state
}

/** 앱을 오래 켜둬도 새 배포를 놓치지 않게 서비스워커를 다시 확인한다. */
export function checkForUpdate() {
  if (!registration || !navigator.onLine) return
  registration.update().catch(() => { /* 다음 복귀·주기 검사에서 다시 시도한다 */ })
}

export function initPwa() {
  // 서비스워커를 지원하지 않는 환경(구형 브라우저, 비보안 컨텍스트)에서는 조용히 넘어간다.
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  if (initialized) return
  initialized = true
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() { emit({ needRefresh: true }) },
    onOfflineReady() { emit({ offlineReady: true }) },
    onRegisteredSW(_swUrl, nextRegistration) {
      registration = nextRegistration || null
    },
  })

  // 설치형 앱은 며칠씩 닫히지 않을 수 있다. 다시 보이거나 온라인으로 돌아왔을 때와
  // 30분마다 확인하면 새 배포 뒤에도 업데이트 안내가 늦게 뜨지 않는다.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate()
  })
  window.addEventListener('online', checkForUpdate)
  window.setInterval(checkForUpdate, UPDATE_CHECK_MS)
}
