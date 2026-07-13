import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig, normalizePath, type Plugin } from 'vite';

function studioServiceWorker(): Plugin {
  const source = normalizePath(resolve(import.meta.dirname, 'src/app/service-worker.ts'));
  return {
    name: 'studio-service-worker',
    apply: 'build',
    buildStart() {
      this.emitFile({ type: 'chunk', id: source, name: 'studio-service-worker' });
    },
    generateBundle(_options, bundle) {
      for (const [fileName, output] of Object.entries(bundle)) {
        if (
          output.type !== 'chunk' ||
          output.facadeModuleId === null ||
          normalizePath(output.facadeModuleId) !== source
        ) {
          continue;
        }
        delete bundle[fileName];
        output.fileName = 'service-worker.js';
        bundle['service-worker.js'] = output;
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), studioServiceWorker()],
  server: {
    headers: {
      'Service-Worker-Allowed': '/',
    },
  },
  worker: {
    format: 'es',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
});
