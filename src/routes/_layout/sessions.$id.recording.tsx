import { pageSsr } from '#/lib/pageSsr'
import { ensure, usePageQuery } from '#/lib/query'
import { ActionLink } from '#/components/ActionLink'
import { HStack } from '@astryxdesign/core/Stack'
import { RecordingDownloads } from '#/components/RecordingDownloads'
import { Text } from '@astryxdesign/core/Text'
import { createFileRoute } from '@tanstack/react-router'
import { Panel } from '#/components/DashboardBlocks'
import { Player } from '#/components/details/Recording'
import { replayDetailQuery, sessionDetailQuery } from '#/data/resources'

export const Route = createFileRoute('/_layout/sessions/$id/recording')({
  ssr: pageSsr,
  loader: async ({ params, context }) => {
    const session = await ensure(context, sessionDetailQuery(params.id))
    const shasum = session?.recordingShasum
    return shasum ? { shasum, detail: await ensure(context, replayDetailQuery(shasum)) } : null
  },
  component: SessionRecording,
  pendingComponent: SessionRecording,
})

/** The session's terminal, played back right here. */
function SessionRecording() {
  const session = usePageQuery(sessionDetailQuery(Route.useParams().id))
  const shasum = session?.recordingShasum
  const detail = usePageQuery(shasum ? replayDetailQuery(shasum) : undefined)
  const recording = shasum ? { shasum, detail } : undefined
  if (!recording?.detail)
    return (
      <Text type="supporting">
        No terminal recording exists for this session. Only interactive shells
        on SSH/Telnet sensors are recorded.
      </Text>
    )
  return (
    <Panel
      title="Terminal recording"
      action={
        <HStack gap={3} vAlign="center">
          <RecordingDownloads shasum={recording.shasum} />
          <ActionLink href={`/recordings/${recording.shasum}`}>Open recording</ActionLink>
        </HStack>
      }
    >
      <Player replay={recording.detail.replay} />
    </Panel>
  )
}
