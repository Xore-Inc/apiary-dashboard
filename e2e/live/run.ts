// Runs every live check against BETA_URL, one after another, each with its
// own SHOTS_DIR/<check> folder, and exits non-zero when any check fails or
// could not run. A session the dashboard does not accept stops the run.
//
//   BETA_URL=… BETA_STORAGE_STATE=… SHOTS_DIR=… bun e2e/live/run.ts
//   ONLY=authorization,crawl bun e2e/live/run.ts      a subset
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** In order: the crawl writes the samples the skeleton check reads. */
const CHECKS = ['authorization', 'viewer-readonly', 'standard', 'webkit-first-load', 'crawl', 'skeletons', 'features', 'a11y', 'responsive', 'perf', 'records'] as const
const only = process.env.ONLY?.split(',').map((s) => s.trim()).filter(Boolean)
const unknown = only?.filter((name) => !(CHECKS as readonly string[]).includes(name)) ?? []
if (unknown.length) {
  console.log(`unknown check(s): ${unknown.join(', ')}; known: ${CHECKS.join(', ')}`)
  process.exit(2)
}
for (const name of ['BETA_URL', 'BETA_STORAGE_STATE']) {
  if (!process.env[name]?.trim()) {
    console.log(`${name} is unset (see e2e/live/README.md)`)
    process.exit(2)
  }
}
const root = process.env.SHOTS_DIR?.trim() || mkdtempSync(join(tmpdir(), 'apiary-live-'))
const OUTCOME: Record<number, string> = { 0: 'PASS', 1: 'FAIL', 2: 'SKIPPED', 3: 'SESSION' }
const results: Array<{ name: string; code: number; seconds: number }> = []
let authorizationFailed = false

for (const name of CHECKS) {
  if (only && !only.includes(name)) continue
  if (name === 'viewer-readonly' && (authorizationFailed || (only && !only.includes('authorization')))) {
    console.log(`\n==> ${name}\nSKIP authorization.ts did not pass in this run, so no write is sent`)
    results.push({ name, code: 2, seconds: 0 })
    continue
  }
  const shots = join(root, name)
  mkdirSync(shots, { recursive: true })
  console.log(`\n==> ${name}`)
  const started = Date.now()
  const env = { ...process.env, SHOTS_DIR: shots, ...(name === 'skeletons' && !process.env.SAMPLES ? { SAMPLES: join(root, 'crawl', 'samples.json') } : {}) }
  const child = Bun.spawn(['bun', join(import.meta.dirname, `${name}.ts`)], { env, stdout: 'inherit', stderr: 'inherit' })
  const code = await child.exited
  results.push({ name, code, seconds: Math.round((Date.now() - started) / 1000) })
  // viewer-readonly sends writes that change data if the guard is broken:
  // never without authorization.ts having proven every refusal first.
  if (name === 'authorization' && code !== 0) authorizationFailed = true
  if (code === 3) {
    console.log('\nthe session was not accepted: refresh BETA_STORAGE_STATE and run again')
    break
  }
}

console.log('\nsummary')
for (const r of results) console.log(`  ${(OUTCOME[r.code] ?? `EXIT ${r.code}`).padEnd(8)} ${r.name.padEnd(16)} ${r.seconds} s`)
const ok = results.length > 0 && results.every((r) => r.code === 0) && (!only || results.length === only.length)
console.log(ok ? 'ALL PASS' : 'NOT ALL PASSED')
process.exit(ok ? 0 : 1)
