import { pageSsr } from '#/lib/pageSsr'
import { createFileRoute } from '@tanstack/react-router'
import { MailMessage } from '#/components/CapturedMail'
import { Panel } from '#/components/DashboardBlocks'
import { Text } from '@astryxdesign/core/Text'
import { ensure, usePageQuery } from '#/lib/query'
import { mailQuery } from '#/data/resources'

export const Route = createFileRoute('/_layout/sessions/$id/mail')({
  ssr: pageSsr,
  loader: ({ params, context }) => ensure(context, mailQuery(params.id)),
  component: SessionMail,
  pendingComponent: SessionMail,
})

/** The message a mail-sensor session delivered. */
function SessionMail() {
  const mail = usePageQuery(mailQuery(Route.useParams().id))
  return (
    <Panel title="Captured message">
      {mail ? <MailMessage mail={mail} /> : <Text type="supporting">No message body was captured for this session: the client stopped after the envelope.</Text>}
    </Panel>
  )
}
