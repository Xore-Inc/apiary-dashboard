// Server-side paging for the unbounded lists: the page number lives in
// `?page=` (1-based; the first page is left out of the URL), and the loader
// asks the data seam for just that slice, sized by the operator's rows-per-
// page preference. The loader and the page build the same request, so they
// read the same cache entry (lib/query.ts).
import { useQuery } from '@tanstack/react-query'
import { preferencesQuery } from '#/data/resources'
import type { PageRequest } from '#/data/types'
import { ensure } from '#/lib/query'
import type { LoaderCache } from '#/lib/query'

export const pageParam = (value: unknown): number | undefined => {
  const n = Number(value)
  return Number.isInteger(n) && n > 1 ? n : undefined
}

/** The slice for a page, at a page size. */
export const pageSlice = (rowsPerPage: number, page: number | undefined): Required<PageRequest> => ({ offset: ((page ?? 1) - 1) * rowsPerPage, limit: rowsPerPage })

/** The loader's request: the page size from the (cached) preferences. */
export async function pageRequest(cache: LoaderCache, page: number | undefined): Promise<Required<PageRequest>> {
  const { rowsPerPage } = await ensure(cache, preferencesQuery())
  return pageSlice(rowsPerPage, page)
}

/** The page's request, the same as its loader's; undefined until the
 * preferences are in the cache (the loader has put them there). */
export function usePageRequest(page: number | undefined): Required<PageRequest> | undefined {
  const rowsPerPage = useQuery(preferencesQuery()).data?.rowsPerPage
  return rowsPerPage === undefined ? undefined : pageSlice(rowsPerPage, page)
}
