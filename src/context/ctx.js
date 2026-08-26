import { createContext, useContext } from 'react'

// 컨텍스트 객체를 별도 모듈로 뺀다.
// AppContext.jsx 안에 두면 그 파일을 고칠 때마다(HMR) 새 컨텍스트가 만들어져,
// 이미 그려진 컴포넌트가 옛 컨텍스트를 붙들고 'must be used within AppProvider' 로 죽는다.
export const Ctx = createContext(null)

export function useApp() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
