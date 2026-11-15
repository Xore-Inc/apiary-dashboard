// One query per backend resource (#309): the server function of
// src/data/queries.ts it reads through, and how fast its answer moves
// (lib/query.ts FRESHNESS). The key is the function's name plus its
// arguments, so the same entity read on two pages is one cache entry and one
// call. Mutations invalidate by these names (`queryKey: [name]` matches every
// argument list).
import { backendGapOf } from '#/lib/backendGap'
import { resource } from '#/lib/query'
import { getAsn, getEntityTimeline, getPreferences, getRelated, getSessionUser, getShellConfig } from './queries'
import { getMockClock, getMockScenariosAllowed } from './serverFn'

// ---- the shell: every page reads these -----------------------------------

/** Who is signed in. Every data call still checks the session on the
 * server; this is the navigation guard's read, reused for 30 s. */
export const sessionUserQuery = resource('getSessionUser', getSessionUser, 'normal')
/** The operator's preferences: shape the whole document. */
export const preferencesQuery = resource('getPreferences', getPreferences, 'normal')
/** Presentation, map tiles, feature switches: deployment configuration. */
export const shellConfigQuery = resource('getShellConfig', getShellConfig, 'slow')
export const mockClockQuery = resource('getMockClock', getMockClock, 'static')
export const mockScenariosAllowedQuery = resource('getMockScenariosAllowed', getMockScenariosAllowed, 'static')

// ---- entities --------------------------------------------------------------

export const asnQuery = resource('getAsn', getAsn, 'slow')

/** The related panel and entity timelines: slow aggregates (APIARY#3856,
 * up to 30 s on a heavy source), so kept for minutes once answered. A
 * backend gap is an answer the panel shows (lib/backendGap), never reused. */
export const relatedQuery = resource('getRelated', (...args: Parameters<typeof getRelated>) => backendGapOf(getRelated(...args)), 'slow')
export const entityTimelineQuery = resource('getEntityTimeline', (...args: Parameters<typeof getEntityTimeline>) => backendGapOf(getEntityTimeline(...args)), 'slow')
