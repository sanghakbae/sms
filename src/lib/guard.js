// 쓰기 실패를 사람이 알 수 있게 만드는 도우미.
//
// Firestore 는 보안 규칙에 막히면 예외를 던진다. 잡지 않으면 화면에는
// 아무 일도 일어나지 않아 '눌렀는데 안 된다' 가 된다 — 팀 배정, 활동 삭제에서
// 실제로 그렇게 헤맸다. 실패는 반드시 말해야 한다.

/** 오류를 사람이 읽을 수 있는 한 줄로. */
export function writeErrorMessage(err, action = '저장') {
  const code = err?.code || ''
  if (code === 'permission-denied') {
    return `${action} 권한이 없습니다. 담당자 본인·팀장·관리자만 할 수 있습니다.`
  }
  if (code === 'unavailable' || code === 'failed-precondition') {
    return `연결이 끊겨 ${action}하지 못했습니다. 잠시 뒤 다시 시도해주세요.`
  }
  if (code === 'not-found') {
    return '이미 삭제된 항목입니다.'
  }
  return `${action} 실패: ${err?.message || err}`
}

/**
 * 쓰기를 감싸 실패를 알린다. 성공하면 true.
 * notify 는 화면에 한 줄 띄우는 함수(useApp 의 notify).
 */
export async function runWrite(notify, action, fn) {
  try {
    await fn()
    return true
  } catch (err) {
    notify(writeErrorMessage(err, action))
    return false
  }
}
