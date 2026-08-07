import { strictEqual as assertEquals } from 'node:assert/strict'
import { isKeepalivePingDue } from './keepaliveDue.ts'

Deno.test('never pinged yet -> always due', () => {
  assertEquals(isKeepalivePingDue(new Date('2026-08-07T00:00:00Z'), null, 3), true)
})

Deno.test('pinged today, 3-day interval -> not due', () => {
  assertEquals(isKeepalivePingDue(new Date('2026-08-07T12:00:00Z'), '2026-08-07T00:00:00Z', 3), false)
})

Deno.test('exactly at the interval boundary -> due', () => {
  assertEquals(isKeepalivePingDue(new Date('2026-08-10T00:00:00Z'), '2026-08-07T00:00:00Z', 3), true)
})

Deno.test('one second before the boundary -> not due', () => {
  assertEquals(isKeepalivePingDue(new Date('2026-08-09T23:59:59Z'), '2026-08-07T00:00:00Z', 3), false)
})

Deno.test('past the interval -> due', () => {
  assertEquals(isKeepalivePingDue(new Date('2026-08-20T00:00:00Z'), '2026-08-07T00:00:00Z', 3), true)
})
