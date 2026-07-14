import {
  createStudioSearchService,
  createStudioService,
  type StudioSearchService,
  type StudioService,
} from '@studio/application';
import type { IndexPort } from '@studio/index';
import type { VaultPort } from '@studio/storage/portable';

import {
  createSearchIndexWorkerClient,
  type SearchIndexWorkerClient,
} from './search-index-worker-client';

export type AppStudioService = StudioService & StudioSearchService;
type ClosableIndex = IndexPort & { close(): Promise<void> };

/**
 * Creates one worker-owned disposable index shared by lifecycle and retrieval.
 * Markdown in the supplied vault remains the only authority.
 */
export function createAppStudioService(
  vault: VaultPort,
  createIndex: () => ClosableIndex = createSearchIndexWorkerClient,
): AppStudioService {
  const index = createIndex();
  const lifecycle = createStudioService({ vault, index });
  const search = createStudioSearchService({ vault, index });
  let initialRebuildComplete = false;
  let startPromise: Promise<void> | undefined;
  let disposePromise: Promise<void> | undefined;
  return {
    ...lifecycle,
    ...search,
    start() {
      startPromise ??= (async () => {
        await lifecycle.start();
        await lifecycle.rebuildIndex();
        initialRebuildComplete = true;
      })().catch((error: unknown) => {
        startPromise = undefined;
        throw error;
      });
      return startPromise;
    },
    indexState() {
      const current = lifecycle.indexState();
      return initialRebuildComplete || current === 'stale' ? current : 'rebuilding';
    },
    dispose() {
      if (disposePromise !== undefined) return disposePromise;
      disposePromise = (async () => {
        try {
          await lifecycle.dispose();
        } finally {
          await index.close();
        }
      })();
      return disposePromise;
    },
  };
}

export type { SearchIndexWorkerClient };
