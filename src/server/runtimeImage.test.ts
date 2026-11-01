// The runtime image copies server.ts and an explicit list of the server
// files it imports (Dockerfile). A new import missing from that list builds
// and passes every other gate, then the image cannot start.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(import.meta.dirname, '../..')
const localImports = (file: string): string[] =>
  [...readFileSync(join(root, file), 'utf8').matchAll(/^import [^'"]*['"](\.{1,2}\/[^'"]+)['"]/gm)].map((m) => {
    const base = normalize(join(dirname(file), m[1]))
    return existsSync(join(root, `${base}.ts`)) ? `${base}.ts` : base
  })

describe('runtime image', () => {
  it('copies every file server.ts loads, transitively', () => {
    const copied = readFileSync(join(root, 'Dockerfile'), 'utf8')
      .split('\n')
      .filter((line) => line.startsWith('COPY ') && !line.includes('--from'))
      .flatMap((line) => line.split(/\s+/).slice(1, -1))
    const seen = new Set<string>()
    const queue = localImports('server.ts')
    for (let file = queue.shift(); file; file = queue.shift()) {
      if (seen.has(file)) continue
      seen.add(file)
      queue.push(...localImports(file))
    }
    expect([...seen].filter((file) => !copied.includes(file))).toEqual([])
  })
})
