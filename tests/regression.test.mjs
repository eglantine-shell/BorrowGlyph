import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const dataUrl = new URL('../public/data.json', import.meta.url)
const data = JSON.parse(await readFile(dataUrl, 'utf8'))

function donor(component, char) {
  return (data.donors[component] ?? []).find((item) => item.char === char)
}

test('爱 indexes 友 as an exact lower component', () => {
  const item = donor('友', '爱')
  assert.ok(item, '爱 should be a donor for 友')
  assert.equal(item.slot, '⿱:1')
  assert.equal(item.depth, 1)
  assert.equal(item.variant, 'simplified')
})

test('a standalone component can donate itself', () => {
  const item = donor('友', '友')
  assert.ok(item, '友 should include a self donor')
  assert.equal(item.isSelf, true)
  assert.equal(item.slot, 'self')
})

test('犮 retains donors from different structural positions', () => {
  const hair = donor('犮', '髮')
  const pull = donor('犮', '拔')
  assert.ok(hair, '髮 should donate lower 犮')
  assert.ok(pull, '拔 should donate right 犮')
  assert.equal(hair.slot, '⿱:1')
  assert.equal(pull.slot, '⿰:1')
})

test('發 keeps the composite lower component for recursive fallback', () => {
  const glyph = data.glyphs['發']
  assert.ok(glyph, '發 should exist in glyph data')
  assert.ok(
    glyph.components.includes('⿰弓殳'),
    '發 should expose ⿰弓殳 so recursive fallback remains testable',
  )
})

test('donor retention is capped independently by script class', () => {
  for (const list of Object.values(data.donors)) {
    const counts = { shared: 0, simplified: 0, traditional: 0 }

    for (const item of list) {
      if (item.isSelf) continue
      const variant = item.variant ?? 'shared'
      counts[variant] += 1
    }

    assert.ok(counts.shared <= 24)
    assert.ok(counts.simplified <= 24)
    assert.ok(counts.traditional <= 24)
  }
})
