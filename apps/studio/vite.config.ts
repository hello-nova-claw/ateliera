import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { defineConfig, normalizePath, type Plugin, type ResolvedConfig } from 'vite';

function studioServiceWorker(): Plugin {
  const source = normalizePath(resolve(import.meta.dirname, 'src/app/service-worker.ts'));
  let config: ResolvedConfig;
  return {
    name: 'studio-service-worker',
    configResolved(resolved) {
      config = resolved;
    },
    configureServer(server) {
      server.middlewares.use('/service-worker.js', async (_request, response) => {
        const transformed = await server.transformRequest(source);
        if (transformed === null) {
          response.statusCode = 404;
          response.end();
          return;
        }
        response.setHeader('Content-Type', 'text/javascript');
        response.setHeader('Service-Worker-Allowed', '/');
        response.end(
          transformed.code.replaceAll('__STUDIO_BUILD_ID__', 'development'),
        );
      });
    },
    buildStart() {
      if (config.command === 'build') {
        this.emitFile({ type: 'chunk', id: source, name: 'studio-service-worker' });
      }
    },
    generateBundle(_options, bundle) {
      const buildId = createHash('sha256');
      for (const [fileName, output] of Object.entries(bundle)) {
        if (fileName.includes('studio-service-worker')) continue;
        buildId.update(fileName);
        buildId.update(
          output.type === 'asset'
            ? typeof output.source === 'string'
              ? output.source
              : output.source
            : output.code,
        );
      }
      const version = buildId.digest('hex').slice(0, 12);
      for (const [fileName, output] of Object.entries(bundle)) {
        if (
          output.type !== 'chunk' ||
          output.facadeModuleId === null ||
          normalizePath(output.facadeModuleId) !== source
        ) {
          continue;
        }
        delete bundle[fileName];
        output.code = output.code.replaceAll('__STUDIO_BUILD_ID__', version);
        output.fileName = 'service-worker.js';
        bundle['service-worker.js'] = output;
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), studioServiceWorker()],
  build: {
    rollupOptions: {
      input:
        process.env.STUDIO_E2E === '1'
          ? {
              app: resolve(import.meta.dirname, 'index.html'),
              'vault-contract': resolve(import.meta.dirname, 'vault-contract.html'),
            }
          : resolve(import.meta.dirname, 'index.html'),
    },
  },
  server: {
    headers: {
      'Service-Worker-Allowed': '/',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
});
