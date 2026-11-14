import { CodeBlock } from '@astryxdesign/core/CodeBlock'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { VStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import type { DeadLetter } from '#/data/types'
import { formatDateTime } from '#/lib/format'

/** One document Elasticsearch rejected, with the original body to fix it from. */
export function DeadLetterDetail({ row }: { row: DeadLetter }) {
  return (
    <VStack gap={4}>
      <Text type="code">{row.reason}</Text>
      <MetadataList label={{ position: 'start', width: 80 }}>
        <MetadataListItem label="Time">
          {formatDateTime(row.timestamp)}
        </MetadataListItem>
        {row.source && <MetadataListItem label="Source">{row.source}</MetadataListItem>}
        {row.path && (
          <MetadataListItem label="Log file">
            <Text type="code">{row.path}</Text>
          </MetadataListItem>
        )}
        {row.index && (
          <MetadataListItem label="Index">
            <Text type="code">{row.index}</Text>
          </MetadataListItem>
        )}
      </MetadataList>
      <CodeBlock isWrapped
        code={JSON.stringify(row.document, null, 2)}
        language="json"
        title={row.truncated?.length ? 'Original document (preview)' : 'Original document'}
      />
    </VStack>
  )
}
