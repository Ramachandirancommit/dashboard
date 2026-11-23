import assert from 'node:assert/strict'
import test from 'node:test'
import { moduleBySlug, modules, validateRecord } from './records.js'

test('all 21 modules have distinct routes and accept their categories', () => {
  assert.equal(modules.length, 21)
  assert.equal(moduleBySlug.size, 21)
  for (const module of modules) {
    for (const kind of module.kinds) {
      assert.equal(validateRecord({ title: ' Example ', kind, dueAt: '2026-12-31T06:00:00.000Z' }, module).title, 'Example')
    }
  }
})

test('rejects invalid dates, categories and amounts', () => {
  const finance = moduleBySlug.get('finance')
  const valid = { title: 'Rent', kind: 'Expense' }
  assert.throws(() => validateRecord({ ...valid, dueAt: '2026-02-30T06:00:00.000Z' }, finance), /date/)
  assert.throws(() => validateRecord({ ...valid, kind: 'EMI' }, finance), /category/)
  assert.throws(() => validateRecord({ ...valid, amount: -1 }, finance), /amount/)
  assert.throws(() => validateRecord({ ...valid, recurrence: 'monthly' }, finance), /recurrence/)
  assert.throws(() => validateRecord({ title: 'Rent', kind: 'Bill' }, moduleBySlug.get('reminders')), /due/)
})
