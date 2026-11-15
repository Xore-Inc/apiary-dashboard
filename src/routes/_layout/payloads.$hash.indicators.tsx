import { pageSsr } from '#/lib/pageSsr'
import { Grid } from '@astryxdesign/core/Grid'
import { HStack } from '@astryxdesign/core/Stack'
import { Table } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { iocColumns } from '#/components/analyzers/PayloadBlocks'
import { Panel } from '#/components/DashboardBlocks'
import { usePayloadPage } from '#/data/pageData'

const parent = getRouteApi('/_layout/payloads/$hash')

export const Route = createFileRoute('/_layout/payloads/$hash/indicators')({ ssr: pageSsr, component: PayloadIndicators, pendingComponent: PayloadIndicators })

function PayloadIndicators() {
  const a = usePayloadPage(parent.useParams().hash)?.analysis
  return (
    <Grid columns={{ minWidth: 340, repeat: 'fit' }} gap={4}>
      <Panel title="YARA rule matches">
        {a?.yara.length ? (
          <HStack gap={1} wrap="wrap">
            {a.yara.map((rule) => (
              <Token key={rule} size="sm" color="orange" label={rule} />
            ))}
          </HStack>
        ) : (
          <Text type="supporting">No rule matched.</Text>
        )}
      </Panel>
      <Panel title="Extracted indicators">
        <Table data={a?.iocs} columns={iocColumns} idKey="id" density="compact" />
      </Panel>
    </Grid>
  )
}
