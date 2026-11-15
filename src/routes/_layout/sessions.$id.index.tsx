import { pageSsr } from '#/lib/pageSsr'
import { startQuery } from '#/lib/query'
import { Deferred } from '#/components/Deferred'
import { VStack } from '@astryxdesign/core/Stack'
import { createFileRoute } from '@tanstack/react-router'
import { Timeline } from '#/components/EntityBlocks'
import { RelatedPanel } from '#/components/Related'
import { entityTimelineQuery, relatedQuery } from '#/data/resources'

export const Route = createFileRoute('/_layout/sessions/$id/')({
  ssr: pageSsr,
  // Both slow reads start here; the tab renders without waiting for them.
  loader: ({ params, context }) => {
    startQuery(context, entityTimelineQuery('session', params.id, 'all'))
    startQuery(context, relatedQuery('session', params.id))
  },
  component: SessionTimeline,
  pendingComponent: SessionTimeline,
})

/** The session in order (it is a bounded thing, so the global range does
 * not apply), with what it touched above. */
function SessionTimeline() {
  const { id } = Route.useParams()
  return (
    <VStack gap={4}>
      <Deferred query={relatedQuery('session', id)}>{(groups) => <RelatedPanel center={id} groups={groups} />}</Deferred>
      <Deferred query={entityTimelineQuery('session', id, 'all')}>{(items) => <Timeline items={items} empty="This session has no events." />}</Deferred>
    </VStack>
  )
}
