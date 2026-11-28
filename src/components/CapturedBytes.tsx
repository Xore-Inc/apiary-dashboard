/** The binary a stored record carries, as a hex dump and a printable view
 * each, in collapsible blocks. Renders nothing when the record has no binary. */
import { CodeBlock } from '@astryxdesign/core/CodeBlock'
import { Collapsible } from '@astryxdesign/core/Collapsible'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/Stack'
import { Panel } from '#/components/DashboardBlocks'
import { VIEW_LIMIT, capturedBytesOf, hexDump, printableView } from '#/lib/capturedBytes'
import { formatNumber } from '#/lib/format'

export function CapturedBytesPanel({ record, title = 'Captured bytes' }: { record: Record<string, unknown> | undefined; title?: string }) {
  const items = capturedBytesOf(record)
  if (items.length === 0) return null
  return (
    <Panel title={title}>
      <VStack gap={3}>
        {items.map((item) => (
          <VStack key={item.path} gap={1}>
            <Text type="label">{`${item.label} · ${formatNumber(item.bytes.length)} bytes`}</Text>
            <Text type="supporting">{item.path}</Text>
            <Collapsible trigger="Hex and ASCII" defaultIsOpen>
              <CodeBlock code={hexDump(item.bytes)} language="text" maxHeight={360} hasCopyButton={false} />
            </Collapsible>
            <Collapsible trigger="Printable text">
              <CodeBlock isWrapped code={printableView(item.bytes)} language="text" maxHeight={240} hasCopyButton={false} />
            </Collapsible>
            {item.bytes.length > VIEW_LIMIT && <Text type="supporting">{`The views show the first ${formatNumber(VIEW_LIMIT)} bytes of ${formatNumber(item.bytes.length)}. The full value is base64 in the Raw tab.`}</Text>}
          </VStack>
        ))}
      </VStack>
    </Panel>
  )
}
