// 구글챗 알림.
//
// 웹훅 주소는 코드에 박지 않고 관리자가 화면에서 등록한다(settings/notify).
// 주소 자체가 곧 발송 권한이라 코드에 박으면 저장소·번들에 그대로 노출된다.
//
// 한계를 알고 쓸 것:
//   - 브라우저에서 직접 호출하므로, 로그인한 구성원은 개발자도구로 주소를 볼 수 있다.
//     외부에는 닫혀 있지만 내부에는 열려 있다. 완전히 감추려면 서버 경유가 필요하다.
//   - 발송 실패는 화면 동작을 막지 않는다. 알림은 부가 기능이지 본류가 아니다.

/** 구글챗 웹훅 주소로 보이는가. 오타를 저장 전에 걸러낸다. */
export function looksLikeChatWebhook(url) {
  const s = String(url || '').trim()
  if (!s) return false
  try {
    const u = new URL(s)
    return u.protocol === 'https:'
      && u.hostname === 'chat.googleapis.com'
      && u.pathname.includes('/messages')
  } catch {
    return false
  }
}

/** 화면에 보여줄 때 쓸 가려진 주소. 전체를 노출하지 않는다. */
export function maskWebhook(url) {
  const s = String(url || '').trim()
  if (!s) return ''
  const m = s.match(/\/spaces\/([^/]+)\//)
  return m ? `chat.googleapis.com · 스페이스 ${m[1]}` : 'chat.googleapis.com'
}

/**
 * 메시지 전송. 실패해도 예외를 밖으로 던지지 않는다 —
 * 알림이 안 갔다고 팀 배정이나 로그인이 막히면 안 된다.
 * 보냈는지 여부만 돌려준다.
 */
export async function sendChat(webhook, text) {
  if (!looksLikeChatWebhook(webhook) || !String(text || '').trim()) return false
  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    return res.ok
  } catch {
    return false
  }
}

/** 팀 배정 대기 알림 문구. */
export function teamRequestText(user, siteUrl) {
  const who = user?.name || user?.email || '알 수 없는 사용자'
  const mail = user?.email ? ` (${user.email})` : ''
  return [
    '🕗 팀 배정 대기',
    `${who}${mail} 님이 로그인했습니다.`,
    '팀에 배정해야 데이터를 보고 만들 수 있습니다.',
    siteUrl ? `→ ${siteUrl}` : '',
  ].filter(Boolean).join('\n')
}
