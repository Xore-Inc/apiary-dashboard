// The Sankey's zoom row (old dashboard #2130): one scale the buttons own,
// while dragging the canvas pans and dragging a node moves it. Reset puts the
// view back exactly (a fresh chart), dragged nodes included.
import { useEffect, useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Icon } from '@astryxdesign/core/Icon'
import { HStack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { ArrowPathIcon, MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon } from '@heroicons/react/24/outline'

const STEPS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 3]

/** The next zoom step from `current`, `dir` steps along. */
export function stepZoom(current: number, dir: 1 | -1): number {
  const at = STEPS.findIndex((s) => s >= current - 1e-6)
  const index = at === -1 ? STEPS.length - 1 : at
  return STEPS[Math.max(0, Math.min(STEPS.length - 1, index + dir))]
}

export function useFlowZoom(data: unknown) {
  const [value, setValue] = useState(1)
  const [resets, setResets] = useState(0)
  // New data, old magnification: start that chart at 1.
  useEffect(() => setValue(1), [data])
  return { value, setValue, resets, reset: () => (setValue(1), setResets((n) => n + 1)) }
}

export function FlowZoom({ zoom }: { zoom: ReturnType<typeof useFlowZoom> }) {
  return (
    <HStack gap={1} vAlign="center" hAlign="end">
      <Text type="supporting" color="secondary">
        Drag to pan, drag a stage to move it
      </Text>
      <Button label="Zoom out" isIconOnly size="sm" variant="ghost" icon={<Icon icon={MagnifyingGlassMinusIcon} size="sm" />} isDisabled={zoom.value <= STEPS[0]} onClick={() => zoom.setValue(stepZoom(zoom.value, -1))} />
      <Text type="supporting" aria-live="polite">
        {Math.round(zoom.value * 100)}%
      </Text>
      <Button label="Zoom in" isIconOnly size="sm" variant="ghost" icon={<Icon icon={MagnifyingGlassPlusIcon} size="sm" />} isDisabled={zoom.value >= STEPS[STEPS.length - 1]} onClick={() => zoom.setValue(stepZoom(zoom.value, 1))} />
      <Button label="Reset view" isIconOnly size="sm" variant="ghost" icon={<Icon icon={ArrowPathIcon} size="sm" />} onClick={zoom.reset} />
    </HStack>
  )
}
