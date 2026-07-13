import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  defineConfig,
  normalizePath,
  type Plugin,
  type ResolvedConfig,
} from 'vite';

interface PrecacheEntry {
  url: string;
  revision: string;
}

const publicPrecacheFiles = [
  'manifest.webmanifest',
  'apple-touch-icon.png',
  'studio-icon.svg',
  'studio-maskable.svg',
] as const;

function revision(source: string | Uint8Array): string {
  return createHash('sha256').update(source).digest('hex');
}

function studioServiceWorker(): Plugin {
  const source = normalizePath(
    resolve(import.meta.dirname, 'src/app/service-worker.ts'),
  );
  let config: ResolvedConfig;
  return {
    name: 'studio-service-worker',
    configResolved(resolved) {
      config = resolved;
    },
    configureServer(server) {
      server.middlewares.use(
        '/service-worker.js',
        async (_request, response) => {
          const transformed = await server.transformRequest(source);
          if (transformed === null) {
            response.statusCode = 404;
            response.end();
            return;
          }
          response.setHeader('Content-Type', 'text/javascript');
          response.setHeader('Service-Worker-Allowed', '/');
          response.end(
            transformed.code
              .replaceAll('__STUDIO_BUILD_ID__', 'development')
              .replaceAll(
                '__STUDIO_PRECACHE_MANIFEST__',
                JSON.stringify(
                  ['/', ...publicPrecacheFiles.map((file) => `/${file}`)].map(
                    (url) => ({ url, revision: 'development' }),
                  ),
                ),
              ),
          );
        },
      );
    },
    buildStart() {
      if (config.command === 'build') {
        this.emitFile({
          type: 'chunk',
          id: source,
          name: 'studio-service-worker',
        });
      }
    },
    generateBundle(_options, bundle) {
      const entries: PrecacheEntry[] = [];
      for (const [fileName, output] of Object.entries(bundle)) {
        if (fileName.includes('studio-service-worker')) continue;
        const source = output.type === 'asset' ? output.source : output.code;
        entries.push({
          url: fileName === 'index.html' ? '/' : `/${fileName}`,
          revision: revision(
            typeof source === 'string' ? source : new Uint8Array(source),
          ),
        });
      }
      if (!entries.some(({ url }) => url === '/')) {
        entries.push({
          url: '/',
          revision: revision(
            readFileSync(resolve(import.meta.dirname, 'index.html')),
          ),
        });
      }
      for (const fileName of publicPrecacheFiles) {
        entries.push({
          url: `/${fileName}`,
          revision: revision(
            readFileSync(resolve(import.meta.dirname, 'public', fileName)),
          ),
        });
      }
      entries.sort((left, right) => left.url.localeCompare(right.url));
      const version = revision(JSON.stringify(entries)).slice(0, 12);
      const manifest = JSON.stringify({ version, entries });
      this.emitFile({
        type: 'asset',
        fileName: 'studio-precache-manifest.json',
        source: manifest,
      });
      const serviceWorkerEntries = [
        ...entries,
        {
          url: '/studio-precache-manifest.json',
          revision: revision(manifest),
        },
      ];
      for (const [fileName, output] of Object.entries(bundle)) {
        if (
          output.type !== 'chunk' ||
          output.facadeModuleId === null ||
          normalizePath(output.facadeModuleId) !== source
        ) {
          continue;
        }
        delete bundle[fileName];
        output.code = output.code
          .replaceAll('__STUDIO_BUILD_ID__', version)
          .replaceAll(
            '__STUDIO_PRECACHE_MANIFEST__',
            JSON.stringify(serviceWorkerEntries),
          );
        output.fileName = 'service-worker.js';
        bundle['service-worker.js'] = output;
      }
    },
  };
}

function studioEntryBudget(maxBytes = 500_000): Plugin {
  return {
    name: 'studio-entry-budget',
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (
          output.type !== 'chunk' ||
          !output.isEntry ||
          output.name === 'studio-service-worker'
        ) {
          continue;
        }
        const bytes = Buffer.byteLength(output.code);
        if (bytes > maxBytes) {
          this.error(
            `Startup entry ${output.fileName} is ${bytes.toLocaleString('en')} bytes; budget is ${maxBytes.toLocaleString('en')} bytes. Move non-startup work behind a dynamic import.`,
          );
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), studioEntryBudget(), studioServiceWorker()],
  build: {
    rollupOptions: {
      input:
        process.env.STUDIO_E2E === '1'
          ? {
              app: resolve(import.meta.dirname, 'index.html'),
              'vault-contract': resolve(
                import.meta.dirname,
                'vault-contract.html',
              ),
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
