import { pageSsr } from '#/lib/pageSsr'
import { ensure, usePageQuery } from '#/lib/query'
import { VStack } from '@astryxdesign/core/Stack'
import { createFileRoute } from '@tanstack/react-router'
import { Timeline } from '#/components/EntityBlocks'
import { RelatedPanel } from '#/components/Related'
import { entityTimelineQuery, relatedQuery } from '#/data/resources'

export const Route = createFileRoute('/_layout/sessions/$id/')({
  ssr: pageSsr,
  loader: async ({ params, context }) => {
    const [timeline, related] = await Promise.all([ensure(context, entityTimelineQuery('session', params.id, 'all')), ensure(context, relatedQuery('session', params.id))])
    return { timeline, related }
  },
  component: SessionTimeline,
  pendingComponent: SessionTimeline,
})

/** The session in order (it is a bounded thing, so the global range does
 * not apply), with what it touched above. */
function SessionTimeline() {
  const { id } = Route.useParams()
  const related = usePageQuery(relatedQuery('session', id))
  const timeline = usePageQuery(entityTimelineQuery('session', id, 'all'))
  return (
    <VStack gap={4}>
      <RelatedPanel center={id} groups={related} />
      <Timeline items={timeline} empty="This session has no events." />
    </VStack>
  )
}
