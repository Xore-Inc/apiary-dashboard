// Field parity (#98): every field a canonical page reads is in the data the
// rewrite's pages show, carried under another name, or waived with a reason;
// and the report says so.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { build } from '../../scripts/inventory/field-coverage'

const root = join(import.meta.dirname, '..', '..')

describe('field coverage', () => {
  const { rows, stale, markdown } = build()

  it('leaves no canonical field unaccounted for', () => {
    expect(rows.filter((r) => r.gaps.length).map((r) => `${r.route}: ${r.gaps.join(', ')}`)).toEqual([])
  })

  it('maps only fields the canonical pages still read', () => {
    expect(stale).toEqual([])
  })

  it('gives every waiver a reason', () => {
    expect(rows.flatMap((r) => r.waived).filter((w) => w.reason.trim().length < 20)).toEqual([])
  })

  it('keeps docs/migration/field-coverage.md current', () => {
    expect(readFileSync(join(root, 'docs/migration/field-coverage.md'), 'utf8')).toBe(markdown)
  })
})
