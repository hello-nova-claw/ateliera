import type {
  BrokenLinkRepairItem,
  MetadataRepairItem,
  StudioSearchInspection,
  StudioSearchRepairItem,
  StudioSearchService,
  StudioService,
} from '@studio/application';
import type { MarkdownLinkEdit } from '@studio/content';
import type { StudioNote } from '@studio/domain';
import {
  Dialog,
  Inspector,
  type InspectorForwardLink,
  type InspectorOpenReference,
  type InspectorState,
} from '@studio/ui';
import { useState } from 'react';

import { RepairPanel } from '../../features/search/RepairPanel';
import { SearchPage } from '../../features/search/SearchPage';
import { useSearch } from '../../features/search/use-search';
import './SearchRoom.css';

function isSearchService(service: StudioService | undefined): service is StudioService & StudioSearchService {
  if (!service) return false;
  const candidate = service as Partial<StudioSearchService>;
  return typeof candidate.search === 'function' &&
    typeof candidate.searchFacets === 'function' &&
    typeof candidate.inspect === 'function' &&
    typeof candidate.repairQueue === 'function' &&
    typeof candidate.repairMetadata === 'function' &&
    typeof candidate.repairLink === 'function';
}

export default function SearchRoom({
  online = true,
  projectionRevision = 0,
  service,
}: {
  online?: boolean;
  projectionRevision?: number;
  service?: StudioService;
}) {
  const searchService = isSearchService(service) ? service : undefined;
  const view = useSearch(searchService, online, projectionRevision);
  const [inspection, setInspection] = useState<StudioSearchInspection | null>();
  const [inspectorState, setInspectorState] = useState<InspectorState>('ready');
  const [inspectorError, setInspectorError] = useState<string>();
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [repairOpen, setRepairOpen] = useState(false);
  const [repairItems, setRepairItems] = useState<StudioSearchRepairItem[]>([]);
  const [repairState, setRepairState] = useState<'ready' | 'loading' | 'error'>('ready');
  const [repairError, setRepairError] = useState<string>();

  async function inspect(id: string): Promise<void> {
    if (!searchService) return;
    setInspectorOpen(true);
    setInspectorState('loading');
    setInspectorError(undefined);
    try {
      const next = await searchService.inspect(id);
      setInspection(next);
      setInspectorState(next ? (online ? 'ready' : 'offline') : 'missing');
    } catch (reason) {
      setInspectorError(
        reason instanceof Error ? reason.message : 'This note could not be opened.',
      );
      setInspectorState('error');
    }
  }

  async function openReferencedNote(reference: InspectorOpenReference): Promise<void> {
    await inspect(reference.id);
  }

  async function loadRepairs(): Promise<void> {
    if (!searchService) return;
    setRepairState('loading');
    setRepairError(undefined);
    try {
      setRepairItems(await searchService.repairQueue());
      setRepairState('ready');
    } catch (reason) {
      setRepairError(
        reason instanceof Error ? reason.message : 'Repairs could not be opened just now.',
      );
      setRepairState('error');
    }
  }

  function openRepairs(): void {
    setRepairOpen(true);
    void loadRepairs();
  }

  async function finishRepair(): Promise<void> {
    await loadRepairs();
    view.refresh();
  }

  async function repairMetadata(item: MetadataRepairItem, metadata: StudioNote): Promise<void> {
    if (!searchService) return;
    await searchService.repairMetadata({
      path: item.path,
      expectedHash: item.hash,
      sourceText: item.sourceText,
      metadata,
    });
    await finishRepair();
  }

  async function repairLink(item: BrokenLinkRepairItem, edit: MarkdownLinkEdit): Promise<void> {
    if (!searchService) return;
    await searchService.repairLink({
      path: item.path,
      expectedHash: item.hash,
      sourceText: item.sourceText,
      occurrence: item.occurrence,
      edit,
    });
    await finishRepair();
  }

  async function openLinkRepair(link: InspectorForwardLink): Promise<void> {
    if (!searchService || !inspection) return;
    setRepairOpen(true);
    setRepairState('loading');
    setRepairError(undefined);
    try {
      const queue = await searchService.repairQueue();
      const match = queue.find((item): item is BrokenLinkRepairItem =>
        item.kind === 'broken-link' &&
        item.noteId === inspection.note.id &&
        item.occurrence === link.occurrence,
      );
      setRepairItems(match ? [match] : queue);
      setRepairState('ready');
    } catch (reason) {
      setRepairError(
        reason instanceof Error ? reason.message : 'Repairs could not be opened just now.',
      );
      setRepairState('error');
    }
  }

  return (
    <>
      {!searchService && (
        <p className="search-room__unavailable" role="status">
          Search becomes available once your Studio is open.
        </p>
      )}
      <SearchPage
        model={view.model}
        onFiltersChange={view.setFilters}
        {...(searchService ? { onOpenRepairQueue: openRepairs } : {})}
        {...(searchService ? {
          onOpenResult: (id: string) => { void inspect(id); },
        } : {})}
        onQueryChange={view.setQuery}
      />
      <Inspector
        {...(inspectorError ? { errorMessage: inspectorError } : {})}
        isOpen={inspectorOpen}
        onClose={() => setInspectorOpen(false)}
        onOpenNote={openReferencedNote}
        onRepairLink={openLinkRepair}
        onRepairMissing={openRepairs}
        onRetry={() => inspection ? inspect(inspection.note.id) : Promise.resolve()}
        {...(inspection === undefined ? {} : { result: inspection })}
        state={inspectorState}
      />
      <Dialog
        isOpen={repairOpen}
        label="Repair Studio notes"
        onClose={() => setRepairOpen(false)}
        variant="inspector"
      >
        <div className="search-room__repair">
          <button
            aria-label="Close repairs"
            className="search-room__repair-close"
            onClick={() => setRepairOpen(false)}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
          {repairState === 'loading' && <p role="status">Opening repairs…</p>}
          {repairState === 'error' && (
            <div className="search-room__repair-error" role="alert">
              <p>{repairError ?? 'Repairs could not be opened just now.'}</p>
              <button onClick={() => void loadRepairs()} type="button">Try again</button>
            </div>
          )}
          {repairState === 'ready' && (
            <RepairPanel
              items={repairItems}
              onRepairLink={repairLink}
              onRepairMetadata={repairMetadata}
            />
          )}
        </div>
      </Dialog>
    </>
  );
}
