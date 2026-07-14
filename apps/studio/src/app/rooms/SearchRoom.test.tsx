import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type {
  StudioSearchInspection,
  StudioSearchRepairItem,
  StudioSearchService,
  StudioService,
} from '@studio/application';
import type { StudioNote } from '@studio/domain';
import type { SearchFacets, SearchHit } from '@studio/index';

import SearchRoom from './SearchRoom';

const note: StudioNote = {
  schemaVersion: 1,
  id: 'quiet-hill',
  title: 'The quiet hill',
  body: 'A calm place. [[Missing garden]]',
  cardType: 'note',
  semanticType: 'reflection',
  status: 'active',
  rooms: ['reflection-garden'],
  lifeAreas: ['family'],
  seasons: [],
  tags: ['calm'],
  created: '2026-07-13T00:00:00.000Z',
  updated: '2026-07-14T00:00:00.000Z',
  attachments: [],
  display: { featured: false },
  privacy: { sensitivity: 'private', aiAccess: 'ask' },
  extraFrontmatter: {},
};

const hit: SearchHit = {
  id: note.id,
  path: 'Reflection/The quiet hill.md',
  title: note.title!,
  snippet: 'A calm place.',
  highlightRanges: [{ start: 2, end: 6 }],
  semanticType: note.semanticType,
  cardType: note.cardType,
  status: note.status,
  updated: note.updated,
  score: 1,
  matchReason: { strategy: 'keyword', field: 'body', text: 'calm' },
};

const inspection: StudioSearchInspection = {
  note,
  path: hit.path,
  hash: 'a'.repeat(64),
  backlinks: [],
  forwardLinks: [{
    occurrence: 0,
    linkKind: 'wiki',
    target: 'Missing garden',
    label: 'Missing garden',
    start: 14,
    end: 32,
    state: 'broken',
  }],
};

const facets: SearchFacets = {
  rooms: [],
  semanticTypes: [{ value: 'reflection', count: 1 }],
  lifeAreas: [],
  seasons: [],
  statuses: [],
  tags: [],
  cardTypes: [],
};

function service(overrides: Partial<StudioSearchService> = {}): StudioService {
  const searchService: StudioSearchService = {
    search: vi.fn().mockResolvedValue([hit]),
    searchFacets: vi.fn().mockResolvedValue(facets),
    inspect: vi.fn().mockResolvedValue(inspection),
    repairQueue: vi.fn().mockResolvedValue([]),
    repairMetadata: vi.fn(),
    repairLink: vi.fn(),
    ...overrides,
  };
  return searchService as unknown as StudioService;
}

describe('SearchRoom', () => {
  it('loads local results and opens their canonical inspector', async () => {
    const searchService = service();
    render(<SearchRoom service={searchService} />);

    const result = await screen.findByRole('button', { name: 'The quiet hill' });
    result.focus();
    fireEvent.click(result);

    expect(await screen.findByRole('dialog', { name: 'Inspect The quiet hill' })).toBeVisible();
    expect(screen.getByText('A calm place. [[Missing garden]]')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Close inspector' }));
    await waitFor(() => expect(result).toHaveFocus());
  });

  it('keeps the inspector open while following a resolved backlink', async () => {
    const linked = { ...note, id: 'linked', title: 'Linked note', body: 'Linked body.' };
    const inspect = vi.fn()
      .mockResolvedValueOnce({
        ...inspection,
        backlinks: [{ id: linked.id, path: 'Reflection/Linked.md', title: linked.title }],
      })
      .mockResolvedValueOnce({ ...inspection, note: linked, path: 'Reflection/Linked.md' });
    render(<SearchRoom service={service({ inspect })} />);

    fireEvent.click(await screen.findByRole('button', { name: 'The quiet hill' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Show links' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open Linked note' }));
    });

    expect(await screen.findByRole('dialog', { name: 'Inspect Linked note' })).toBeVisible();
    expect(screen.getByText('Linked body.')).toBeVisible();
  });

  it('opens the repair workspace and refreshes the queue after an exact repair', async () => {
    const repair: StudioSearchRepairItem = {
      kind: 'broken-link',
      occurrence: 0,
      linkKind: 'wiki',
      target: 'Missing garden',
      label: 'Missing garden',
      start: 14,
      end: 32,
      path: inspection.path,
      hash: inspection.hash,
      sourceText: 'source',
      noteId: note.id,
      state: 'broken',
    };
    const repairQueue = vi.fn().mockResolvedValue([])
      .mockResolvedValueOnce([repair])
      .mockResolvedValueOnce([repair])
      .mockResolvedValueOnce([]);
    const repairLink = vi.fn().mockResolvedValue({ note, path: inspection.path, hash: 'b'.repeat(64) });
    render(<SearchRoom service={service({ repairLink, repairQueue })} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Review 1 repair item' }));
    expect(await screen.findByRole('dialog', { name: 'Repair Studio notes' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Remove link' }));

    await waitFor(() => expect(repairLink).toHaveBeenCalledWith({
      path: repair.path,
      expectedHash: repair.hash,
      sourceText: repair.sourceText,
      occurrence: repair.occurrence,
      edit: { kind: 'remove' },
    }));
    expect(await screen.findByText('Nothing needs repair.')).toBeVisible();
  });

  it('retries the exact requested note after its first inspection fails', async () => {
    const inspect = vi.fn()
      .mockRejectedValueOnce(new Error('Vault unavailable'))
      .mockResolvedValueOnce(inspection);
    render(<SearchRoom service={service({ inspect })} />);

    fireEvent.click(await screen.findByRole('button', { name: 'The quiet hill' }));
    expect(await screen.findByText('This note could not be opened.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('dialog', { name: 'Inspect The quiet hill' })).toBeVisible();
    expect(inspect).toHaveBeenNthCalledWith(2, note.id);
  });

  it('shows a calm unavailable state when the base service lacks search', async () => {
    render(<SearchRoom service={{} as StudioService} />);
    expect(await screen.findByText('Search becomes available once your Studio is open.')).toBeVisible();
  });
});
