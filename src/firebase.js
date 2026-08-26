// Firebase 초기화. VITE_FIREBASE_* 가 없으면 초기화하지 않는다(설정 필요 화면을 보여준다).
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

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
  db = getFirestore(app)
}

export { app, auth, db }
