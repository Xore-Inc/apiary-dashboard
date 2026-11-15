// The pages whose data is several resources combined (#309): the reads, and
// the one function that combines them, shared by the page's loader (which
// awaits them, lib/query.ts ensureAll) and by every component of the page and
// its tabs (usePageQueries), so a refetch of any part re-renders all of them.
import { ensureAll, usePageQueries } from '#/lib/query'
import type { LoaderCache } from '#/lib/query'
import {
  capeRunQuery,
  githubAnalysisQuery,
  payloadAnalysisQuery,
  payloadDeliveryQuery,
  revDeckRunQuery,
  sensorCatalogQuery,
  sensorDetailQuery,
  sourceHealthQuery,
  topologyQuery,
} from './resources'

// ---- a payload and every analysis of it -------------------------------------

const payloadReads = (hash: string) => [payloadAnalysisQuery(hash), capeRunQuery(hash), revDeckRunQuery(hash), githubAnalysisQuery(hash), payloadDeliveryQuery(hash)] as const

/** Null when no payload has this hash (the loader's not-found). */
const payloadPage = ([analysis, cape, revdeck, github, delivery]: Awaited<ReturnType<typeof loadPayloadParts>>) => (analysis ? { analysis, cape, revdeck, github, delivery } : null)

const loadPayloadParts = (cache: LoaderCache, hash: string) => ensureAll(cache, payloadReads(hash))

export const loadPayloadPage = async (cache: LoaderCache, hash: string) => payloadPage(await loadPayloadParts(cache, hash))

export const usePayloadPage = (hash: string) => usePageQueries(payloadReads(hash), payloadPage)

// ---- a sensor, with its feed's health and its exposure in the topology -------

const sensorReads = (sensor: string) => [sensorDetailQuery(sensor), sensorCatalogQuery(), sourceHealthQuery(), topologyQuery()] as const

/** Null when no sensor has this name (the loader's not-found). */
const sensorPage =
  (sensor: string) =>
  ([detail, catalog, health, topology]: Awaited<ReturnType<typeof loadSensorParts>>) =>
    detail
      ? {
          detail,
          catalog,
          feed: health.feeds.find((f) => f.sensor === sensor),
          exposure: topology.sensors.find((s) => s.sensor === sensor),
        }
      : null

const loadSensorParts = (cache: LoaderCache, sensor: string) => ensureAll(cache, sensorReads(sensor))

export const loadSensorPage = async (cache: LoaderCache, sensor: string) => sensorPage(sensor)(await loadSensorParts(cache, sensor))

export const useSensorPage = (sensor: string) => usePageQueries(sensorReads(sensor), sensorPage(sensor))
