import { describe, expect, it } from 'vitest'
import { base64ToBytes, framesFor, gapMs, parseTtyLog, plainTranscript } from './ttylog'

/** One ttylog record: the 24-byte header and its bytes. */
function record(op: number, direction: number, sec: number, usec: number, text: string): Uint8Array {
  const body = new TextEncoder().encode(text)
  const out = new Uint8Array(24 + body.length)
  const view = new DataView(out.buffer)
  view.setInt32(0, op, true)
  view.setInt32(4, 0, true)
  view.setInt32(8, body.length, true)
  view.setInt32(12, direction, true)
  view.setUint32(16, sec, true)
  view.setUint32(20, usec, true)
  out.set(body, 24)
  return out
}
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) (out.set(p, at), (at += p.length))
  return out
}
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const text = (frame: { data: Uint8Array }) => new TextDecoder().decode(frame.data)

describe('ttylog', () => {
  const log = concat(
    record(1, 0, 100, 0, ''), // open
    record(3, 2, 100, 0, 'login: '), // output
    record(3, 1, 101, 0, 'root\r'), // input: not drawn
    record(3, 2, 101, 500_000, 'root\r\n$ '), // output
    record(2, 0, 200, 0, ''), // close
  )

  it('keeps the output writes, timed from the first', () => {
    const frames = parseTtyLog(log)
    expect(frames.map(text)).toEqual(['login: ', 'root\r\n$ '])
    expect(frames.map((f) => f.at)).toEqual([0, 1.5])
  })

  it('stops at a truncated record instead of throwing', () => {
    // The close record and part of the last write cut off.
    expect(parseTtyLog(log.slice(0, log.length - 30)).map(text)).toEqual(['login: '])
    expect(parseTtyLog(new Uint8Array(10))).toEqual([])
  })

  it('round-trips base64', () => {
    expect(base64ToBytes(toBase64(log))).toEqual(log)
  })

  it('plays the recording’s own frames when it has a ttylog', () => {
    expect(framesFor({ ttylog: toBase64(log), transcript: 'ignored', durationSeconds: 9 }).map(text)).toEqual(['login: ', 'root\r\n$ '])
  })

  it('falls back to the transcript a line at a time over the duration', () => {
    const frames = framesFor({ transcript: 'a\nb\nc', durationSeconds: 4, ttylog: 'not base64!' })
    expect(frames.map(text)).toEqual(['a\n', 'b\n', 'c'])
    expect(frames.map((f) => f.at)).toEqual([0, 2, 4])
  })

  it('caps idle gaps at 3 s and scales by speed', () => {
    const frames = [{ at: 0, data: new Uint8Array() }, { at: 0.5, data: new Uint8Array() }, { at: 600, data: new Uint8Array() }]
    expect(gapMs(frames, 1, 1)).toBe(500)
    expect(gapMs(frames, 2, 1)).toBe(3000)
    expect(gapMs(frames, 2, 2)).toBe(1500)
  })

  it('strips escape sequences for the readable transcript', () => {
    expect(plainTranscript('\x1b[1;32mroot\x1b[0m@host:~$ \x07ls')).toBe('root@host:~$ ls')
  })
})
