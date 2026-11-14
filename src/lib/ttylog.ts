// A Cowrie TTY recording as timed frames for the xterm player (dash#305),
// the way the old dashboard's tty-replay page read it.
//
// The backend sends the raw ttylog (base64) beside its own decoded
// transcript. Each record is a 24-byte little-endian header (op, tty,
// length, direction, sec, usec) and `length` bytes; only writes to the
// terminal's output count, the same filter replay.rs's decode() applies, so
// the frames concatenate to exactly the transcript, each with its time.

export type TtyFrame = { at: number; data: Uint8Array }

const OP_WRITE = 3
const DIR_OUTPUT = 2
const HEADER = 24

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** The output frames, times in seconds from the first one. A truncated last
 * record ends the list rather than throwing. */
export function parseTtyLog(bytes: Uint8Array): TtyFrame[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const frames: TtyFrame[] = []
  let start: number | undefined
  let cursor = 0
  while (cursor + HEADER <= bytes.length) {
    const op = view.getInt32(cursor, true)
    const length = view.getInt32(cursor + 8, true)
    const direction = view.getInt32(cursor + 12, true)
    const time = view.getUint32(cursor + 16, true) + view.getUint32(cursor + 20, true) / 1_000_000
    cursor += HEADER
    if (length < 0 || cursor + length > bytes.length) break
    if (op === OP_WRITE && direction === DIR_OUTPUT) {
      start ??= time
      frames.push({ at: time - start, data: bytes.slice(cursor, cursor + length) })
    }
    cursor += length
  }
  return frames
}

const encoder = new TextEncoder()

/** The frames to play: the recording's own, or, when it carries no ttylog
 * (or one that decodes to nothing), the transcript a line at a time, spread
 * evenly over the recorded duration. */
export function framesFor(replay: { ttylog?: string; transcript: string; durationSeconds: number }): TtyFrame[] {
  if (replay.ttylog) {
    try {
      const frames = parseTtyLog(base64ToBytes(replay.ttylog))
      if (frames.length) return frames
    } catch {
      // Not base64: fall back to the transcript.
    }
  }
  const lines = replay.transcript.split(/(?<=\n)/).filter(Boolean)
  const step = lines.length > 1 ? replay.durationSeconds / (lines.length - 1) : 0
  return lines.map((line, i) => ({ at: i * step, data: encoder.encode(line) }))
}

/** How long to wait before frame `next`: the recorded gap, idle stretches
 * capped at 3 s (a session left open for an hour plays in seconds), at the
 * chosen speed. */
export function gapMs(frames: TtyFrame[], next: number, speed: number): number {
  if (next <= 0 || next >= frames.length) return 0
  return (Math.min(Math.max(0, frames[next].at - frames[next - 1].at), 3) * 1000) / speed
}

/** The transcript as readable text: escape sequences and control bytes out. */
export function plainTranscript(transcript: string): string {
  return transcript
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?/g, '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
}
