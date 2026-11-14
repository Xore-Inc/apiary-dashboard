// The files an analysis run leaves behind, as the artifact store lists them:
// Ghidra's exports per sample, the sandbox's per job. Each file's content is
// built from the run itself, so what downloads matches what the page shows.
import type { GhidraAnalysis, GhidraFunction, SandboxRun } from '../types'

export type ArtifactKind = 'ghidra' | 'sandbox'

export interface ArtifactFile {
  filename: string
  kind: string
  contentType: string
  body: string | Uint8Array
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`

const escapeXml = (text: string) => text.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** The mock's stand-in for Ghidra's call-graph export: a static SVG listing
 * each function and what it calls (the real file comes from the analyzer;
 * the page draws the graph itself, with cytoscape). */
function callGraphSvg(functions: GhidraFunction[]): string {
  const rows = functions.map((f, i) => `<text x="16" y="${28 + i * 20}">${escapeXml(f.name)} @ ${escapeXml(f.address)}${f.callees.length ? ` → ${escapeXml(f.callees.join(', '))}` : ''}</text>`)
  const height = 40 + functions.length * 20
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="${height}" viewBox="0 0 720 ${height}" font-family="monospace" font-size="12" fill="#202124">`,
    '<rect width="100%" height="100%" fill="#ffffff"/>',
    ...rows,
    '</svg>',
    '',
  ].join('\n')
}

/** An empty capture in the classic pcap format: the header, no packets. */
function emptyPcap(): Uint8Array {
  const view = new DataView(new ArrayBuffer(24))
  view.setUint32(0, 0xa1b2c3d4, true)
  view.setUint16(4, 2, true)
  view.setUint16(6, 4, true)
  view.setUint32(16, 65535, true)
  view.setUint32(20, 1, true)
  return new Uint8Array(view.buffer)
}

export function ghidraArtifacts(a: GhidraAnalysis): ArtifactFile[] {
  return [
    { filename: 'decompiled.c', kind: 'decompilation', contentType: 'text/x-c', body: a.functions.map((f) => `// ${f.name} @ ${f.address}\n${f.decompiled}\n`).join('\n') },
    { filename: 'call-graph.svg', kind: 'call graph', contentType: 'image/svg+xml', body: callGraphSvg(a.functions) },
    { filename: 'functions.json', kind: 'functions', contentType: 'application/json', body: json(a.functions.map(({ decompiled: _, ...f }) => f)) },
    { filename: 'capa.json', kind: 'capabilities', contentType: 'application/json', body: json({ capabilities: a.capa, attack: a.capaAttack, mbc: a.capaMbc }) },
    { filename: 'floss-strings.txt', kind: 'strings', contentType: 'text/plain', body: (['decoded', 'stack', 'tight', 'static'] as const).map((k) => `# ${k}\n${a.floss[k].join('\n')}\n`).join('\n') },
    { filename: 'lief.json', kind: 'binary format', contentType: 'application/json', body: json({ ...a.lief, fuzzy: a.fuzzy }) },
  ]
}

/** The files the sandbox exported (the run lists them); the captures are
 * empty here, the real ones hold the detonation's traffic. */
export function sandboxArtifacts(run: SandboxRun): ArtifactFile[] {
  const content: Partial<Record<string, Omit<ArtifactFile, 'filename'>>> = {
    'behavior.json': { kind: 'report', contentType: 'application/json', body: json(run) },
    'host.pcap': { kind: 'capture', contentType: 'application/vnd.tcpdump.pcap', body: emptyPcap() },
    'guest.pcap': { kind: 'capture', contentType: 'application/vnd.tcpdump.pcap', body: emptyPcap() },
    'console.log': { kind: 'console', contentType: 'text/plain', body: `${run.stdout}\n--- stderr ---\n${run.stderr}\n` },
  }
  return run.exported.flatMap((e) => {
    const file = content[e.name]
    return file ? [{ filename: e.name, ...file }] : []
  })
}

export const sizeOf = (body: string | Uint8Array) => (typeof body === 'string' ? new TextEncoder().encode(body).length : body.length)
