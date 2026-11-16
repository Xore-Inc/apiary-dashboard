import { existsSync } from 'node:fs'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { assertBootPolicies } from './src/server/policy.ts'

// The dev server reads ./.env itself (dash#330): `bun run dev` loads .env
// for Bun only and does not pass it to vite, which runs under Node. Values
// already in the environment win over the file, as with Bun's own loading.
// The dev server holds itself to the same boot policies as production
// (src/server/policy.ts), with NODE_ENV=development as the dev signal.
if (process.argv.includes('dev')) {
  if (existsSync('.env')) process.loadEnvFile('.env')
  assertBootPolicies({ ...process.env, NODE_ENV: 'development' })
}

/** noVNC's util/browser.js probes H.264 decoding with a module-level
 * top-level await. One such module makes the bundler restructure every
 * route's chunks (dash#305 measured +112 KB gzip across the app for a page
 * almost nobody opens). The probe becomes a promise that updates the same
 * live binding; rfb.js reads it only when it negotiates encodings, after
 * connecting. A noVNC upgrade that changes the line fails the build here
 * instead of silently bringing the cost back. */
function novncWithoutTopLevelAwait(): Plugin {
  const line = 'supportsWebCodecsH264Decode = await _checkWebCodecsH264DecodeSupport();'
  return {
    name: 'apiary:novnc-no-tla',
    transform(code, id) {
      if (!id.replace(/\\/g, '/').endsWith('@novnc/novnc/core/util/browser.js')) return null
      if (!code.includes(line)) throw new Error('noVNC util/browser.js changed: revisit novncWithoutTopLevelAwait in vite.config.ts')
      return { code: code.replace(line, '_checkWebCodecsH264DecodeSupport().then((supported) => { supportsWebCodecsH264Decode = supported });'), map: null }
    },
  }
}

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  // Console piping off: with Vite's own client-console forwarding it echoes
  // every browser error between client and server without end.
  plugins: [novncWithoutTopLevelAwait(), devtools({ consolePiping: { enabled: false } }), tailwindcss(), tanstackStart({
      router: {
        routeFileIgnorePattern: '\\.test\\.',
        // A page is its own pending state (its layout with skeletons), so
        // the component and the pending component ship as one chunk.
        codeSplittingOptions: { defaultBehavior: [['component', 'pendingComponent'], ['errorComponent'], ['notFoundComponent']] },
      },
    }), viteReact()],
})

export default config
