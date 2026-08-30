import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// 서비스워커 등록. 실패해도 앱은 그대로 뜬다.
import { initPwa } from './pwa.js'

initPwa()
