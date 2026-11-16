// A Ghidra decompilation and everything run alongside it, in the real
// page's five sections: overview (what this binary is), code (what it
// contains and calls), data (what it references), deep dive (what a
// reverse-engineering session recovered), and raw. Nothing here executes the
// sample; names and strings from it are shown as text only.
import { ActionLink } from '#/components/ActionLink'
import { apiHref } from '#/lib/apiHref'
import { ArtifactList } from './ArtifactList'
import { useState } from 'react'
import { ConfirmDialog } from '#/components/AppDialog'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { CodeBlock } from '@astryxdesign/core/CodeBlock'
import { Grid } from '@astryxdesign/core/Grid'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Table, pixel, proportional } from '@astryxdesign/core/Table'
import { Heading, Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { useNavigate } from '@tanstack/react-router'
import { MiniTable, Panel, StatTile } from '../DashboardBlocks'
import { EntityLink } from '../EntityLink'
import { AnalyzerSection } from './AnalyzerSection'
import { CallGraph } from './CallGraph'
import { queuePayloadActionWrite } from '#/data/writes'
import { useDataMutation } from '#/lib/mutation'
import type { GhidraAnalysis, GhidraFunction, IocEvidence } from '#/data/types'
import { formatDateTime, formatNumber } from '#/lib/format'
import { useIsAdmin } from '#/lib/session'
import { useGuardedAction } from '#/lib/useGuardedAction'
import { AiGenerated } from '../AiGenerated'

/** The sections of the Ghidra tab, as the top bar lists them. */
export const GHIDRA_SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'code', label: 'Code' },
  { id: 'data', label: 'Data' },
  { id: 'deepdive', label: 'Deep dive' },
  { id: 'raw', label: 'Raw' },
] as const
export type GhidraSection = (typeof GHIDRA_SECTIONS)[number]['id']

const code = (value: string) => <Text type="code">{value}</Text>

/** Model-written text says so, with the deployment's disclaimer. */
const AiAdvisory = AiGenerated

// ---- Overview: what this binary is ------------------------------------------

function Overview({ g }: { g: GhidraAnalysis }) {
  const { lief, floss } = g
  return (
    <VStack gap={4}>
      <Grid columns={{ minWidth: 170, repeat: 'fit' }} gap={4}>
        <StatTile label="Functions found" value={g.functionsTotal} />
        <StatTile label="Deepened" value={g.functions.length} />
        <StatTile label="Imports" value={g.imports.length} />
        <StatTile label="Capabilities" value={g.capa.length} />
      </Grid>
      <Grid columns={{ minWidth: 340, repeat: 'fit' }} gap={4}>
        <Panel title="Analysis run">
          <MetadataList label={{ position: 'start', width: 120 }}>
            <MetadataListItem label="Requested">{formatDateTime(g.run.requestedAt)}</MetadataListItem>
            <MetadataListItem label="Started">{formatDateTime(g.run.startedAt)}</MetadataListItem>
            <MetadataListItem label="Completed">{formatDateTime(g.run.completedAt)}</MetadataListItem>
            <MetadataListItem label="Exit">
              <Token size="sm" color={g.run.exitStatus === 'ok' ? 'green' : 'red'} label={g.run.exitStatus} />
            </MetadataListItem>
          </MetadataList>
          {g.run.error && <Banner status="warning" title="Partial result" description={g.run.error} />}
        </Panel>
        <Panel title="Structure (LIEF)">
          <MetadataList label={{ position: 'start', width: 120 }}>
            <MetadataListItem label="Format">{`${lief.format} · ${lief.architecture}`}</MetadataListItem>
            <MetadataListItem label="Entry point">{code(lief.entrypoint)}</MetadataListItem>
            <MetadataListItem label="Properties">
              <HStack gap={1} wrap="wrap">
                <Token size="sm" label={lief.isPie ? 'PIE' : 'not PIE'} />
                <Token size="sm" color={lief.stripped ? 'orange' : 'gray'} label={lief.stripped ? 'stripped' : 'symbols present'} />
                {lief.isDll !== null && <Token size="sm" label={lief.isDll ? 'DLL' : 'executable'} />}
              </HStack>
            </MetadataListItem>
            <MetadataListItem label="Sections">{String(lief.sectionCount)}</MetadataListItem>
            {lief.compileTimestamp && <MetadataListItem label="Compiled">{formatDateTime(lief.compileTimestamp)}</MetadataListItem>}
            {lief.libraries.length > 0 && <MetadataListItem label="Libraries">{lief.libraries.join(', ')}</MetadataListItem>}
          </MetadataList>
        </Panel>
        <Panel title="Automated triage" action={<AiAdvisory />}>
          <Text>{g.aiTriage.summary}</Text>
          <MetadataList label={{ position: 'start', width: 120 }}>
            <MetadataListItem label="Family guess">{g.aiTriage.familyGuess}</MetadataListItem>
            <MetadataListItem label="Behaviors">
              <HStack gap={1} wrap="wrap">
                {g.aiTriage.behaviors.map((b) => (
                  <Token key={b} size="sm" label={b} />
                ))}
              </HStack>
            </MetadataListItem>
            <MetadataListItem label="Model">{`${g.aiTriage.model} · ${g.aiTriage.confidence} confidence`}</MetadataListItem>
          </MetadataList>
        </Panel>
        <Panel title="Fuzzy hashes">
          <MetadataList label={{ position: 'start', width: 120 }}>
            <MetadataListItem label="ssdeep">{code(g.fuzzy.ssdeep)}</MetadataListItem>
            <MetadataListItem label="TLSH">{code(g.fuzzy.tlsh)}</MetadataListItem>
            <MetadataListItem label="imphash">{code(g.fuzzy.imphash)}</MetadataListItem>
          </MetadataList>
        </Panel>
      </Grid>
      <Panel title="Capabilities (capa)">
        <Table
          data={g.capa.map((c) => ({ ...c, id: c.capability }))}
          columns={[
            { key: 'capability', header: 'Capability', width: proportional(2) },
            { key: 'namespace', header: 'Namespace', width: proportional(2), renderCell: (row) => code(row.namespace) },
            { key: 'matches', header: 'Matches', width: pixel(80), align: 'end' },
            { key: 'attck', header: 'ATT&CK', width: pixel(96), renderCell: (row) => (row.attck ? <Token size="sm" label={row.attck} /> : null) },
          ]}
          idKey="id"
          density="compact"
        />
        <Grid columns={{ minWidth: 320, repeat: 'fit' }} gap={4}>
          <VStack gap={1}>
            <Text type="label">ATT&CK</Text>
            {g.capaAttack.map((a) => (
              <Text key={a.id}>
                <Text type="code">{a.id}</Text> {a.technique} <Text type="supporting">({a.tactic})</Text>
              </Text>
            ))}
          </VStack>
          <VStack gap={1}>
            <Text type="label">Malware Behavior Catalog</Text>
            {g.capaMbc.map((m) => (
              <Text key={m.id}>
                <Text type="code">{m.id}</Text> {m.objective}: {m.behavior}
              </Text>
            ))}
          </VStack>
        </Grid>
      </Panel>
      <Panel title="Obfuscated strings (FLOSS)">
        <Grid columns={{ minWidth: 240, repeat: 'fit' }} gap={4}>
          {(
            [
              ['Decoded', floss.decoded, floss.totals.decoded],
              ['Stack', floss.stack, floss.totals.stack],
              ['Tight', floss.tight, floss.totals.tight],
              ['Static', floss.static, floss.totals.static],
            ] as const
          ).map(([label, values, total]) => (
            <VStack key={label} gap={1}>
              <Text type="label">{`${label} (${formatNumber(total)})`}</Text>
              {values.map((v) => (
                <Text key={v} type="code">
                  {v}
                </Text>
              ))}
              {total > values.length && <Text type="supporting">{`+ ${formatNumber(total - values.length)} more in the raw record`}</Text>}
            </VStack>
          ))}
        </Grid>
      </Panel>
      {g.cryptoConstants.length > 0 && (
        <Panel title="Cryptographic constants">
          {g.cryptoConstants.map((c) => (
            <Text key={c.address}>
              {c.name} ({c.algorithm}) at <Text type="code">{c.address}</Text>
            </Text>
          ))}
        </Panel>
      )}
    </VStack>
  )
}

// ---- Code: what it contains and calls -----------------------------------------

function FunctionDetail({ f, onSelect }: { f: GhidraFunction; onSelect: (name: string) => void }) {
  const refs = (names: string[]) =>
    names.length === 0 ? (
      <Text type="supporting">none</Text>
    ) : (
      <HStack gap={1} wrap="wrap">
        {names.map((n) => (
          <Button key={n} label={n} size="sm" variant="ghost" onClick={() => onSelect(n)} />
        ))}
      </HStack>
    )
  return (
    <VStack gap={3}>
      <Heading level={3}>{f.name}</Heading>
      {code(f.signature)}
      <MetadataList label={{ position: 'start', width: 96 }}>
        <MetadataListItem label="Address">{code(f.address)}</MetadataListItem>
        <MetadataListItem label="Size">{`${formatNumber(f.size)} bytes`}</MetadataListItem>
        <MetadataListItem label="Called by">{refs(f.callers)}</MetadataListItem>
        <MetadataListItem label="Calls">{refs(f.callees)}</MetadataListItem>
      </MetadataList>
      <CodeBlock isWrapped code={f.decompiled} language="c" title="Decompiled" maxHeight={420} />
    </VStack>
  )
}

function Code({ g, fn, onSelect }: { g: GhidraAnalysis; fn?: string; onSelect: (name?: string) => void }) {
  const selected = g.functions.find((f) => f.name === fn)
  return (
    <VStack gap={4}>
      <Panel title="Call graph" action={<Button label="SVG" size="sm" variant="ghost" tooltip="The graph as a standalone file, no script" href={apiHref(`/api/artifact/ghidra/${g.hash}/call-graph.svg`)} />}>
        <CallGraph functions={g.functions} selected={selected?.name} onSelect={(name) => onSelect(name === selected?.name ? undefined : name)} />
      </Panel>
      <Grid columns={{ minWidth: 380, repeat: 'fit' }} gap={4}>
        <Panel title="Functions">
          <Table
            data={g.functions}
            columns={[
              { key: 'name', header: 'Function', width: proportional(2), renderCell: (row) => <Button label={row.name} size="sm" variant={row.name === selected?.name ? 'secondary' : 'ghost'} onClick={() => onSelect(row.name)} /> },
              { key: 'address', header: 'Address', width: pixel(104), renderCell: (row) => code(row.address) },
              { key: 'size', header: 'Size', width: pixel(72), align: 'end' },
              { key: 'calls', header: 'Calls', width: pixel(64), align: 'end' },
            ]}
            idKey="name"
            density="compact"
          />
          <Text type="supporting">{`The ${g.functions.length} deepened of ${formatNumber(g.functionsTotal)} functions found.`}</Text>
        </Panel>
        <MiniTable title="Imports" header="Symbol" rows={g.imports} isCode />
      </Grid>
      <Panel title="Function">{selected ? <FunctionDetail f={selected} onSelect={onSelect} /> : <Text type="supporting">Select a function in the graph or the list.</Text>}</Panel>
    </VStack>
  )
}

// ---- Data: what it references ---------------------------------------------------

type EvidenceRow = { id: string; kind: string; value: string; where: 'FLOSS only' | 'sandbox static only' | 'confirmed at runtime' }

function evidenceRows(kind: string, e: IocEvidence): EvidenceRow[] {
  return [
    ...e.confirmedAtRuntime.map((value) => ({ id: `${kind}:rt:${value}`, kind, value, where: 'confirmed at runtime' as const })),
    ...e.flossOnly.map((value) => ({ id: `${kind}:fl:${value}`, kind, value, where: 'FLOSS only' as const })),
    ...e.sandboxStaticOnly.map((value) => ({ id: `${kind}:sb:${value}`, kind, value, where: 'sandbox static only' as const })),
  ]
}

const WHERE_COLOR = { 'confirmed at runtime': 'red', 'FLOSS only': 'orange', 'sandbox static only': 'gray' } as const

function Data({ g }: { g: GhidraAnalysis }) {
  const c = g.iocCorrelation
  const rows = [...evidenceRows('IP', c.ips), ...evidenceRows('domain', c.domains), ...evidenceRows('URL', c.urls), ...evidenceRows('UNC path', c.uncPaths)]
  return (
    <VStack gap={4}>
      <Panel title="Indicators: static strings against the sandbox">
        <Text type="supporting">Where each indicator was seen. Confirmed at runtime is strongest; FLOSS only means it is in the code but never showed up when the sample ran.</Text>
        {!c.hasSandboxRun && <Banner status="info" title="No sandbox run yet" description="Nothing can be confirmed at runtime until the sample has been detonated." />}
        {rows.length === 0 ? (
          <Text type="supporting">No network indicators recovered.</Text>
        ) : (
          <Table
            data={rows}
            columns={[
              { key: 'kind', header: 'Kind', width: pixel(96) },
              { key: 'value', header: 'Value', width: proportional(3), renderCell: (row) => code(row.value) },
              { key: 'where', header: 'Seen', width: pixel(200), renderCell: (row) => <Token size="sm" color={WHERE_COLOR[row.where]} label={row.where} /> },
            ]}
            idKey="id"
            density="compact"
          />
        )}
      </Panel>
      <Panel title="Strings">
        <VStack gap={1}>
          {g.strings.map((s) => (
            <Text key={s} type="code">
              {s}
            </Text>
          ))}
        </VStack>
      </Panel>
    </VStack>
  )
}

// ---- Deep dive: what a reverse-engineering session recovered -------------------

function DeepDive({ g }: { g: GhidraAnalysis }) {
  return (
    <VStack gap={4}>
      <Panel title="Recovered types">
        <Grid columns={{ minWidth: 300, repeat: 'fit' }} gap={4}>
          {g.types.map((t) => (
            <VStack key={t.name} gap={1}>
              <HStack gap={2} vAlign="center">
                {code(t.name)}
                <Token size="sm" label={`${t.kind}, ${t.size} bytes`} />
              </HStack>
              {t.fields.map((f) => (
                <Text key={f.name} type="code">
                  {t.kind === 'enum' ? `${f.name} = ${f.type}` : `+0x${f.offset.toString(16)} ${f.type} ${f.name}`}
                </Text>
              ))}
            </VStack>
          ))}
        </Grid>
      </Panel>
      <Grid columns={{ minWidth: 380, repeat: 'fit' }} gap={4}>
        <Panel title="Globals">
          <Table
            data={g.globals.map((x) => ({ ...x, id: x.address }))}
            columns={[
              { key: 'name', header: 'Name', width: proportional(1), renderCell: (row) => code(row.name) },
              { key: 'type', header: 'Type', width: proportional(2), renderCell: (row) => code(row.type) },
              { key: 'address', header: 'Address', width: pixel(104), renderCell: (row) => code(row.address) },
              { key: 'size', header: 'Size', width: pixel(64), align: 'end' },
            ]}
            idKey="id"
            density="compact"
          />
        </Panel>
        <Panel title={`Annotations (revision ${g.annotations.revision})`}>
          <VStack gap={3}>
            {g.annotations.entries.map((a) => (
              <VStack key={a.address} gap={0.5}>
                <HStack gap={2} vAlign="center" wrap="wrap">
                  <Text weight="semibold">{a.displayName}</Text>
                  {code(a.address)}
                  {a.tags.map((tag) => (
                    <Token key={tag} size="sm" label={tag} />
                  ))}
                </HStack>
                <Text type="supporting">{a.comment}</Text>
              </VStack>
            ))}
          </VStack>
        </Panel>
      </Grid>
      <Panel title="Memory map">
        <Table
          data={g.memoryMap.map((m) => ({ ...m, id: m.name }))}
          columns={[
            { key: 'name', header: 'Block', width: pixel(96), renderCell: (row) => code(row.name) },
            { key: 'start', header: 'Range', width: pixel(200), renderCell: (row) => code(`${row.start}–${row.end}`) },
            { key: 'permissions', header: 'Perm', width: pixel(64), renderCell: (row) => code(row.permissions) },
            { key: 'size', header: 'Size', width: pixel(88), align: 'end', renderCell: (row) => formatNumber(row.size) },
            { key: 'hex', header: 'First bytes', width: proportional(3), renderCell: (row) => code(`${row.hex}  ${row.ascii}`) },
          ]}
          idKey="id"
          density="compact"
        />
      </Panel>
      <Grid columns={{ minWidth: 380, repeat: 'fit' }} gap={4}>
        <Panel title="RevDeck chat" action={<AiAdvisory />}>
          <Text type="supporting">{`${g.chat.threads.length} threads: ${g.chat.threads.map((t) => `“${t.title}” (${t.messageCount})`).join(', ')}. The latest:`}</Text>
          <VStack gap={2}>
            {g.chat.messages.map((m, i) => (
              <VStack key={i} gap={0.5}>
                <Text type="label">{m.role === 'tool' ? `tool: ${m.tool ?? ''}` : m.role}</Text>
                <Text type={m.role === 'tool' ? 'code' : undefined}>{m.content}</Text>
              </VStack>
            ))}
          </VStack>
        </Panel>
        <Panel title="Symbol recovery">
          <Text type="supporting">{`${formatNumber(g.symbolRecovery.matched)} of ${formatNumber(g.symbolRecovery.total)} functions named from known code. The rest keep Ghidra's FUN_ names.`}</Text>
          <Table
            data={g.symbolRecovery.candidates.map((c) => ({ ...c, id: c.address }))}
            columns={[
              { key: 'recovered', header: 'Recovered name', width: proportional(2), renderCell: (row) => code(row.recovered) },
              { key: 'address', header: 'Address', width: pixel(104), renderCell: (row) => code(row.address) },
              { key: 'confidence', header: 'Confidence', width: pixel(96), align: 'end', renderCell: (row) => `${Math.round(row.confidence * 100)}%` },
              { key: 'source', header: 'Source', width: proportional(2), renderCell: (row) => <Text type="supporting">{row.source}</Text> },
            ]}
            idKey="id"
            density="compact"
          />
        </Panel>
      </Grid>
    </VStack>
  )
}

// ---- The result -------------------------------------------------------------------

export function GhidraResult({ g, fn, section }: { g: GhidraAnalysis; fn?: string; section: GhidraSection }) {
  // Queuing invalidates the payload's analysis reads (data/writes.ts).
  const queue = useDataMutation(queuePayloadActionWrite())
  const sha = g.hash
  const navigate = useNavigate()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const isAdmin = useIsAdmin()
  const { error, guard, clearError } = useGuardedAction()
  const [queued, setQueued] = useState<string | null>(null)
  // The selected function lives in the URL, so a link can open it.
  const select = (name?: string) => void navigate({ to: '.', search: (prev: Record<string, unknown>) => ({ ...prev, fn: name }) })

  return (
    <AnalyzerSection
      title="Ghidra result"
      description="Headless decompilation of one captured payload. Nothing here is executed."
      actions={isAdmin ? <Button label="Re-analyze" size="sm" variant="secondary" onClick={() => setConfirmOpen(true)} /> : undefined}
    >
      <VStack gap={5}>
        <HStack gap={3} wrap="wrap" vAlign="center">
          <EntityLink kind="payload" id={sha}>
            <Text type="code">{`${sha.slice(0, 24)}…`}</Text>
          </EntityLink>
          <Text type="supporting">
            {g.arch} · analyzed {formatDateTime(g.at)}
          </Text>
          <ActionLink href={`/revdeck/${sha}`}>RevDeck walkthrough</ActionLink>
        </HStack>
        {queued && <Banner status="success" title={queued} isDismissable onDismiss={() => setQueued(null)} />}
        {section === 'overview' && <Overview g={g} />}
        {section === 'code' && <Code g={g} fn={fn} onSelect={select} />}
        {section === 'data' && <Data g={g} />}
        {section === 'deepdive' && <DeepDive g={g} />}
        {section === 'raw' && (
          <>
            <ArtifactList kind="ghidra" artifactKey={g.hash} />
            <Panel title="Analysis record">
              <CodeBlock isWrapped code={JSON.stringify(g, null, 2)} language="json" maxHeight={640} />
            </Panel>
          </>
        )}
      </VStack>
      {error && <Banner status="error" title="Not queued" description={error} isDismissable onDismiss={clearError} />}
      <ConfirmDialog
        isOpen={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Decompile this sample again?"
        description="Queues a fresh Ghidra run on the GPU queue. The current result stays until the new one completes."
        actionLabel="Re-analyze"
        actionVariant="primary"
        onAction={async () => {
          setConfirmOpen(false)
          setQueued((await guard(() => queue.mutateAsync([sha, 'ghidra']))) ?? null)
        }}
      />
    </AnalyzerSection>
  )
}
