import { useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { Selector } from '@astryxdesign/core/Selector'
import { HStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Token } from '@astryxdesign/core/Token'
import { SeverityToken } from '#/components/SeverityToken'
import { acknowledgeAnomaliesWrite, setAnomalyDispositionWrite } from '#/data/writes'
import { useDataMutation } from '#/lib/mutation'
import { DISPOSITIONS } from '#/data/types'
import { Panel } from '#/components/DashboardBlocks'
import type { AnomalyStatus, Disposition, MlAnomaly } from '#/data/types'
import { formatDateTime } from '#/lib/format'
import { EntityLink } from '#/components/EntityLink'
import { useGuardedAction } from '#/lib/useGuardedAction'
import { useIsAdmin } from '#/lib/session'
import { FieldStatus } from '@astryxdesign/core/FieldStatus'

export const statusLabel = (status: AnomalyStatus) => status.replace('_', ' ')

export const STATUS_COLOR = {
  open: 'orange',
  acknowledged: 'gray',
  false_positive: 'green',
  true_positive: 'red',
  benign_known: 'blue',
} as const satisfies Record<AnomalyStatus, string>

export function StatusToken({ status }: { status: AnomalyStatus }) {
  return (
    <Token label={statusLabel(status)} size="sm" color={STATUS_COLOR[status]} />
  )
}

/** What the models saw, and where it came from. */
export function AnomalyFacts({ anomaly }: { anomaly: MlAnomaly }) {
  return (
    <Panel title="What was scored">
      <HStack gap={2} vAlign="center" wrap="wrap">
        <SeverityToken severity={anomaly.severity} />
        <StatusToken status={anomaly.status} />
        <Text type="supporting">score {anomaly.compositeScore.toFixed(2)}</Text>
      </HStack>
      <Text>{anomaly.explanation}</Text>

      <MetadataList label={{ position: 'start', width: 128 }}>
        <MetadataListItem label="Time">
          {formatDateTime(anomaly.timestamp)}
        </MetadataListItem>
        <MetadataListItem label="Source">
          {anomaly.srcIp ? (
            <EntityLink kind="source" id={anomaly.srcIp} />
          ) : (
            'unattributed'
          )}
        </MetadataListItem>
        <MetadataListItem label="Event type">
          {anomaly.eventType}
        </MetadataListItem>
        <MetadataListItem label="Dst port / proto">{`${anomaly.dstPort} / ${anomaly.proto}`}</MetadataListItem>
        <MetadataListItem label="Sensor">
          <EntityLink kind="sensor" id={anomaly.sensor} />
        </MetadataListItem>
        <MetadataListItem label="Source index">
          <Text type="code">{anomaly.sourceIndex}</Text>
        </MetadataListItem>
        <MetadataListItem label="Source event">
          <EntityLink kind="event" id={anomaly.sourceEventId} />
        </MetadataListItem>
        <MetadataListItem label="Threshold">
          {anomaly.thresholdAtScoring.toFixed(2)}
        </MetadataListItem>
        <MetadataListItem label="Model state">
          {anomaly.modelState ?? 'no full detector trio promoted'}
        </MetadataListItem>
        {anomaly.folded > 1 && (
          <MetadataListItem label="Folded">{`${anomaly.folded} anomalies from this address in the same second`}</MetadataListItem>
        )}
        {anomaly.dispositionReason && (
          <MetadataListItem label="Verdict reason">
            {anomaly.dispositionReason}
          </MetadataListItem>
        )}
      </MetadataList>
    </Panel>
  )
}

/** Acknowledge or label the anomaly; labels train the next model. */
export function AnomalyTriage({ anomaly }: { anomaly: MlAnomaly }) {
  const acknowledge = useDataMutation(acknowledgeAnomaliesWrite())
  const dispose = useDataMutation(setAnomalyDispositionWrite())
  const [busy, setBusy] = useState(false)
  const { error, guard } = useGuardedAction()
  const [verdict, setVerdict] = useState<Disposition>('true_positive')
  const [reason, setReason] = useState('')
  const isDisposed = (DISPOSITIONS as readonly string[]).includes(
    anomaly.status,
  )
  const run = async (write: () => Promise<unknown>) => {
    setBusy(true)
    try {
      // Each write invalidates the anomaly reads (data/writes.ts).
      await guard(write)
    } finally {
      setBusy(false)
    }
  }
  // A folded row stands for several anomalies; the mock keeps them as one.
  const ids = [anomaly.id]
  // Triage is an admin's call: viewers are not offered it.
  const isAdmin = useIsAdmin()
  if (!isAdmin) return null

  return (
    <Panel title="Triage">
      <Text color="secondary">
        Dispositions feed the labelled training corpus next to the score.
      </Text>
      {anomaly.status === 'open' && (
        <Button
          label="Acknowledge"
          variant="secondary"
          size="sm"
          isLoading={busy}
          onClick={() => run(() => acknowledge.mutateAsync([ids]))}
        />
      )}
      <Selector
        label="Disposition"
        value={verdict}
        onChange={(value) => setVerdict(value as Disposition)}
        options={DISPOSITIONS.map((value) => ({
          value,
          label: statusLabel(value),
        }))}
      />
      <TextInput
        label="Reason"
        description="Kept next to the score for the labelled training corpus."
        value={reason}
        onChange={setReason}
      />
      <HStack gap={2}>
        <Button
          label={
            isDisposed
              ? `Change to ${statusLabel(verdict)}`
              : 'Record disposition'
          }
          size="sm"
          isLoading={busy}
          onClick={() => run(() => dispose.mutateAsync([ids, verdict, reason]))}
        />
        {isDisposed && (
          <Button
            label="Retract"
            variant="secondary"
            size="sm"
            isDisabled={busy}
            onClick={() => run(() => dispose.mutateAsync([ids, 'open', '']))}
          />
        )}
        {error && <FieldStatus type="error" variant="detached" message={error} />}
      </HStack>
    </Panel>
  )
}
