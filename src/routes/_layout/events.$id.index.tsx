import { pageSsr } from '#/lib/pageSsr'
import { SkeletonPanels } from '#/components/EntityBlocks'
import { orPending } from '#/lib/pending'
import { CodeBlock } from '@astryxdesign/core/CodeBlock'
import { Grid } from '@astryxdesign/core/Grid'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { RelatedPanel } from '#/components/Related'
import { getRelated } from '#/data/queries'
import { backendGapOf } from '#/lib/backendGap'
import { Panel } from '#/components/DashboardBlocks'
import { EventsPanel, attckUrl } from '#/components/DetailBlocks'
import { EntityLink } from '#/components/EntityLink'
import { CredentialStateToken } from '#/components/CredentialStateToken'
import { credentialStateOf } from '#/lib/credentialState'
import { fieldBlock, readField } from '#/lib/sensorFields'

const parent = getRouteApi('/_layout/events/$id')

export const Route = createFileRoute('/_layout/events/$id/')({
  ssr: pageSsr,
  loader: ({ params }) => backendGapOf(getRelated('event', params.id)),
  component: EventOverview,
  pendingComponent: EventOverview,
})

function EventOverview() {
  const loaded = orPending(parent.useLoaderData())
  const related = orPending(Route.useLoaderData())
  // Its panels as skeletons until the event is here.
  if (!loaded) return <SkeletonPanels count={4} />
  const event = loaded.event
  const session = loaded.session
  const reading = loaded.reading
  // The artefacts this sensor exists to capture, each once, in its own terms.
  const artefacts = reading.artefacts
    .map((a) => ({ label: a.label, text: fieldBlock(readField(event.fields, a.field)) }))
    .filter((a) => a.text !== '')
  return (
    <VStack gap={4}>
      <Grid columns={{ minWidth: 340, repeat: 'fit' }} gap={4}>
        <Panel title="What the sensor captured">
          <Text type="code">{event.summary ?? '—'}</Text>
          {reading.what && <Text type="supporting">{`${event.sensor}: ${reading.what}.`}</Text>}
          <MetadataList label={{ position: 'start', width: 104 }}>
            {event.username && (
              <MetadataListItem label="Username">
                <EntityLink kind="username" id={event.username} />
              </MetadataListItem>
            )}
            {event.password && (
              <MetadataListItem label="Password">
                <EntityLink kind="password" id={event.password} />
              </MetadataListItem>
            )}
            {credentialStateOf(event) && (
              <MetadataListItem label="Credentials">
                <CredentialStateToken event={event} />
              </MetadataListItem>
            )}
            {event.command && (
              <MetadataListItem label="Command">
                <EntityLink kind="command" id={event.command} />
              </MetadataListItem>
            )}
            {event.fingerprint && (
              <MetadataListItem label={event.fingerprintKind ?? 'Fingerprint'}>
                <EntityLink kind="fingerprint" id={event.fingerprint} />
              </MetadataListItem>
            )}
            {event.payloadClass && (
              <MetadataListItem label="Payload">
                <Token size="sm" color="orange" label={event.payloadClass} />
              </MetadataListItem>
            )}
            {event.icsSeverity && (
              <MetadataListItem label="ICS control">
                <Token size="sm" color={event.icsSeverity === 'critical' ? 'red' : 'orange'} label={`${event.icsSeverity}: ${String(event.fields.app_function)}`} />
              </MetadataListItem>
            )}
            {event.techniques.length > 0 && (
              <MetadataListItem label="ATT&CK">
                <HStack gap={1} wrap="wrap">
                  {event.techniques.map((t) => (
                    <Token key={t} size="sm" color="blue" label={t} href={attckUrl(t)} />
                  ))}
                </HStack>
              </MetadataListItem>
            )}
          </MetadataList>
        </Panel>
        <Panel title="Which decoy was hit">
          {event.persona ? (
            <MetadataList label={{ position: 'start', width: 104 }}>
              <MetadataListItem label="Organization">{event.organization}</MetadataListItem>
              <MetadataListItem label="Persona">
                <EntityLink kind="persona" id={event.persona} />
              </MetadataListItem>
              <MetadataListItem label="Site">
                <EntityLink kind="site" id={event.site ?? ''} />
              </MetadataListItem>
              <MetadataListItem label="Asset">
                <EntityLink kind="asset" id={event.asset ?? ''} />
              </MetadataListItem>
            </MetadataList>
          ) : (
            <Text type="supporting">{`${event.sensor} wears no decoy identity for this service: the event carries no persona, site or asset.`}</Text>
          )}
        </Panel>
        <Panel title="Where it came from">
          <MetadataList label={{ position: 'start', width: 104 }}>
            <MetadataListItem label="Source">
              <EntityLink kind="source" id={event.srcIp}>{event.srcPort === undefined ? event.srcIp : `${event.srcIp}:${event.srcPort}`}</EntityLink>
            </MetadataListItem>
            {event.srcIpClaimed && (
              <MetadataListItem label="Claimed">
                <VStack gap={0.5}>
                  <Text type="code">{event.srcIpClaimed}</Text>
                  <Text type="supporting">The request's X-Forwarded-For disagrees with the connection portbridge recorded. The connection is the stronger evidence; this claim is likely forged.</Text>
                </VStack>
              </MetadataListItem>
            )}
            <MetadataListItem label="Network">
              {event.asn ? (
                <EntityLink kind="asn" id={event.asn}>{event.org ? `${event.asn} · ${event.org}` : event.asn}</EntityLink>
              ) : (
                <Text type="supporting">—</Text>
              )}
            </MetadataListItem>
            <MetadataListItem label="Provider">
              {event.provider ? <EntityLink kind="provider" id={event.provider} /> : <Text type="supporting">—</Text>}
            </MetadataListItem>
            <MetadataListItem label="Location">
              {event.country ? (
                <HStack gap={1}>
                  {event.city && <Text>{`${event.city},`}</Text>}
                  <EntityLink kind="country" id={event.country} />
                </HStack>
              ) : (
                <Text type="supporting">{event.city ?? '—'}</Text>
              )}
            </MetadataListItem>
            <MetadataListItem label="Port">
              <EntityLink kind="port" id={String(event.dstPort)} />
            </MetadataListItem>
          </MetadataList>
        </Panel>
      </Grid>
      {artefacts.length > 0 && (
        <Panel title="Captured exchange">
          {artefacts.map((a) => (
            <VStack key={a.label} gap={1}>
              <Text type="label">{a.label}</Text>
              <CodeBlock isWrapped code={a.text} language={a.text.startsWith('{') || a.text.startsWith('[') ? 'json' : 'text'} maxHeight={320} />
            </VStack>
          ))}
        </Panel>
      )}
      <EventsPanel title="Around it in this session" events={session.slice(0, 8)} action={event.sessionId ? <EntityLink kind="session" id={event.sessionId}>Full session</EntityLink> : undefined} empty="This event is the whole session." />
      <RelatedPanel center={event.summary ?? event.eventName} groups={related} />
    </VStack>
  )
}
