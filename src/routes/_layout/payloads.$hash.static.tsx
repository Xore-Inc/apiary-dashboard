import { pageSsr } from '#/lib/pageSsr'
import { SkeletonPanels } from '#/components/EntityBlocks'
import { CodeBlock } from '@astryxdesign/core/CodeBlock'
import { Grid } from '@astryxdesign/core/Grid'
import { VStack } from '@astryxdesign/core/Stack'
import { Table, pixel, proportional } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { createFileRoute, getRouteApi } from '@tanstack/react-router'
import { Panel } from '#/components/DashboardBlocks'
import { usePayloadPage } from '#/data/pageData'

const parent = getRouteApi('/_layout/payloads/$hash')

export const Route = createFileRoute('/_layout/payloads/$hash/static')({ ssr: pageSsr, component: PayloadStatic, pendingComponent: PayloadStatic })

/** Bounded static analysis. The sample is never executed here. */
function PayloadStatic() {
  const a = usePayloadPage(parent.useParams().hash)?.analysis
  if (!a) return <SkeletonPanels count={3} />
  return (
    <VStack gap={4}>
      <CodeBlock isWrapped code={a.preview} title="Hex / ASCII, first 128 bytes" hasCopyButton={false} />
      <Grid columns={{ minWidth: 340, repeat: 'fit' }} gap={4}>
        <Panel title="Extracted strings">
          <VStack gap={1}>
            {a.strings.map((s) => (
              <Text key={s} type="code">
                {s}
              </Text>
            ))}
          </VStack>
        </Panel>
        <Panel title="Decoded candidates">
          <VStack gap={2}>
            {a.decoded.map((d) => (
              <VStack key={d.value} gap={0.5}>
                <Token size="sm" label={d.encoding} />
                <Text type="code">{d.value}</Text>
              </VStack>
            ))}
          </VStack>
        </Panel>
        {a.sections.length > 0 && (
          <Panel title="Sections">
            <Table
              data={a.sections.map((s) => ({ ...s, id: s.name }))}
              columns={[
                { key: 'name', header: 'Section', width: proportional(1), renderCell: (row) => <Text type="code">{row.name}</Text> },
                { key: 'size', header: 'Size', width: pixel(96), align: 'end', renderCell: (row) => row.size.toLocaleString('en-US') },
                { key: 'entropy', header: 'Entropy', width: pixel(88), align: 'end' },
              ]}
              idKey="id"
              density="compact"
            />
          </Panel>
        )}
      </Grid>
    </VStack>
  )
}
