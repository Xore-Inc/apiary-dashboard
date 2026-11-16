// One detonation's full record, in the real run page's sections: verdict
// (what it concluded, on which route), behavior (what the payload did),
// network (both packet captures), file forensics (Windows samples: the PE
// itself), diagnostics (how the run went), and raw. Long logs fold away;
// nothing here offers the sample's bytes.
import { apiHref } from '#/lib/apiHref'
import { Link } from '@astryxdesign/core/Link'
import { useState } from 'react'
import { ConfirmDialog } from '#/components/AppDialog'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { CodeBlock } from '@astryxdesign/core/CodeBlock'
import { Collapsible } from '@astryxdesign/core/Collapsible'
import { Grid } from '@astryxdesign/core/Grid'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Table, pixel, proportional } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import { MiniTable, Panel, StatTile } from '../DashboardBlocks'
import { TechniquesPanel } from '../DetailBlocks'
import type { GoldenImageStatus, SandboxRun, WindowsForensics } from '#/data/types'
import { AnalyzerSection } from './AnalyzerSection'
import { queuePayloadActionWrite } from '#/data/writes'
import { useDataMutation } from '#/lib/mutation'
import { formatDateTime, formatNumber } from '#/lib/format'
import { EntityLink } from '../EntityLink'
import { useIsAdmin } from '#/lib/session'
import { useGuardedAction } from '#/lib/useGuardedAction'

const VERDICT_COLOR = { malicious: 'red', suspicious: 'orange', benign: 'green' } as const

/** The sections of the Sandbox tab; File forensics only for Windows runs. */
export const SANDBOX_SECTIONS = [
  { id: 'verdict', label: 'Verdict' },
  { id: 'behavior', label: 'Behavior' },
  { id: 'network', label: 'Network' },
  { id: 'file', label: 'File forensics' },
  { id: 'diagnostics', label: 'Diagnostics' },
  { id: 'raw', label: 'Raw' },
] as const
export type SandboxSection = (typeof SANDBOX_SECTIONS)[number]['id']

function List({ items, empty = 'Nothing recorded.' }: { items: string[]; empty?: string }) {
  return items.length ? (
    <VStack gap={1}>
      {items.map((item) => (
        // Paths and command lines run long; they break rather than spill.
        <div key={item} style={{ overflowWrap: 'anywhere' }}>
          <Text type="code">{item}</Text>
        </div>
      ))}
    </VStack>
  ) : (
    <Text type="supporting">{empty}</Text>
  )
}

/** A log or dump, folded until asked for; an empty one says so. */
function Evidence({ title, body, open = false }: { title: string; body: string; open?: boolean }) {
  return (
    <Collapsible trigger={title} defaultIsOpen={open}>
      {body.trim() ? <CodeBlock isWrapped code={body} language="text" maxHeight={320} /> : <Text type="supporting">Empty for this run.</Text>}
    </Collapsible>
  )
}

const bytes = (n: number) => (n >= 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(1)} MiB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KiB` : `${n} B`)

// ---- Sections ------------------------------------------------------------------------

function Verdict({ run }: { run: SandboxRun }) {
  return (
    <VStack gap={4}>
      <Grid columns={{ minWidth: 340, repeat: 'fit' }} gap={4}>
        <Panel title="What this run concluded">
          <MetadataList label={{ position: 'start', width: 120 }}>
            <MetadataListItem label="Verdict">
              <Token size="sm" color={VERDICT_COLOR[run.verdict]} label={run.verdict} />
            </MetadataListItem>
            <MetadataListItem label="Dynamic risk">{`${run.risk} / 100`}</MetadataListItem>
            <MetadataListItem label="Platform">{run.platform}</MetadataListItem>
          </MetadataList>
        </Panel>
        <Panel title="Run identity and route">
          <MetadataList label={{ position: 'start', width: 120 }}>
            <MetadataListItem label="Route">
              <Token size="sm" label={run.route.name} />
            </MetadataListItem>
            <MetadataListItem label="Guest">{`${run.route.vm} · ${run.route.snapshot}`}</MetadataListItem>
            <MetadataListItem label="Job">
              <Text type="code">{run.job.slice(0, 24)}</Text>
            </MetadataListItem>
            <MetadataListItem label="Detonated">{formatDateTime(run.at)}</MetadataListItem>
          </MetadataList>
        </Panel>
      </Grid>
      <Grid columns={{ minWidth: 300, repeat: 'fit' }} gap={4}>
        <Panel title="IOCs: static analysis">
          <List items={run.iocsStatic} />
        </Panel>
        <Panel title="IOCs: observed at runtime">
          <List items={run.iocsDynamic} />
        </Panel>
      </Grid>
      <TechniquesPanel techniques={run.techniques} />
    </VStack>
  )
}

function Behavior({ run }: { run: SandboxRun }) {
  const added = run.sockets.after.filter((s) => !run.sockets.before.includes(s))
  const removed = run.sockets.before.filter((s) => !run.sockets.after.includes(s))
  return (
    <VStack gap={4}>
      <Grid columns={{ minWidth: 320, repeat: 'fit' }} gap={4}>
        <MiniTable title="Top system calls" header="Syscall" rows={run.syscalls} isCode />
        <Panel title="Created or changed paths">
          <List items={run.changedPaths} />
        </Panel>
        <Panel title="Process difference">
          <Text type="label">{`Added (${run.processes.added.length})`}</Text>
          <List items={run.processes.added} empty="No new processes." />
          <Text type="label">{`Removed (${run.processes.removed.length})`}</Text>
          <List items={run.processes.removed} empty="Nothing stopped." />
        </Panel>
        <Panel title="Socket difference">
          <Text type="label">{`Added (${added.length})`}</Text>
          <List items={added} empty="No new sockets." />
          <Text type="label">{`Removed (${removed.length})`}</Text>
          <List items={removed} empty="Nothing closed." />
          <Evidence title="Sockets before detonation" body={run.sockets.before.join('\n')} />
          <Evidence title="Sockets after detonation" body={run.sockets.after.join('\n')} />
        </Panel>
      </Grid>
      <Panel title="Process output">
        <Evidence title="Standard output" body={run.stdout} open />
        <Evidence title="Standard error" body={run.stderr} />
      </Panel>
    </VStack>
  )
}

function Network({ run }: { run: SandboxRun }) {
  const n = run.network
  const s = run.staticIocs
  const confirmed = (value: string) => run.iocsDynamic.some((d) => d.includes(value))
  const staticRows = [...s.remoteIps.map((v) => ['remote IP', v] as const), ...s.downloadUrls.map((v) => ['download URL', v] as const), ...s.uncPaths.map((v) => ['UNC path', v] as const)]
  return (
    <VStack gap={4}>
      <Grid columns={{ minWidth: 170, repeat: 'fit' }} gap={4}>
        <StatTile label="Host packets" value={run.packets} />
        <StatTile label="Host bytes" value={n.bytes} />
        <StatTile label="Guest packets" value={n.guest.packets} />
        <StatTile label="Download cradles" value={s.downloadCradles} />
      </Grid>
      <Grid columns={{ minWidth: 340, repeat: 'fit' }} gap={4}>
        <Panel title="Connections">
          <Table
            data={run.connections.map((c, i) => ({ ...c, id: String(i) }))}
            columns={[
              { key: 'proto', header: 'Proto', width: pixel(72) },
              { key: 'dst', header: 'Destination', width: proportional(2), renderCell: (row) => <Text type="code">{`${row.dst}:${row.port}`}</Text> },
              { key: 'bytes', header: 'Bytes', width: pixel(96), align: 'end', renderCell: (row) => formatNumber(row.bytes) },
            ]}
            idKey="id"
            density="compact"
          />
          <Text type="label">Remote addresses reached</Text>
          <List items={n.remoteIps} />
        </Panel>
        <Panel title="DNS">
          <List items={run.dns} empty="No DNS queries." />
          <MiniTable title="Protocols on the host bridge" header="Protocol" rows={n.protocols} />
        </Panel>
      </Grid>
      <Panel title="Host bridge capture">
        <Evidence title="Packet log" body={n.hostEvents.join('\n')} />
        <Evidence title="Connect attempts" body={n.attempts.join('\n')} />
      </Panel>
      <Panel title="Guest and loopback capture">
        <Text type="supporting">{`${formatNumber(n.guest.packets)} packets, ${bytes(n.guest.pcapBytes)} of pcap inside the guest: traffic the host bridge never sees.`}</Text>
        <MiniTable title="" header="Protocol" rows={n.guest.protocols} />
        <Evidence title="Guest packet log" body={n.guest.events.join('\n')} />
      </Panel>
      <Panel title="IOCs: static versus dynamic">
        {staticRows.length === 0 ? (
          <Text type="supporting">The static pass found no network indicators.</Text>
        ) : (
          <Table
            data={staticRows.map(([kind, value]) => ({ id: `${kind}:${value}`, kind, value }))}
            columns={[
              { key: 'kind', header: 'Found statically', width: pixel(140) },
              { key: 'value', header: 'Value', width: proportional(3), renderCell: (row) => <Text type="code">{row.value}</Text> },
              { key: 'id', header: 'At runtime', width: pixel(160), renderCell: (row) => (confirmed(row.value) ? <Token size="sm" color="red" label="confirmed" /> : <Token size="sm" label="not seen" />) },
            ]}
            idKey="id"
            density="compact"
          />
        )}
      </Panel>
    </VStack>
  )
}

function FileForensics({ w }: { w: WindowsForensics }) {
  return (
    <VStack gap={4}>
      <Grid columns={{ minWidth: 340, repeat: 'fit' }} gap={4}>
        <Panel title="What the file is">
          <MetadataList label={{ position: 'start', width: 132 }}>
            <MetadataListItem label="Type">{`${w.peType} ${w.isDll ? 'DLL' : 'executable'} · ${w.subsystem}`}</MetadataListItem>
            <MetadataListItem label="Machine">{w.machine}</MetadataListItem>
            <MetadataListItem label="Image base">
              <Text type="code">{w.imageBase}</Text>
            </MetadataListItem>
            <MetadataListItem label="Entry point">
              <Text type="code">{w.entryPoint}</Text>
            </MetadataListItem>
            <MetadataListItem label="Compiled">{formatDateTime(w.compileTimestamp)}</MetadataListItem>
            <MetadataListItem label="imphash">
              <Text type="code">{w.imphash}</Text>
            </MetadataListItem>
            <MetadataListItem label="Signature">{w.signaturePresent ? <Token size="sm" color="orange" label="present, check the chain" /> : <Token size="sm" label="unsigned" />}</MetadataListItem>
          </MetadataList>
        </Panel>
        <Panel title="Suspicious Windows API imports">
          <Table
            data={w.suspiciousImports.map((i) => ({ ...i, id: i.name }))}
            columns={[
              { key: 'name', header: 'Import', width: proportional(2), renderCell: (row) => <Text type="code">{row.name}</Text> },
              { key: 'library', header: 'Library', width: pixel(120), renderCell: (row) => <Text type="supporting">{row.library}</Text> },
              { key: 'why', header: 'Why it matters', width: proportional(3) },
            ]}
            idKey="id"
            density="compact"
          />
        </Panel>
      </Grid>
      <Panel title="PE sections">
        <Table
          data={w.sections.map((s) => ({ ...s, id: s.name }))}
          columns={[
            { key: 'name', header: 'Section', width: pixel(96), renderCell: (row) => <Text type="code">{row.name}</Text> },
            { key: 'virtualSize', header: 'Virtual', width: pixel(96), align: 'end', renderCell: (row) => formatNumber(row.virtualSize) },
            { key: 'rawSize', header: 'Raw', width: pixel(96), align: 'end', renderCell: (row) => formatNumber(row.rawSize) },
            { key: 'entropy', header: 'Entropy', width: pixel(144), align: 'end', renderCell: (row) => (row.entropy >= 7.2 ? <Token size="sm" color="orange" label={`${row.entropy.toFixed(2)} packed?`} /> : row.entropy.toFixed(2)) },
            { key: 'characteristics', header: 'Characteristics', width: proportional(3), renderCell: (row) => <Text type="supporting">{row.characteristics}</Text> },
          ]}
          idKey="id"
          density="compact"
        />
      </Panel>
      <Grid columns={{ minWidth: 340, repeat: 'fit' }} gap={4}>
        <Panel title="Imported libraries and symbols">
          <VStack gap={2}>
            {w.imports.map((lib) => (
              <VStack key={lib.library} gap={0.5}>
                <Text type="label">{lib.library}</Text>
                <Text type="code">{lib.symbols.join(', ')}</Text>
              </VStack>
            ))}
          </VStack>
        </Panel>
        <Panel title="Exports, warnings and metadata">
          <Text type="label">Exports</Text>
          <List items={w.exports} empty="No exports." />
          <Text type="label">Parser warnings</Text>
          <List items={w.warnings} empty="No warnings." />
          <Evidence title="ExifTool" body={w.exiftool} />
        </Panel>
      </Grid>
      <Panel title="Signing and strings">
        <Evidence title="Authenticode inspection" body={w.authenticode} open />
        <Evidence title="ASCII strings" body={w.asciiStrings.join('\n')} />
        <Evidence title="UTF-16LE strings" body={w.utf16Strings.join('\n')} />
      </Panel>
    </VStack>
  )
}

function Diagnostics({ run }: { run: SandboxRun }) {
  const l = run.logs
  return (
    <VStack gap={4}>
      {(l.classifierError || l.peParserError) && (
        <Banner status="warning" title="Part of the analysis did not complete" description={[l.classifierError, l.peParserError].filter(Boolean).join(' · ')} />
      )}
      <Panel title="How the run itself went">
        <MetadataList label={{ position: 'start', width: 136 }}>
          {Object.entries(run.diagnostics).map(([k, v]) => (
            <MetadataListItem key={k} label={k}>
              {v}
            </MetadataListItem>
          ))}
        </MetadataList>
      </Panel>
      <Panel title="Runtime and collection logs">
        <Evidence title="Guest kernel" body={l.kernel} />
        <Evidence title="Host tcpdump log" body={l.hostTcpdump} />
        <Evidence title="Guest tcpdump log" body={l.guestTcpdump} />
        {l.classifierError && <Evidence title="Classifier error" body={l.classifierError} />}
        {l.peParserError && <Evidence title="PE parser error" body={l.peParserError} />}
      </Panel>
      <Panel title="Sandbox infrastructure">
        <Evidence title="Guest serial console" body={l.serialConsole} />
        <Evidence title="QEMU log" body={l.qemu} />
        <Evidence title="Domain state" body={l.domainState} />
      </Panel>
    </VStack>
  )
}

function Raw({ run }: { run: SandboxRun }) {
  return (
    <VStack gap={4}>
      <Panel title="Exported artifacts">
        <Table
          data={run.exported.map((a) => ({ ...a, id: a.name }))}
          columns={[
            { key: 'name', header: 'File', width: proportional(2), renderCell: (row) => <Link href={apiHref(`/api/artifact/sandbox/${encodeURIComponent(run.job)}/${encodeURIComponent(row.name)}`)}>{row.name}</Link> },
            { key: 'size', header: 'Size', width: pixel(96), align: 'end', renderCell: (row) => bytes(row.size) },
            { key: 'sha256', header: 'SHA-256', width: proportional(3), renderCell: (row) => <Text type="code">{row.sha256}</Text> },
          ]}
          idKey="id"
          density="compact"
        />
      </Panel>
      <Panel title="Behavior record">
        <CodeBlock isWrapped code={JSON.stringify(run, null, 2)} language="json" maxHeight={560} />
      </Panel>
    </VStack>
  )
}

// ---- The result -------------------------------------------------------------------

/** What the Windows golden image means for the next detonation: nothing
 * when it is fine (no news), otherwise why a rerun may come back thin. It
 * never blocks the rerun. */
function goldenImageNote(g: GoldenImageStatus): { color: 'red' | 'orange' | 'default'; label: string; detail: string } | null {
  if (g.error) return { color: 'red', label: 'Golden image missing', detail: g.error }
  if (g.staleIsoEval) return { color: 'red', label: `Golden image ${g.ageDays} d old`, detail: 'The evaluation ISO it was built from has likely expired (90-day limit): a full rebuild is due.' }
  if (g.staleMonthly) return { color: 'orange', label: `Golden image ${g.ageDays} d old`, detail: `Past the monthly rebuild cadence. Built ${formatDateTime(g.builtAt)}, checked ${formatDateTime(g.checkedAt)}.` }
  if (g.checksumWritten && !g.checksumVerified) return { color: 'default', label: 'Checksum unverified', detail: 'Not yet verified against a live clone this build.' }
  return null
}

function GoldenImageNote({ image }: { image: GoldenImageStatus }) {
  const note = goldenImageNote(image)
  if (!note) return null
  return (
    <Tooltip content={note.detail} focusTrigger="always">
      <Token size="sm" color={note.color} label={note.label} />
    </Tooltip>
  )
}

export function SandboxResult({ run, section }: { run: SandboxRun; section: SandboxSection }) {
  // Queuing invalidates the payload's analysis reads (data/writes.ts).
  const queue = useDataMutation(queuePayloadActionWrite())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const isAdmin = useIsAdmin()
  const { error, guard, clearError } = useGuardedAction()
  const [queued, setQueued] = useState<string | null>(null)
  // File forensics is for Windows samples; elsewhere it falls back to the verdict.
  const shown = section === 'file' && !run.windows ? 'verdict' : section

  return (
    <AnalyzerSection
      title="Sandbox result"
      description="One detonation's full behavior record: verdict, platform, and every exported artifact."
      actions={
        <HStack gap={2} vAlign="center">
          <Token size="sm" color={VERDICT_COLOR[run.verdict]} label={run.verdict} />
          {run.goldenImage && <GoldenImageNote image={run.goldenImage} />}
          {isAdmin && <Button label="Re-analyze" size="sm" variant="secondary" onClick={() => setConfirmOpen(true)} />}
        </HStack>
      }
    >
      <VStack gap={5}>
        <HStack gap={3} wrap="wrap" vAlign="center">
          <EntityLink kind="payload" id={run.hash}>
            <Text type="code">{`${run.hash.slice(0, 24)}…`}</Text>
          </EntityLink>
          <Text type="supporting">{`detonated ${formatDateTime(run.at)} · ${run.route.name} · ${run.durationSeconds} s`}</Text>
        </HStack>
        {queued && <Banner status="success" title={queued} isDismissable onDismiss={() => setQueued(null)} />}
        {shown === 'verdict' && <Verdict run={run} />}
        {shown === 'behavior' && <Behavior run={run} />}
        {shown === 'network' && <Network run={run} />}
        {shown === 'file' && run.windows && <FileForensics w={run.windows} />}
        {shown === 'diagnostics' && <Diagnostics run={run} />}
        {shown === 'raw' && <Raw run={run} />}
      </VStack>
      {error && <Banner status="error" title="Not queued" description={error} isDismissable onDismiss={clearError} />}
      <ConfirmDialog
        isOpen={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Detonate this sample again?"
        description="Queues a fresh sandbox run. The current result stays until the new one completes."
        actionLabel="Re-analyze"
        actionVariant="primary"
        onAction={async () => {
          setConfirmOpen(false)
          setQueued((await guard(() => queue.mutateAsync([run.hash, 'sandbox']))) ?? null)
        }}
      />
    </AnalyzerSection>
  )
}
