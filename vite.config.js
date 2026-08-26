import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // 포트는 실행 환경이 PORT 로 지정하며, 없으면 Vite 기본값을 쓴다.
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
    host: true,
  },
})
