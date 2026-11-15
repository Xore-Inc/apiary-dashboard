// A slow panel (#309): its read was started by the route's loader without
// waiting (lib/query.ts startQuery), so the page is already on screen; this
// reads it under its own Suspense boundary and fills in when it answers.
// The panel draws its own skeleton (undefined) while it loads, and a failed
// read shows as the panel's backend gap instead of replacing the page.
import { Component, Suspense } from 'react'
import type { ReactNode } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import type { BackendGap } from '#/lib/backendGap'
import { describeError } from '#/lib/actionError'
import { orPending } from '#/lib/pending'
import type { ResourceOptions } from '#/lib/query'

type Render<TData> = (data: TData | BackendGap | undefined) => ReactNode

export function Deferred<TData>({ query, children }: { query: ResourceOptions<TData>; children: Render<TData> }) {
  return (
    <PanelError key={JSON.stringify(query.queryKey)} render={children}>
      <Suspense fallback={children(undefined)}>
        <Read query={query} render={children} />
      </Suspense>
    </PanelError>
  )
}

function Read<TData>({ query, render }: { query: ResourceOptions<TData>; render: Render<TData> }) {
  // The page's own pending rules apply ("Loading forever", the first render
  // after hydration).
  return render(orPending(useSuspenseQuery(query).data))
}

class PanelError<TData> extends Component<{ render: Render<TData>; children: ReactNode }, { error?: unknown }> {
  state: { error?: unknown } = {}
  static getDerivedStateFromError(error: unknown) {
    return { error }
  }
  render() {
    return this.state.error === undefined ? this.props.children : this.props.render({ gap: describeError(this.state.error) })
  }
}
