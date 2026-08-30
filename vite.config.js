import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 매니페스트는 public/manifest.webmanifest 를 그대로 쓴다.
      // 플러그인이 또 만들면 index.html 에 link 가 둘이 되어 서로 다른 걸 가리킨다.
      manifest: false,
      // 'prompt' — 새 버전이 있어도 사용자가 누를 때까지 갈아치우지 않는다.
      // autoUpdate 로 두면 작성 중인 폼이 새로고침에 날아갈 수 있다.
      registerType: 'prompt',
      injectRegister: null, // 등록은 src/pwa.js 에서 직접 한다(안내 UI 를 붙여야 하므로)
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        // SPA 라우팅. 서버 쪽 404.html 폴백과 같은 역할을 오프라인에서 한다.
        navigateFallback: '/index.html',
        // Firebase 응답은 캐시하지 않는다 — 데이터 캐시는 Firestore 가 직접 한다.
        navigateFallbackDenylist: [/^\/__/, /\/[^/?]+\.[^/]+$/],
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        // 개발 중에도 등록 흐름을 확인할 수 있게 켠다.
        enabled: true,
        type: 'module',
      },
    }),
  ],
  server: {
    // 포트는 실행 환경이 PORT 로 지정하며, 없으면 Vite 기본값을 쓴다.
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
    host: true,
  },
})
