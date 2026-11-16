// Public-repository safety: fails when a tracked file carries a deployment
// secret, a real deployment address, or test data outside the documentation
// ranges. The same gate as APIARY's scripts/check-public-leaks.py, plus the
// rewrite's own rule that the literal inputs of tests, the live checks and
// the design studio use RFC 5737 addresses and reserved domains only.
//
//   bun scripts/check-public-leaks.ts
import { readFileSync } from 'node:fs'

// Joined at runtime, split mid-word, so this file never carries the values
// it bans as greppable text.
const literal = (...parts: string[]) => parts.join('')
const FORBIDDEN: Array<[string, string]> = [
  [literal('xo', 're.ro', 'cks'), 'deployment-specific public domain'],
  [literal('87.1', '06.16', '2.235'), 'deployment-specific VPS address'],
  [literal('192.1', '68.4', '2.'), 'deployment-specific home network address'],
  [literal('10.8', '.0.'), 'deployment-specific WireGuard address'],
  [literal('chang', 'eme1', '23'), 'known default password'],
]

const PATTERNS: Array<[RegExp, string]> = [
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, 'private key'],
  [/\bgh[opsu]_[A-Za-z0-9]{30,}\b/g, 'GitHub token'],
  [/\bAKIA[0-9A-Z]{16}\b/g, 'AWS access key'],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, 'Slack token'],
  [/^[ \t]*[A-Z][A-Z0-9_]*(?:PASSWORD|PASSWD|SECRET|TOKEN|API_KEY)[ \t]*=[ \t]*(?!["']?\$[{(]|["']?<|["']?(?:smoke|test|dummy|example)\b|$)[^#\s]{8,}/gm, 'literal credential assignment'],
  [/https?:\/\/[^/\s:@]+:[^/\s@]+@([^/\s:@?#]+)/gi, 'credential embedded in URL'],
]
const RESERVED_HOST = /\.(example|test|invalid|localhost)\.?$/i

/** Test data may name only documentation, private-use and loopback
 * addresses: RFC 5737, RFC 1918, 127/8 and 0/8. The live checks find real
 * addresses at run time and never write one down. */
const TEST_DATA = (file: string) => /\.test\.tsx?$/.test(file) || file.startsWith('e2e/') || file.startsWith('design-studio/') || file.startsWith('src/data/__fixtures__/')
// Not after a slash: `Chrome/126.0.0.0` is a version, not an address.
const IPV4 = /(?<![\d./])(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?![\d.])/g
function allowedAddress(a: number, b: number, c: number): boolean {
  if ((a === 192 && b === 0 && c === 2) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113)) return true
  if (a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return true
  return false
}

const BINARY = /\.(pcap|pcapng|qcow2|img|p12|pfx|key|pem)$/i
const SKIP = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|pdf)$/i

const files = Bun.spawnSync(['git', 'ls-files', '-co', '--exclude-standard']).stdout.toString().split('\n').filter(Boolean)
const findings: string[] = []
const lineOf = (text: string, index: number) => text.slice(0, index).split('\n').length

for (const file of files) {
  if (file.startsWith('graphify-out/') || file === 'scripts/check-public-leaks.ts') continue
  if (BINARY.test(file)) {
    findings.push(`${file}: private or runtime binary must not be committed`)
    continue
  }
  if (/(^|\/)\.env$/.test(file)) {
    findings.push(`${file}: a deployment .env must not be committed`)
    continue
  }
  if (SKIP.test(file)) continue
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    continue
  }
  const lowered = text.toLowerCase()
  for (const [value, reason] of FORBIDDEN) if (lowered.includes(value)) findings.push(`${file}: contains a ${reason}`)
  for (const [pattern, reason] of PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      if (reason === 'credential embedded in URL' && RESERVED_HOST.test(match[1])) continue
      findings.push(`${file}:${lineOf(text, match.index)}: possible ${reason}`)
    }
  }
  if (TEST_DATA(file)) {
    for (const match of text.matchAll(IPV4)) {
      const [a, b, c, d] = match.slice(1).map(Number)
      if ([a, b, c, d].some((n) => n > 255) || allowedAddress(a, b, c)) continue
      findings.push(`${file}:${lineOf(text, match.index)}: test data names ${match[0]}, outside the documentation ranges`)
    }
  }
}

if (findings.length) {
  console.error('Public-repository safety check failed:')
  for (const finding of [...new Set(findings)].sort()) console.error(`  - ${finding}`)
  process.exit(1)
}
console.log(`Public-repository safety check passed (${files.length} files).`)
