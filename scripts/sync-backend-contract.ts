// Refreshes the pinned backend contract (#244):
//   bun scripts/sync-backend-contract.ts [ref]      (ref: branch, tag or sha; default main)
//
// Fetches backend-service's committed openapi.json from Xore-Inc/APIARY at
// `ref` with the gh CLI and writes it to contracts/backend/openapi.json
// beside contracts/backend/SOURCE.json, which records the exact commit.
// After a refresh run `bun run test`: src/data/contract.test.ts shows what
// the hand-written contracts or SUPPORTED_API_VERSIONS must follow.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO = 'Xore-Inc/APIARY'
const PATH = 'arcane/home/honeypot-dashboard/backend-service/openapi.json'
const dir = join(import.meta.dirname, '..', 'contracts', 'backend')

const gh = (...args: string[]) => {
  const run = Bun.spawnSync(['gh', 'api', ...args])
  if (!run.success) throw new Error(`gh api ${args[0]} failed: ${run.stderr.toString().trim()}`)
  return run.stdout.toString()
}

const ref = process.argv[2] ?? 'main'
const sha = gh(`repos/${REPO}/commits/${ref}`, '--jq', '.sha').trim()
const document = gh('-H', 'Accept: application/vnd.github.raw', `repos/${REPO}/contents/${PATH}?ref=${sha}`)
const version = JSON.parse(document).info?.['x-api-version']
if (typeof version !== 'number') throw new Error(`${REPO}@${sha} publishes no info.x-api-version; refusing to pin it`)

writeFileSync(join(dir, 'openapi.json'), document)
writeFileSync(join(dir, 'SOURCE.json'), `${JSON.stringify({ repo: REPO, path: PATH, ref, sha, apiVersion: version }, null, 2)}\n`)
console.log(`pinned ${REPO}@${sha.slice(0, 10)} (api_version ${version})`)
