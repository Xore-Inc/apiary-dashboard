// Writes (#309): a server function run as a TanStack Query mutation, then
// the resources it changed invalidated, so every page showing them asks
// again and no stale answer survives the write.
//
// - `invalidates`: the resources (lib/query.ts `resource(...).key`, every
//   argument list) the write changes. The mutation stays pending until their
//   active reads have answered again, so a button's busy state covers the
//   refresh, as the Start + Query guide prescribes.
// - `optimistic`: for writes safe to show before the server confirms them
//   (a preference, acknowledging an alert): the cache is changed at once,
//   and restored exactly if the server refuses.
// - The router's loaders run again after the refresh, reading the cache:
//   what still comes from loader data (the view tabs' counts, the root's
//   resolved preferences) follows.
//
// The server functions are the same as before, so the CSRF header, the
// actor assertion and the 401 → sign-in flow (data/serverFn.ts) are unchanged.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'

type Snapshot = Array<[QueryKey, unknown]>

export interface DataMutation<TVars, TResult> {
  write: (vars: TVars) => Promise<TResult>
  /** The resources the write changes (`someQuery.key`). */
  invalidates: QueryKey[] | ((vars: TVars, result: TResult | undefined) => QueryKey[])
  /** Shows the write in the cache before the server answers. */
  optimistic?: (queryClient: QueryClient, vars: TVars) => void
  /** Re-run the router's loaders after the refresh (default true). */
  reloadRoutes?: boolean
}

/** The effect of a write on the cache, outside React (tests, scripts). */
export function mutationOptions<TVars, TResult>(queryClient: QueryClient, reloadRoutes: () => Promise<unknown>, options: DataMutation<TVars, TResult>) {
  const keysFor = (vars: TVars, result?: TResult) => (typeof options.invalidates === 'function' ? options.invalidates(vars, result) : options.invalidates)
  return {
    mutationFn: options.write,
    onMutate: async (vars: TVars): Promise<{ snapshot: Snapshot }> => {
      if (!options.optimistic) return { snapshot: [] }
      const keys = keysFor(vars)
      // A read answering mid-write would overwrite the optimistic value.
      await Promise.all(keys.map((queryKey) => queryClient.cancelQueries({ queryKey })))
      const snapshot = keys.flatMap((queryKey) => queryClient.getQueriesData({ queryKey }))
      options.optimistic(queryClient, vars)
      return { snapshot }
    },
    onError: (_error: unknown, _vars: TVars, context: { snapshot: Snapshot } | undefined) => {
      for (const [queryKey, data] of context?.snapshot ?? []) queryClient.setQueryData(queryKey, data)
    },
    onSettled: async (result: TResult | undefined, _error: unknown, vars: TVars) => {
      await Promise.all(keysFor(vars, result).map((queryKey) => queryClient.invalidateQueries({ queryKey })))
      if (options.reloadRoutes !== false) await reloadRoutes()
    },
  }
}

/** A write and its effect on the cache; `mutateAsync` resolves once the
 * changed reads have answered again, and rejects with the server's refusal. */
export function useDataMutation<TVars = void, TResult = unknown>(options: DataMutation<TVars, TResult>) {
  const queryClient = useQueryClient()
  const router = useRouter()
  return useMutation(mutationOptions(queryClient, () => router.invalidate(), options))
}
