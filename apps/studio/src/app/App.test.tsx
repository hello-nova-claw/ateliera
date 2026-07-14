import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {
  StudioSaveConflictError,
  type SavedNote,
  type StudioCardProjection,
  type StudioEventListener,
  type StudioService,
} from '@studio/application';
import { defaultLifeAreas, type StudioNote } from '@studio/domain';
import type { VaultPort } from '@studio/storage/portable';
import { StrictMode } from 'react';
import { afterEach, vi } from 'vitest';
import { App } from './App';

const selectTauriVault = vi.fn();
const createTauriStudio = vi.fn();

vi.mock('@studio/storage/tauri', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@studio/storage/tauri')>()),
  createTauriStudio,
  selectTauriVault,
}));

afterEach(() => {
  cleanup();
  history.replaceState(null, '', '/foyer');
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
  createTauriStudio.mockReset();
  selectTauriVault.mockReset();
  vi.unstubAllGlobals();
});

const note: StudioNote = {
  schemaVersion: 1,
  id: 'note-1',
  title: 'A remembered note',
  body: 'Original words',
  cardType: 'capture',
  semanticType: 'reflection',
  status: 'draft',
  rooms: ['inbox'],
  lifeAreas: [],
  seasons: [],
  tags: [],
  created: '2026-07-13T00:00:00.000Z',
  updated: '2026-07-13T00:00:00.000Z',
  attachments: [],
  display: { featured: false },
  privacy: { sensitivity: 'private', aiAccess: 'ask' },
  extraFrontmatter: {},
};

function projection(excerpt: string): StudioCardProjection {
  return {
    noteId: note.id,
    path: 'Inbox/a-remembered-note.md',
    title: note.title!,
    excerpt,
    semanticType: note.semanticType,
    cardType: note.cardType,
    status: note.status,
    updated: note.updated,
  };
}

function studioService(overrides: Partial<StudioService> = {}) {
  let listener: StudioEventListener | undefined;
  const unsubscribe = vi.fn();
  const service: StudioService = {
    views: { load: async () => [], save: async () => undefined },
    lifeAreas: {
      load: async () => ({
        areas: defaultLifeAreas.map((area, order) => ({
          ...area,
          hidden: order >= 5,
          order,
        })),
        repairRequired: false,
        revision: null,
      }),
      save: async (areas, revision) => ({
        areas: [...areas],
        repairRequired: false,
        revision: revision ?? 'hash-1',
      }),
    },
    seasonTransactions: {
      readActive: vi.fn(async () => ({
        value: {
          version: 1 as const,
          revision: 0,
          activeNoteId: null,
          activePath: null,
          operation: null,
        },
        hash: null,
      })),
      compareAndSetActive: vi.fn(),
      readCloseJournal: vi.fn(async () => ({ value: null, hash: null })),
      compareAndSetCloseJournal: vi.fn(),
      removeCloseJournal: vi.fn(),
    },
    start: vi.fn(async () => undefined),
    dispose: vi.fn(async () => undefined),
    subscribe: vi.fn((next) => {
      listener = next;
      return unsubscribe;
    }),
    capture: vi.fn(async () => ({
      note,
      path: 'Inbox/a-remembered-note.md',
      hash: 'hash-1',
    })),
    load: vi.fn(async () => ({
      note,
      path: 'Inbox/a-remembered-note.md',
      hash: 'hash-1',
    })),
    save: vi.fn(async ({ note: saved }) => ({
      note: saved,
      path: 'Inbox/a-remembered-note.md',
      hash: 'hash-2',
    })),
    archive: vi.fn(),
    unarchive: vi.fn(),
    trash: vi.fn(),
    restore: vi.fn(),
    reconcileTrash: vi.fn(async () => []),
    snapshot: vi.fn(),
    prepareSeasonCloseTransaction: vi.fn(),
    pendingSeasonCloseTransaction: vi.fn(async () => null),
    closeSeasonTransaction: vi.fn(),
    resumeSeasonCloseTransaction: vi.fn(async () => null),
    repairs: vi.fn(async () => []),
    rebuildIndex: vi.fn(async () => undefined),
    indexState: vi.fn(() => 'ready' as const),
    projectRoom: vi.fn(async () => [projection(note.body)]),
    projectLandscape: vi.fn(async () => []),
    projectLandscapeBoard: vi.fn(async () => ({ cells: [] })),
    updateLandscapePlacement: vi.fn(),
    projectUncharted: vi.fn(async () => ({ cards: [] })),
    inviteUnchartedToSeason: vi.fn(),
    projectReflectionGarden: vi.fn(async () => ({ cards: [], themes: [] })),
    linkReflectionEvidence: vi.fn(),
    resolveReflectionEvidenceTarget: vi.fn(async ({ id, kind }) => ({
      id,
      kind,
      targetState: 'missing' as const,
    })),
    projectCurrentSeason: vi.fn(async () => ({ current: null, conflicts: [] })),
    projectStream: vi.fn(async () => []),
    resolveCover: vi.fn(async () => ({ kind: 'none' as const })),
    clearCover: vi.fn(),
    projectFoyer: vi.fn(async () => ({
      currentSeason: null,
      featured: [],
      becoming: null,
      feelings: [],
      principles: [],
      priorities: [],
      returning: null,
      image: null,
    })),
    ...overrides,
  };
  return {
    emit: (event: Parameters<StudioEventListener>[0]) => listener?.(event),
    service,
    unsubscribe,
  };
}

it('announces the canonical Foyer after an unknown URL is replaced', async () => {
  history.replaceState(null, '', '/somewhere-unknown');
  const replaceState = vi.spyOn(history, 'replaceState');

  render(
    <App
      captureService={{
        capture: async (text) => ({ id: 'test', text }),
        list: async () => [],
      }}
    />,
  );

  expect(replaceState).toHaveBeenCalledWith(null, '', '/foyer');
  await waitFor(() => expect(document.title).toBe('Foyer — The Studio'));
  expect(screen.getByText(/Foyer opened\./)).toBeInTheDocument();
});

it('renders the Studio landmark', async () => {
  render(
    <App
      captureService={{
        capture: async (text) => ({ id: 'test', text }),
        list: async () => [],
      }}
    />,
  );
  await act(async () => {
    await Promise.resolve();
  });
  expect(screen.getByRole('main', { name: 'The Studio' })).toBeVisible();
  expect(screen.queryByText('Ready offline')).not.toBeInTheDocument();
});

it('makes the active vault available to portable settings', async () => {
  history.replaceState(null, '', '/settings');
  const fixture = studioService();
  render(
    <App
      studioId="studio:portable"
      studioService={fixture.service}
      vault={{} as VaultPort}
    />,
  );

  expect(
    await screen.findByRole('heading', { name: 'Backup & restore' }),
  ).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Download portable backup' }),
  ).toBeEnabled();
  expect(screen.getByLabelText('Choose a Studio backup')).toBeEnabled();
});

it('makes live shell connectivity available to local-first rooms', async () => {
  history.replaceState(null, '', '/uncharted');
  let online = true;
  const onlineSpy = vi.spyOn(navigator, 'onLine', 'get').mockImplementation(
    () => online,
  );
  const fixture = studioService();
  render(<App studioId="studio:first" studioService={fixture.service} />);
  expect(await screen.findByRole('heading', { name: 'What if…?' })).toBeVisible();

  online = false;
  fireEvent(window, new Event('offline'));
  expect(
    await screen.findByText('Stored locally. This room remains available offline.'),
  ).toBeVisible();
  onlineSpy.mockRestore();
});

it('projects the Foyer through the active Studio and opens its canonical note', async () => {
  const becoming = {
    ...projection('I am practicing creating from calm.'),
    cardType: 'identity',
    title: 'A woman who creates from calm',
    path: 'Foyer/becoming.md',
  };
  const fixture = studioService({
    projectFoyer: vi.fn(async () => ({
      currentSeason: null,
      featured: [becoming],
      becoming,
      feelings: [],
      principles: [],
      priorities: [],
      returning: null,
      image: null,
    })),
    load: vi.fn(async () => ({
      note: {
        ...note,
        id: becoming.noteId,
        title: becoming.title,
        body: becoming.excerpt,
      },
      path: becoming.path,
      hash: 'hash-1',
    })),
  });
  render(<App studioId="studio:first" studioService={fixture.service} />);

  expect(
    await screen.findByText('A woman who creates from calm'),
  ).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Edit becoming' }));
  expect(fixture.service.load).toHaveBeenCalledWith('Foyer/becoming.md');
  expect(
    await screen.findByRole('dialog', { name: 'Edit note' }),
  ).toBeVisible();
});

it('turns an empty Foyer invitation into a canonical featured note', async () => {
  const fixture = studioService();
  render(<App studioId="studio:first" studioService={fixture.service} />);
  expect(
    await screen.findByText('What are you currently becoming?'),
  ).toBeVisible();

  fireEvent.click(
    screen.getByRole('button', { name: 'Add a becoming sentence' }),
  );
  fireEvent.change(
    screen.getByRole('textbox', { name: 'What would you like remembered?' }),
    { target: { value: 'A woman who creates from calm' } },
  );
  fireEvent.click(screen.getByRole('button', { name: 'Remember' }));

  await waitFor(() =>
    expect(fixture.service.capture).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'A woman who creates from calm',
        placement: 'foyer-becoming',
      }),
    ),
  );
  expect(fixture.service.save).not.toHaveBeenCalled();
});

it('removes only the projected cover under its exact hash', async () => {
  let coverPresent = true;
  const image = {
    noteId: note.id,
    path: 'Foyer/image.md',
    hash: 'cover-hash',
    source: '../Attachments/morning.png',
    alt: 'Morning light',
  };
  const fixture = studioService({
    resolveCover: vi.fn(async () => ({
      kind: 'unavailable' as const,
      reason: 'missing' as const,
      reference: image.source,
    })),
    projectFoyer: vi.fn(async () => ({
      currentSeason: null,
      featured: [],
      becoming: null,
      feelings: [],
      principles: [],
      priorities: [],
      returning: null,
      image: coverPresent ? image : null,
    })),
    clearCover: vi.fn(async () => {
      coverPresent = false;
      return {
        note: { ...note, display: { featured: true } },
        path: image.path,
        hash: 'cleared-hash',
      };
    }),
  });
  render(<App studioId="studio:first" studioService={fixture.service} />);

  fireEvent.click(
    await screen.findByRole('button', { name: 'Remove this image' }),
  );
  await waitFor(() =>
    expect(fixture.service.clearCover).toHaveBeenCalledWith(
      'Foyer/image.md',
      'cover-hash',
    ),
  );
  expect(fixture.service.trash).not.toHaveBeenCalled();
  expect(await screen.findByText('Image removed.')).toBeVisible();
});

it('keeps the cover note visible when exact-hash removal conflicts', async () => {
  const image = {
    noteId: note.id,
    path: 'Foyer/image.md',
    hash: 'stale-hash',
    source: '../Attachments/morning.png',
    alt: 'Morning light',
  };
  const conflict = new StudioSaveConflictError(note, 'durable note text');
  const fixture = studioService({
    resolveCover: vi.fn(async () => ({
      kind: 'unavailable' as const,
      reason: 'missing' as const,
      reference: image.source,
    })),
    projectFoyer: vi.fn(async () => ({
      currentSeason: null,
      featured: [],
      becoming: null,
      feelings: [],
      principles: [],
      priorities: [],
      returning: null,
      image,
    })),
    clearCover: vi.fn(async () => {
      throw conflict;
    }),
  });
  render(<App studioId="studio:first" studioService={fixture.service} />);

  fireEvent.click(
    await screen.findByRole('button', { name: 'Remove this image' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'This note changed elsewhere',
  );
  expect(screen.getByText('This image is not available here.')).toBeVisible();
  expect(fixture.service.trash).not.toHaveBeenCalled();
});

it('describes best-effort local storage without an alarm', async () => {
  render(
    <App
      captureService={{
        capture: async (text) => ({ id: 'test', text }),
        list: async () => [],
      }}
      requestPersistence={async () => 'best-effort'}
    />,
  );
  fireEvent.click(screen.getAllByRole('button', { name: 'Capture' })[0]!);
  fireEvent.change(
    screen.getByRole('textbox', { name: 'What would you like remembered?' }),
    { target: { value: 'The hill' } },
  );
  fireEvent.click(screen.getByRole('button', { name: 'Remember' }));
  expect(
    await screen.findByText(
      'Stored locally; this browser may clear it if space is needed.',
    ),
  ).toBeVisible();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it.each(['Not now', 'Remember'])(
  'returns focus to Capture after %s closes the composer',
  async (action) => {
    render(
      <App
        captureService={{
          capture: async (text) => ({ id: 'test', text }),
          list: async () => [],
        }}
      />,
    );
    const capture = screen.getAllByRole('button', { name: 'Capture' })[0]!;
    fireEvent.click(capture);
    if (action === 'Remember') {
      fireEvent.change(
        screen.getByRole('textbox', {
          name: 'What would you like remembered?',
        }),
        { target: { value: 'The hill' } },
      );
    }
    fireEvent.click(screen.getByRole('button', { name: action }));
    await waitFor(() =>
      expect(
        screen.getAllByRole('button', { name: 'Capture' })[0],
      ).toHaveFocus(),
    );
  },
);

it('asks the native shell to select a Studio folder before opening an existing Studio', async () => {
  Object.defineProperty(window, '__TAURI_INTERNALS__', {
    configurable: true,
    value: {},
  });
  selectTauriVault.mockResolvedValue(null);

  render(<App />);
  fireEvent.click(
    screen.getByRole('button', { name: 'Open an existing Studio' }),
  );

  await waitFor(() => expect(selectTauriVault).toHaveBeenCalledOnce());
  expect(
    screen.getByRole('heading', { name: 'Make this space yours.' }),
  ).toBeVisible();
});

it('requires native folder selection again after a persisted browser-style relaunch', async () => {
  Object.defineProperty(window, '__TAURI_INTERNALS__', {
    configurable: true,
    value: {},
  });
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => (key === 'studio:opened' ? 'true' : null),
    setItem: vi.fn(),
  });
  selectTauriVault.mockResolvedValue(null);

  render(<App />);

  expect(
    screen.getByRole('heading', { name: 'Make this space yours.' }),
  ).toBeVisible();
  fireEvent.click(
    screen.getByRole('button', { name: 'Open an existing Studio' }),
  );
  await waitFor(() => expect(selectTauriVault).toHaveBeenCalledOnce());
  expect(
    screen.getByRole('heading', { name: 'Make this space yours.' }),
  ).toBeVisible();
});

it('creates a named native Studio separately from opening an existing one', async () => {
  Object.defineProperty(window, '__TAURI_INTERNALS__', {
    configurable: true,
    value: {},
  });
  let finishCreate: ((value: null) => void) | undefined;
  createTauriStudio.mockImplementation(
    () =>
      new Promise<null>((resolve) => {
        finishCreate = resolve;
      }),
  );

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Create a Studio' }));
  fireEvent.change(screen.getByLabelText('Studio name'), {
    target: { value: '  Anna’s Studio  ' },
  });
  fireEvent.click(screen.getByRole('button', { name: /^Create$/ }));

  await waitFor(() =>
    expect(createTauriStudio).toHaveBeenCalledWith('Anna’s Studio'),
  );
  expect(selectTauriVault).not.toHaveBeenCalled();
  expect(
    screen.getByRole('button', { name: 'Creating your Studio…' }),
  ).toBeDisabled();
  finishCreate?.(null);
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: /^Create$/ }),
    ).toBeEnabled(),
  );
});

it('uses calm Studio language when native creation cannot finish', async () => {
  Object.defineProperty(window, '__TAURI_INTERNALS__', {
    configurable: true,
    value: {},
  });
  createTauriStudio.mockRejectedValue(new Error('vault_unavailable'));

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Create a Studio' }));
  fireEvent.click(screen.getByRole('button', { name: /^Create$/ }));

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent(
    'Your Studio couldn’t be created. Choose another location or try again.',
  );
  expect(alert).not.toHaveTextContent(/vault/i);
});

it('starts, subscribes, and reprojects the active Studio without leaking its subscription', async () => {
  let cards = [projection('Original words')];
  const first = studioService({ projectRoom: vi.fn(async () => cards) });
  const second = studioService({ projectRoom: vi.fn(async () => []) });
  const view = render(
    <App studioId="studio:first" studioService={first.service} />,
  );

  expect(
    await screen.findByRole('button', { name: 'Original words' }),
  ).toBeVisible();
  expect(first.service.start).toHaveBeenCalledOnce();
  expect(first.service.subscribe).toHaveBeenCalledOnce();

  cards = [projection('Edited words')];
  act(() =>
    first.emit({
      kind: 'note-saved',
      noteId: note.id,
      path: 'Inbox/a-remembered-note.md',
    }),
  );
  expect(
    await screen.findByRole('button', { name: 'Edited words' }),
  ).toBeVisible();

  view.rerender(
    <App studioId="studio:second" studioService={second.service} />,
  );
  await waitFor(() => expect(second.service.start).toHaveBeenCalledOnce());
  expect(first.unsubscribe).toHaveBeenCalledOnce();
  await waitFor(() => expect(first.service.dispose).toHaveBeenCalledOnce());

  view.unmount();
  expect(second.unsubscribe).toHaveBeenCalledOnce();
  await waitFor(() => expect(second.service.dispose).toHaveBeenCalledOnce());
});

it('reprojects the durable card after keeping the other version', async () => {
  let cards = [projection('Original words')];
  const conflict = new StudioSaveConflictError(
    { ...note, body: 'Mine' },
    '---\nschema_version: 1\nid: note-1\n---\n\nOther words',
  );
  const fixture = studioService({
    projectRoom: vi.fn(async () => cards),
    save: vi.fn(async () => {
      cards = [projection('Other words')];
      throw conflict;
    }),
  });
  render(<App studioId="studio:first" studioService={fixture.service} />);

  fireEvent.click(
    await screen.findByRole('button', { name: 'Original words' }),
  );
  const title = await screen.findByRole('textbox', { name: 'Title' });
  fireEvent.change(title, { target: { value: 'Mine' } });
  fireEvent.blur(title);
  fireEvent.click(await screen.findByRole('button', { name: 'Keep other' }));

  expect(
    await screen.findByRole('button', { name: 'Other words' }),
  ).toBeVisible();
});

it('applies optional capture meaning in the single atomic capture operation', async () => {
  const fixture = studioService();
  render(<App studioId="studio:first" studioService={fixture.service} />);

  fireEvent.click(screen.getAllByRole('button', { name: 'Capture' })[0]!);
  fireEvent.change(
    screen.getByRole('textbox', { name: 'What would you like remembered?' }),
    { target: { value: 'A possible retreat' } },
  );
  fireEvent.change(
    screen.getByRole('combobox', { name: 'Meaning (optional)' }),
    {
      target: { value: 'uncharted' },
    },
  );
  fireEvent.click(screen.getByRole('button', { name: 'Remember' }));

  await waitFor(() =>
    expect(fixture.service.capture).toHaveBeenCalledWith({
      body: 'A possible retreat',
      semanticType: 'uncharted',
    }),
  );
  expect(fixture.service.save).not.toHaveBeenCalled();
});

it('lets editor cleanup enqueue its final save before unmount disposal drains the service', async () => {
  const order: string[] = [];
  const fixture = studioService({
    save: vi.fn(async ({ note: saved }) => {
      order.push('save');
      return {
        note: saved,
        path: 'Inbox/a-remembered-note.md',
        hash: 'hash-2',
      };
    }),
    dispose: vi.fn(async () => {
      order.push('dispose');
    }),
  });
  const view = render(
    <App studioId="studio:first" studioService={fixture.service} />,
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Original words' }),
  );
  fireEvent.change(await screen.findByRole('textbox', { name: 'Title' }), {
    target: { value: 'Changed before leaving' },
  });

  view.unmount();
  await waitFor(() => expect(fixture.service.dispose).toHaveBeenCalledOnce());

  expect(order).toEqual(['save', 'dispose']);
});

it('does not terminally dispose a Studio during the Strict Mode lifecycle probe', async () => {
  const fixture = studioService();
  const view = render(
    <StrictMode>
      <App studioId="studio:first" studioService={fixture.service} />
    </StrictMode>,
  );

  expect(
    await screen.findByRole('button', { name: 'Original words' }),
  ).toBeVisible();
  await act(async () => Promise.resolve());
  expect(fixture.service.dispose).not.toHaveBeenCalled();

  view.unmount();
  await waitFor(() => expect(fixture.service.dispose).toHaveBeenCalledOnce());
});

it('holds navigation until the dirty editor flush completes', async () => {
  let finish: (() => void) | undefined;
  const fixture = studioService({
    save: vi.fn(
      ({ note: saved }) =>
        new Promise<SavedNote>((resolve) => {
          finish = () =>
            resolve({
              note: saved,
              path: 'Inbox/a-remembered-note.md',
              hash: 'hash-2',
            });
        }),
    ),
  });
  render(<App studioId="studio:first" studioService={fixture.service} />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Original words' }),
  );
  fireEvent.change(await screen.findByRole('textbox', { name: 'Title' }), {
    target: { value: 'Changed before navigating' },
  });

  fireEvent.click(screen.getByRole('link', { name: 'Life Landscape' }));

  expect(location.pathname).toBe('/foyer');
  expect(screen.getByRole('dialog', { name: 'Edit note' })).toBeVisible();
  expect(fixture.service.save).toHaveBeenCalledOnce();
  await act(async () => finish?.());
  await waitFor(() => expect(location.pathname).toBe('/landscape'));
  expect(
    screen.queryByRole('dialog', { name: 'Edit note' }),
  ).not.toBeInTheDocument();
});

it('keeps failed navigation and the dirty editor in place', async () => {
  const fixture = studioService({
    save: vi.fn().mockRejectedValue(new Error('Disk unavailable')),
  });
  render(<App studioId="studio:first" studioService={fixture.service} />);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Original words' }),
  );
  fireEvent.change(await screen.findByRole('textbox', { name: 'Title' }), {
    target: { value: 'Changed before navigating' },
  });

  fireEvent.click(screen.getByRole('link', { name: 'Life Landscape' }));

  expect(
    await screen.findByText(/could not be saved.*Retry before closing/i),
  ).toBeVisible();
  expect(location.pathname).toBe('/foyer');
  expect(screen.getByRole('dialog', { name: 'Edit note' })).toBeVisible();
});
