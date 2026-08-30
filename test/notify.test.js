import { test } from 'node:test'
import assert from 'node:assert/strict'
import { looksLikeChatWebhook, maskWebhook, teamRequestText } from '../src/lib/notify.js'

const GOOD = 'https://chat.googleapis.com/v1/spaces/AAQ123/messages?key=k&token=t'

test('구글챗 웹훅만 통과시킨다', () => {
  assert.equal(looksLikeChatWebhook(GOOD), true)
  assert.equal(looksLikeChatWebhook('https://evil.example.com/v1/spaces/x/messages'), false)
  assert.equal(looksLikeChatWebhook('http://chat.googleapis.com/v1/spaces/x/messages'), false)
  assert.equal(looksLikeChatWebhook('https://chat.googleapis.com/v1/spaces/x'), false)
  assert.equal(looksLikeChatWebhook(''), false)
  assert.equal(looksLikeChatWebhook('아무말'), false)
})

test('화면에는 키와 토큰을 보여주지 않는다', () => {
  const masked = maskWebhook(GOOD)
  assert.match(masked, /스페이스 AAQ123/)
  assert.ok(!masked.includes('token'), '토큰이 노출됩니다')
  assert.ok(!masked.includes('key='), '키가 노출됩니다')
})

test('배정 요청 문구에 누구인지가 들어간다', () => {
  const t = teamRequestText({ name: '배상학', email: 'bae@sanghak.kr' }, 'https://sms.sanghak.kr')
  assert.match(t, /배상학/)
  assert.match(t, /bae@sanghak\.kr/)
  assert.match(t, /sms\.sanghak\.kr/)
})
