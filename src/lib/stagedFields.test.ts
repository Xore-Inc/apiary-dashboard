import { describe, expect, it } from 'vitest'
import { changedFields, isDefaultField, stagedFields } from './stagedFields'

const saved = { maxExportRows: 0, readOnly: false, defaultTimeWindow: '' }

describe('stagedFields (#306)', () => {
  it('sends nothing for an untouched form whose document stores nothing', () => {
    expect(stagedFields(saved, saved, [])).toEqual([])
    expect(isDefaultField('maxExportRows', saved, saved, [])).toBe(true)
  })

  it('sends only the changed field when everything else is at its default', () => {
    expect(stagedFields(saved, { ...saved, readOnly: true }, [])).toEqual(['readOnly'])
    expect(isDefaultField('readOnly', saved, { ...saved, readOnly: true }, [])).toBe(false)
  })

  it('keeps the stored fields, so the replaced section loses nothing', () => {
    expect(stagedFields(saved, { ...saved, readOnly: true }, ['defaultTimeWindow'])).toEqual(['defaultTimeWindow', 'readOnly'])
  })

  it('an entered value is a change, and is sent to be validated', () => {
    expect(changedFields(saved, { ...saved, maxExportRows: 5 })).toEqual(['maxExportRows'])
  })

  it('sends the whole section where the tier stores whole sections', () => {
    expect(stagedFields(saved, saved, undefined)).toBeUndefined()
    expect(isDefaultField('readOnly', saved, saved, undefined)).toBe(false)
  })
})
