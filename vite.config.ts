import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  // Relative URLs so Electron loadFile works from dist/index.html.
  // Source: https://vite.dev/config/shared-options.html#base
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@artist-studio/ui-component': path.resolve(
        root,
        'common/ui-component/src/index.ts',
      ),
      '@artist-studio/utils': path.resolve(root, 'common/utils/src/index.ts'),
      '@artist-studio/api-client': path.resolve(
        root,
        'common/packages/api-client/src/index.ts',
      ),
      '@artist-studio/idb-config': path.resolve(
        root,
        'common/packages/idb-config/src/index.ts',
      ),
      '@artist-studio/render': path.resolve(
        root,
        'common/packages/render/src',
      ),
      '@artist-studio/tool-registry': path.resolve(
        root,
        'common/packages/tool-registry/src/index.ts',
      ),
      '@artist-studio/svg-tool': path.resolve(
        root,
        'apps/svg-tool/web/index.ts',
      ),
      '@artist-studio/animated-paint': path.resolve(
        root,
        'apps/animated-paint/web/index.ts',
      ),
      '@artist-studio/cel': path.resolve(root, 'apps/cel/web/index.ts'),
      '@artist-studio/frame-by-frame/library': path.resolve(root, 'apps/frame-by-frame/web/library.ts'),
      '@artist-studio/frame-by-frame': path.resolve(root, 'apps/frame-by-frame/web/index.ts'),
      '@artist-studio/drawing-canvas/library': path.resolve(root, 'apps/drawing-canvas/web/library.ts'),
      '@artist-studio/drawing-canvas': path.resolve(root, 'apps/drawing-canvas/web/index.ts'),
      '@artist-studio/live-character/library': path.resolve(root, 'apps/live-character/web/library.ts'),
      '@artist-studio/live-character': path.resolve(root, 'apps/live-character/web/index.ts'),
      '@artist-studio/tappilot': path.resolve(
        root,
        'apps/tappilot/src/index.ts',
      ),
    },
  },
  server: {
    // Electron waits on 127.0.0.1, so bind IPv4 explicitly instead of letting
    // "localhost" resolve to ::1 only.
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
})
