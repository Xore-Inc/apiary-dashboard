// @vitest-environment jsdom
// A CAPE run that never reached CAPE (#261) has no task number: the page says
// so instead of printing "task 0".
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Theme } from '@astryxdesign/core/theme'
import { neutralTheme } from '#/themes/neutral/neutral-family'
import type { CapeRun } from '#/data/types'
import { CapeResult } from './CapeResult'

vi.mock('../EntityLink', () => ({ EntityLink: ({ children }: { children: React.ReactNode }) => <>{children}</> }))

const base: CapeRun = {
  sha: 'a'.repeat(64),
  at: '2026-10-01T12:00:00Z',
  status: 'failed_analysis',
  malscore: 0,
  signatures: [],
  processes: [],
  dumps: [],
  config: {},
  log: 'cape submit refused',
  taskId: null,
  capeStatus: null,
  malstatus: '',
  totalCalls: 0,
  sections: [],
  debugErrors: [],
}

const wrap = (node: React.ReactNode) => <Theme theme={neutralTheme}>{node}</Theme>

afterEach(cleanup)

describe('CapeResult', () => {
  it('says the sample was not submitted when there is no CAPE task', () => {
    render(wrap(<CapeResult run={base} />))
    expect(screen.getByText(/not submitted to CAPE/)).toBeTruthy()
    expect(screen.queryByText(/task 0/)).toBeNull()
  })

  it('names the CAPE task and status when CAPE accepted the sample', () => {
    render(wrap(<CapeResult run={{ ...base, status: 'reported', log: '', taskId: 8812, capeStatus: 'reported', malscore: 9.1, malstatus: 'Malicious' }} />))
    expect(screen.getByText(/task 8812/)).toBeTruthy()
    expect(screen.getByText(/CAPE status reported/)).toBeTruthy()
  })
})
