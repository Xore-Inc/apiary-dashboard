/**
 * Launch an analysis run: pick a captured sample, pick analyzers, set the
 * options each of them takes, and queue it. Used by Analysis results, Captured
 * payloads, and a payload's own page (which opens it with its hash).
 *
 * The analyzers, their default options and the bounds each option must fall
 * within all come from the backend's catalogue for the picked sample.
 */
import { useEffect, useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Card } from '@astryxdesign/core/Card'
import { CheckboxList, CheckboxListItem } from '@astryxdesign/core/CheckboxList'
import { Collapsible } from '@astryxdesign/core/Collapsible'
import { FormLayout } from '@astryxdesign/core/FormLayout'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { Selector } from '@astryxdesign/core/Selector'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { getAnalysisResults, getAnalyzerCatalog, getPayloads } from '#/data/queries'
import { startAnalysisRunWrite } from '#/data/writes'
import { useDataMutation } from '#/lib/mutation'
import type { AnalysisRunConfig, AnalyzerCatalog, AnalyzerId, AnalyzerInfo, AnalyzerOptions, CapturedPayload, WorkbenchRecipe, WorkbenchRun } from '#/data/types'
import { formatNumber } from '#/lib/format'
import { FilterSelect } from '../FilterSelect'
import { WizardDialog, statusOf } from '../WizardDialog'

function defaults(hash: string): AnalysisRunConfig {
  return { hash, analyzers: ['static', 'yara'], options: {} }
}

const ANALYZER_NOUN: Record<AnalyzerId, string> = { static: 'Static analysis', yara: 'YARA', sandbox: 'Linux sandbox', cape: 'CAPE (Windows)', ghidra: 'Ghidra', revdeck: 'RevDeck', github: 'GitHub scanners' }

/** A recipe's options for the analyzers it runs, over the rest of the config. */
function fromRecipe(config: AnalysisRunConfig, recipe: WorkbenchRecipe, applicable: (id: AnalyzerId) => boolean): AnalysisRunConfig {
  const picked = recipe.analyzers.filter((a) => applicable(a.analyzerId))
  return { ...config, analyzers: picked.map((a) => a.analyzerId), options: { ...config.options, ...Object.fromEntries(picked.map((a) => [a.analyzerId, a.options])) } }
}

const inRange = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max

/** Messages for the options that fall outside the backend's bounds, keyed by
 * the field they sit under. */
function optionProblems(id: AnalyzerId, own: AnalyzerOptions, info: AnalyzerInfo): Record<string, string> {
  const s = info.optionSchema
  const problems: Record<string, string> = {}
  if (!inRange(own.timeoutSeconds, s.timeoutMinSeconds, s.timeoutMaxSeconds)) problems[`${id}.timeout`] = `Enter a whole number from ${formatNumber(s.timeoutMinSeconds)} to ${formatNumber(s.timeoutMaxSeconds)}.`
  if (!inRange(own.maxQueueAgeSeconds, s.queueAgeMinSeconds, s.queueAgeMaxSeconds)) problems[`${id}.queueAge`] = `Enter a whole number from ${formatNumber(s.queueAgeMinSeconds)} to ${formatNumber(s.queueAgeMaxSeconds)}.`
  if (!inRange(own.retryLimit, 0, s.retryLimitMax)) problems[`${id}.retry`] = `Enter a whole number from 0 to ${s.retryLimitMax}.`
  return problems
}

const size = (bytes: number) => (bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`)

export function AnalysisRunDialog({ isOpen, onOpenChange, initialHash, onQueued }: { isOpen: boolean; onOpenChange: (open: boolean) => void; initialHash?: string; onQueued?: (queued: { run: WorkbenchRun; reused: boolean }) => void }) {
  // Queuing invalidates the workbench and the payload's analysis reads (data/writes.ts).
  const startRun = useDataMutation(startAnalysisRunWrite())
  const [catalog, setCatalog] = useState<{ payloads: CapturedPayload[]; recipes: WorkbenchRecipe[] } | null>(null)
  const [config, setConfig] = useState<AnalysisRunConfig>(() => defaults(initialHash ?? ''))
  // Which analyzers apply to the picked sample, and why not: the backend's
  // answer for that sample.
  const [forSample, setForSample] = useState<AnalyzerCatalog | null>(null)

  // The catalog loads when the dialog first opens, so any page can host it.
  useEffect(() => {
    if (!isOpen || catalog) return
    void Promise.all([getPayloads(), getAnalysisResults()]).then(([p, r]) => setCatalog({ payloads: p.payloads, recipes: r.recipes }))
  }, [isOpen, catalog])
  useEffect(() => {
    if (!isOpen || !config.hash) return setForSample(null)
    let live = true
    void getAnalyzerCatalog(config.hash).then((c) => {
      if (!live) return
      setForSample(c)
      // Drop what the new sample cannot take.
      if (c) setConfig((cur) => ({ ...cur, analyzers: cur.analyzers.filter((id) => c.analyzers.find((a) => a.id === id)?.applicable) }))
    })
    return () => {
      live = false
    }
  }, [isOpen, config.hash])
  const infoOf = (id: AnalyzerId) => forSample?.analyzers.find((a) => a.id === id)
  // Each opening starts from a clean config for the host's sample.
  useEffect(() => {
    if (isOpen) setConfig(defaults(initialHash ?? ''))
  }, [isOpen, initialHash])

  // An analyzer's options are what the operator set over the backend's
  // defaults for it, so a freshly chosen analyzer starts from its defaults.
  const optionsOf = (id: AnalyzerId): AnalyzerOptions | undefined => config.options[id] ?? infoOf(id)?.defaultOptions
  const setOption = (id: AnalyzerId, patch: Partial<AnalyzerOptions>) => {
    const own = optionsOf(id)
    if (own) setConfig((c) => ({ ...c, options: { ...c.options, [id]: { ...own, ...patch } } }))
  }

  const payload = catalog?.payloads.find((p) => p.hash === config.hash)
  const gpu = config.analyzers.filter((a) => a === 'ghidra' || a === 'revdeck')
  const optionSummary = (id: AnalyzerId) => {
    const own = optionsOf(id)
    return own ? `${formatNumber(own.timeoutSeconds)} s timeout, ${formatNumber(own.maxQueueAgeSeconds)} s max queue age, ${formatNumber(own.retryLimit)} ${own.retryLimit === 1 ? 'retry' : 'retries'}` : '—'
  }

  const optionsFor = (id: AnalyzerId, shown: Record<string, string>) => {
    const info = infoOf(id)
    const own = optionsOf(id)
    if (!info || !own) return null
    const s = info.optionSchema
    return (
      <FormLayout defaultOptionality="optional">
        <NumberInput
          label="Timeout (seconds)"
          value={own.timeoutSeconds}
          onChange={(n) => setOption(id, { timeoutSeconds: n })}
          isIntegerOnly
          description={`${formatNumber(s.timeoutMinSeconds)} to ${formatNumber(s.timeoutMaxSeconds)} seconds.`}
          status={statusOf(shown, `${id}.timeout`)}
        />
        <NumberInput
          label="Longest wait in the queue (seconds)"
          value={own.maxQueueAgeSeconds}
          onChange={(n) => setOption(id, { maxQueueAgeSeconds: n })}
          isIntegerOnly
          description={`The run is dropped if it waits longer. ${formatNumber(s.queueAgeMinSeconds)} to ${formatNumber(s.queueAgeMaxSeconds)} seconds.`}
          status={statusOf(shown, `${id}.queueAge`)}
        />
        <NumberInput label="Retries" value={own.retryLimit} onChange={(n) => setOption(id, { retryLimit: n })} isIntegerOnly description={`0 to ${s.retryLimitMax}.`} status={statusOf(shown, `${id}.retry`)} />
      </FormLayout>
    )
  }

  const optionErrors = config.analyzers.reduce<Record<string, string>>((all, id) => {
    const info = infoOf(id)
    const own = optionsOf(id)
    return info && own ? { ...all, ...optionProblems(id, own, info) } : all
  }, {})

  const loading = (
    <HStack gap={2} vAlign="center">
      <Spinner size="sm" />
      <Text type="supporting">Loading captured payloads…</Text>
    </HStack>
  )

  return (
    <WizardDialog
      title="New analysis run"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      finishLabel="Queue the run"
      width={680}
      onFinish={async () => {
        const options: Partial<Record<AnalyzerId, AnalyzerOptions>> = {}
        for (const id of config.analyzers) {
          const own = optionsOf(id)
          if (own) options[id] = own
        }
        const queued = await startRun.mutateAsync([{ hash: config.hash, analyzers: config.analyzers, options }])
        if (queued) onQueued?.(queued)
      }}
      steps={[
        {
          label: 'Sample',
          errors: payload ? {} : { hash: 'Pick a captured payload to analyze.' },
          render: (shown) =>
            !catalog ? (
              loading
            ) : (
              <FormLayout>
                <FilterSelect
                  label="Payload"
                  mode="single"
                  options={catalog.payloads.map((p) => ({ value: p.hash, label: `${p.hash.slice(0, 16)}… · ${p.kind} · ${p.verdict?.family ?? p.verdict?.label ?? 'no verdict'}` }))}
                  value={config.hash ? [config.hash] : []}
                  onChange={([hash]) => hash && setConfig((c) => ({ ...c, hash }))}
                  placeholder="Pick a captured payload"
                  description="Every captured sample; type part of its hash, kind or family."
                  status={statusOf(shown, 'hash')}
                />
                {payload && (
                  <Card variant="muted" padding={3}>
                    <MetadataList orientation="vertical">
                      <MetadataListItem label="SHA-256">
                        <Text type="code" maxLines={1}>
                          {payload.hash}
                        </Text>
                      </MetadataListItem>
                      <MetadataListItem label="File">{`${payload.kind} · ${payload.platform} · ${size(payload.sizeBytes)}`}</MetadataListItem>
                      <MetadataListItem label="Captured by">{payload.sources.join(', ')}</MetadataListItem>
                      <MetadataListItem label="Classified as">{forSample ? `${forSample.classification.label} (${forSample.classification.code})` : '…'}</MetadataListItem>
                      <MetadataListItem label="Analysis path">{forSample?.classification.analysisPath ?? (payload.dynamic ? 'static and dynamic' : 'static only')}</MetadataListItem>
                    </MetadataList>
                  </Card>
                )}
              </FormLayout>
            ),
        },
        {
          label: 'Analyzers',
          errors: config.analyzers.length ? {} : { analyzers: 'Pick at least one analyzer.' },
          render: (shown) =>
            !forSample ? (
              loading
            ) : (
              <VStack gap={4}>
                {catalog && catalog.recipes.length > 0 && (
                  <Selector
                    label="Start from a recipe"
                    placeholder="Pick analyzers by hand"
                    options={catalog.recipes.map((r) => ({ value: r.id, label: `${r.name} (${r.scope}, rev ${r.revision})` }))}
                    value={null}
                    hasClear
                    onChange={(id) => {
                      const recipe = catalog.recipes.find((r) => r.id === id)
                      if (recipe) setConfig((c) => fromRecipe(c, recipe, (a) => Boolean(infoOf(a)?.applicable)))
                    }}
                    description="Sets its analyzers and their options; what this sample cannot take is left out."
                  />
                )}
                <CheckboxList
                  label="Analyzers"
                  description="Those that cannot take this sample say why."
                  value={config.analyzers}
                  onChange={(analyzers) => setConfig((c) => ({ ...c, analyzers: analyzers as AnalyzerId[] }))}
                  status={statusOf(shown, 'analyzers')}
                >
                  {forSample.analyzers.map((a) => (
                    <CheckboxListItem
                      key={a.id}
                      value={a.id}
                      label={a.label}
                      description={a.reason ?? (a.availability === 'degraded' && a.availabilityNote ? `${a.description} ${a.availabilityNote}` : a.description)}
                      isDisabled={!a.applicable}
                      endContent={
                        <HStack gap={1}>
                          {a.detonates && <Token size="sm" color="red" label="detonates" />}
                          {!a.localOnly && <Token size="sm" color="orange" label="publishes" />}
                          {a.gpu && <Token size="sm" color="purple" label="GPU queue" />}
                          {a.requiredRole === 'admin' && <Token size="sm" label="admin" />}
                          {a.availability === 'degraded' && <Token size="sm" color="yellow" label="degraded" />}
                        </HStack>
                      }
                    />
                  ))}
                </CheckboxList>
              </VStack>
            ),
        },
        {
          label: 'Options',
          errors: optionErrors,
          render: (shown) => (
            <VStack gap={3}>
              <Text type="supporting">Each chosen analyzer’s timeout, queue wait and retries. The backend's defaults are filled in; change them only if the sample needs it.</Text>
              {config.analyzers.map((id, i) => (
                <Collapsible key={id} trigger={ANALYZER_NOUN[id]} defaultIsOpen={i === 0}>
                  {optionsFor(id, shown)}
                </Collapsible>
              ))}
            </VStack>
          ),
        },
        {
          label: 'Review',
          errors: {},
          render: () => (
            <FormLayout defaultOptionality="optional">
              <Card variant="muted" padding={3}>
                <MetadataList orientation="vertical">
                  <MetadataListItem label="Sample">{payload ? `${payload.hash.slice(0, 16)}… · ${payload.kind}` : '—'}</MetadataListItem>
                  <MetadataListItem label="Analyzers">{config.analyzers.map((a) => ANALYZER_NOUN[a]).join(', ')}</MetadataListItem>
                  {config.analyzers.map((id) => (
                    <MetadataListItem key={id} label={ANALYZER_NOUN[id]}>
                      {optionSummary(id)}
                    </MetadataListItem>
                  ))}
                </MetadataList>
              </Card>
              {config.analyzers.flatMap((id) => {
                const confirmation = infoOf(id)?.confirmation
                return confirmation ? [<Banner key={id} status="warning" title={ANALYZER_NOUN[id]} description={confirmation} />] : []
              })}
              {gpu.length > 0 && <Banner status="info" title={`${gpu.map((a) => ANALYZER_NOUN[a]).join(' and ')} ${gpu.length === 1 ? 'waits' : 'wait'} on the GPU queue`} description="Other analyzers start right away; the GPU jobs run in queue order and can be aborted there." />}
            </FormLayout>
          ),
        },
      ]}
    />
  )
}
