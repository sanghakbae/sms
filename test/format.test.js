import { test } from 'node:test'
import assert from 'node:assert/strict'

import { compactWon, formatAmountInput, formatWon } from '../src/lib/format.js'

test('모든 금액 표시는 세 자리마다 쉼표를 넣는다', () => {
  assert.equal(formatWon(1234567890), '₩1,234,567,890')
  assert.equal(compactWon(123400000000), '1,234억')
  assert.equal(compactWon(90300000), '9,030만')
})

test('금액 입력값은 숫자만 남기고 세 자리마다 쉼표를 넣는다', () => {
  assert.equal(formatAmountInput('1234567'), '1,234,567')
  assert.equal(formatAmountInput('1,234,567원'), '1,234,567')
  assert.equal(formatAmountInput(''), '')
})
