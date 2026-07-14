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
  let disposePromise: Promise<void> | undefined;
  return {
    ...lifecycle,
    ...search,
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
