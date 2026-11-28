// The binary a stored document carries, read back out of its base64 fields
// for the event and session pages. A field is found by its path where the
// sensor's shape is known, and by a `*_base64` key anywhere else, so a new
// sensor's payload shows without a code change. Mail bodies are never read
// here: raw EML is an administrator-class read (#3976), served by its own page.

/** The most bytes a hex dump or printable view renders. The base64 original
 * stays in the record (the Raw tab), so nothing is lost; only the view is
 * bounded, and the view says so. */
export const VIEW_LIMIT = 64 * 1024

export type CapturedBytes = { label: string; path: string; bytes: Uint8Array }

const KNOWN: Array<{ label: string; path: string[] }> = [
  { label: 'Packet capture', path: ['suricata', 'eve', 'packet'] },
  { label: 'Payload', path: ['suricata', 'eve', 'payload'] },
  { label: 'HTTP request body', path: ['suricata', 'eve', 'http', 'http_request_body'] },
  { label: 'HTTP response body', path: ['suricata', 'eve', 'http', 'http_response_body'] },
]

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/
const MAIL = /eml/i

/** The bytes a base64 string encodes, or undefined when it is not base64. */
export function decodeBase64(value: unknown): Uint8Array | undefined {
  if (typeof value !== 'string' || value.length < 4 || value.length % 4 !== 0 || !BASE64.test(value)) return undefined
  try {
    const binary = atob(value)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return undefined
  }
}

const at = (node: unknown, path: string[]): unknown => path.reduce<unknown>((cur, key) => (cur !== null && typeof cur === 'object' ? (cur as Record<string, unknown>)[key] : undefined), node)

/** Every binary field of one stored record, in a stable order. */
export function capturedBytesOf(record: Record<string, unknown> | undefined): CapturedBytes[] {
  if (!record) return []
  const found: CapturedBytes[] = []
  const seen = new Set<string>()
  for (const { label, path } of KNOWN) {
    const bytes = decodeBase64(at(record, path))
    if (bytes) {
      found.push({ label, path: path.join('.'), bytes })
      seen.add(path.join('.'))
    }
  }
  const walk = (node: unknown, path: string[]) => {
    if (node === null || typeof node !== 'object' || Array.isArray(node)) return
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const here = [...path, key]
      if (typeof value === 'object') walk(value, here)
      else if (key.endsWith('_base64') && !MAIL.test(key) && !seen.has(here.join('.'))) {
        const bytes = decodeBase64(value)
        if (bytes) found.push({ label: key.slice(0, -'_base64'.length).replace(/_/g, ' '), path: here.join('.'), bytes })
      }
    }
  }
  walk(record, [])
  return found
}

/** Offset, hex and ASCII columns, sixteen bytes a line, for at most `limit` bytes. */
export function hexDump(bytes: Uint8Array, limit = VIEW_LIMIT): string {
  const shown = Math.min(bytes.length, limit)
  const lines: string[] = []
  for (let row = 0; row < shown; row += 16) {
    const chunk = bytes.subarray(row, Math.min(row + 16, shown))
    const hex = Array.from(chunk, (b) => b.toString(16).padStart(2, '0'))
    const left = hex.slice(0, 8).join(' ').padEnd(23, ' ')
    const right = hex.slice(8).join(' ').padEnd(23, ' ')
    const ascii = Array.from(chunk, (b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.')).join('')
    lines.push(`${row.toString(16).padStart(8, '0')}  ${left}  ${right}  |${ascii}|`)
  }
  return lines.join('\n')
}

/** The same bytes as text: printable ASCII and line breaks kept, the rest shown as dots. */
export function printableView(bytes: Uint8Array, limit = VIEW_LIMIT): string {
  return Array.from(bytes.subarray(0, Math.min(bytes.length, limit)), (b) => (b >= 0x20 && b < 0x7f) || b === 0x0a || b === 0x0d || b === 0x09 ? String.fromCharCode(b) : '.').join('')
}
