import { describe, expect, it } from 'vitest'
import { VIEW_LIMIT, capturedBytesOf, decodeBase64, hexDump, printableView } from './capturedBytes'

const b64 = (text: string) => Buffer.from(text, 'latin1').toString('base64')

describe('decodeBase64', () => {
  it('decodes standard base64 and refuses anything else', () => {
    expect(Array.from(decodeBase64('AAAAAA==') ?? [])).toEqual([0, 0, 0, 0])
    expect(decodeBase64('not base64!')).toBeUndefined()
    expect(decodeBase64('abc')).toBeUndefined()
    expect(decodeBase64(42)).toBeUndefined()
  })
})

describe('hexDump', () => {
  it('prints offset, hex in two groups of eight, and an ASCII column', () => {
    const bytes = Uint8Array.from([0x4d, 0x5a, 0x90, 0x00, 0x20, ...new TextEncoder().encode('hello, world!')])
    const [line] = hexDump(bytes).split('\n')
    expect(line.startsWith('00000000  4d 5a 90 00 20 68 65 6c')).toBe(true)
    expect(line.endsWith('|MZ.. hello, worl|')).toBe(true)
  })

  it('stops at the view limit and never splits a row', () => {
    const bytes = new Uint8Array(VIEW_LIMIT + 100).fill(0x41)
    const lines = hexDump(bytes).split('\n')
    expect(lines).toHaveLength(VIEW_LIMIT / 16)
    expect(lines.at(-1)?.startsWith(`${(VIEW_LIMIT - 16).toString(16).padStart(8, '0')}  `)).toBe(true)
  })
})

describe('printableView', () => {
  it('keeps printable ASCII and line breaks, dots the rest', () => {
    expect(printableView(new Uint8Array([0x41, 0x0a, 0x01, 0x7f, 0x42]))).toBe('A\n..B')
  })
})

describe('capturedBytesOf', () => {
  it('finds the known Suricata binary fields by path', () => {
    const record = {
      suricata: { eve: { packet: b64('packet-bytes'), http: { http_request_body: b64('POST /x'), http_response_body: 'not base64' } } },
    }
    const found = capturedBytesOf(record)
    expect(found.map((f) => f.path)).toEqual(['suricata.eve.packet', 'suricata.eve.http.http_request_body'])
    expect(new TextDecoder().decode(found[0].bytes)).toBe('packet-bytes')
  })

  it('finds any other *_base64 field, but never mail', () => {
    const record = { honeypot: { ttylog_base64: b64('tty'), eml_base64: b64('From: someone') } }
    const found = capturedBytesOf(record)
    expect(found.map((f) => f.path)).toEqual(['honeypot.ttylog_base64'])
    expect(found[0].label).toBe('ttylog')
  })

  it('is empty for a record with no binary', () => {
    expect(capturedBytesOf({ event: { sensor: 'cowrie' } })).toEqual([])
    expect(capturedBytesOf(undefined)).toEqual([])
  })
})
