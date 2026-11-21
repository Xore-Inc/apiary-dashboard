import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { whenIdle } from './idle'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('whenIdle without requestIdleCallback (WebKit)', () => {
  it('runs the work from a timer', () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestIdleCallback', undefined)
    vi.stubGlobal('cancelIdleCallback', undefined)
    const run = vi.fn()
    whenIdle(run, { fallbackMs: 100 })
    expect(run).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(run).toHaveBeenCalledOnce()
  })

  it('cancels the timer', () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestIdleCallback', undefined)
    vi.stubGlobal('cancelIdleCallback', undefined)
    const run = vi.fn()
    whenIdle(run).cancel()
    vi.advanceTimersByTime(5000)
    expect(run).not.toHaveBeenCalled()
  })
})

describe('whenIdle with requestIdleCallback', () => {
  it('hands the work to the browser with the timeout, and cancels through it', () => {
    const request = vi.fn(() => 7)
    const cancel = vi.fn()
    vi.stubGlobal('requestIdleCallback', request)
    vi.stubGlobal('cancelIdleCallback', cancel)
    const run = vi.fn()
    const handle = whenIdle(run, { timeout: 1234 })
    expect(request).toHaveBeenCalledWith(run, { timeout: 1234 })
    handle.cancel()
    expect(cancel).toHaveBeenCalledWith(7)
  })

  it('cancels safely when only the request half exists', () => {
    vi.stubGlobal('requestIdleCallback', vi.fn(() => 1))
    vi.stubGlobal('cancelIdleCallback', undefined)
    expect(() => whenIdle(() => {}).cancel()).not.toThrow()
  })
})

describe('the browser global', () => {
  it('is used only by the helper', () => {
    const root = join(import.meta.dirname, '..')
    const users = (readdirSync(root, { recursive: true, encoding: 'utf8' }))
      .filter((file) => /\.(ts|tsx)$/.test(file) && !/\.test\.tsx?$/.test(file) && file !== 'lib/idle.ts')
      .filter((file) => /\b(request|cancel)IdleCallback\b/.test(readFileSync(join(root, file), 'utf8')))
    expect(users).toEqual([])
  })
})
