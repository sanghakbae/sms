// Firebase 초기화. VITE_FIREBASE_* 가 없으면 초기화하지 않는다(설정 필요 화면을 보여준다).
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'

const env = import.meta.env

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
}

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId)

/** 여러 앱이 한 Firebase 프로젝트를 공유할 때 컬렉션을 분리하기 위한 접두사. */
export const COLLECTION_PREFIX = env.VITE_COLLECTION_PREFIX || ''

export const collectionName = (name) => `${COLLECTION_PREFIX}${name}`

let app = null
let auth = null
let db = null

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig)
  auth = getAuth(app)
  // 오프라인 캐시(IndexedDB). 신호가 없어도 이미 받은 데이터는 보이고,
  // 그때 적은 내용은 로컬에 쌓였다가 연결되면 자동으로 올라간다.
  //
  // 탭 관리자를 붙여야 여러 탭에서 같이 쓸 수 있다 — 안 붙이면 두 번째 탭에서
  // 캐시가 꺼진다.
  //
  // 주의: 캐시는 이 기기에 남는다. 공용 기기라면 로그아웃 시 정리가 필요하다.
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  })
}

export { app, auth, db }
