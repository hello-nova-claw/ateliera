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
  type StudioCardProjection,
  type StudioEventListener,
  type StudioService,
} from '@studio/application';
import type { StudioNote } from '@studio/domain';
import { StrictMode } from 'react';
import { afterEach, vi } from 'vitest';
import { App } from './App';

const selectTauriVault = vi.fn();

vi.mock('@studio/storage/tauri', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@studio/storage/tauri')>()),
  selectTauriVault,
}));

afterEach(() => {
  cleanup();
  history.replaceState(null, '', '/foyer');
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
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
    status: note.status,
    updated: note.updated,
  };
}

function studioService(overrides: Partial<StudioService> = {}) {
  let listener: StudioEventListener | undefined;
  const unsubscribe = vi.fn();
  const service: StudioService = {
    views: { load: async () => [], save: async () => undefined },
    start: vi.fn(async () => undefined),
    dispose: vi.fn(async () => undefined),
    subscribe: vi.fn((next) => {
      listener = next;
      return unsubscribe;
    }),
    capture: vi.fn(async () => ({ note, path: 'Inbox/a-remembered-note.md', hash: 'hash-1' })),
    load: vi.fn(async () => ({ note, path: 'Inbox/a-remembered-note.md', hash: 'hash-1' })),
    save: vi.fn(async ({ note: saved }) => ({ note: saved, path: 'Inbox/a-remembered-note.md', hash: 'hash-2' })),
    repairs: vi.fn(async () => []),
    rebuildIndex: vi.fn(async () => undefined),
    indexState: vi.fn(() => 'ready' as const),
    projectRoom: vi.fn(async () => [projection(note.body)]),
    projectLandscape: vi.fn(async () => []),
    projectCurrentSeason: vi.fn(async () => ({ current: null, conflicts: [] })),
    projectStream: vi.fn(async () => []),
    projectFoyer: vi.fn(async () => ({ currentSeason: null, featured: [] })),
    ...overrides,
  };
  return { emit: (event: Parameters<StudioEventListener>[0]) => listener?.(event), service, unsubscribe };
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

it('asks the native shell to select a vault before opening the Studio', async () => {
  Object.defineProperty(window, '__TAURI_INTERNALS__', {
    configurable: true,
    value: {},
  });
  selectTauriVault.mockResolvedValue(null);

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Open this Studio' }));

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
  fireEvent.click(screen.getByRole('button', { name: 'Open this Studio' }));
  await waitFor(() => expect(selectTauriVault).toHaveBeenCalledOnce());
  expect(
    screen.getByRole('heading', { name: 'Make this space yours.' }),
  ).toBeVisible();
});

it('starts, subscribes, and reprojects the active Studio without leaking its subscription', async () => {
  let cards = [projection('Original words')];
  const first = studioService({ projectRoom: vi.fn(async () => cards) });
  const second = studioService({ projectRoom: vi.fn(async () => []) });
  const view = render(<App studioId="studio:first" studioService={first.service} />);

  expect(await screen.findByRole('button', { name: 'Original words' })).toBeVisible();
  expect(first.service.start).toHaveBeenCalledOnce();
  expect(first.service.subscribe).toHaveBeenCalledOnce();

  cards = [projection('Edited words')];
  act(() => first.emit({ kind: 'note-saved', noteId: note.id, path: 'Inbox/a-remembered-note.md' }));
  expect(await screen.findByRole('button', { name: 'Edited words' })).toBeVisible();

  view.rerender(<App studioId="studio:second" studioService={second.service} />);
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

  fireEvent.click(await screen.findByRole('button', { name: 'Original words' }));
  const title = await screen.findByRole('textbox', { name: 'Title' });
  fireEvent.change(title, { target: { value: 'Mine' } });
  fireEvent.blur(title);
  fireEvent.click(await screen.findByRole('button', { name: 'Keep other' }));

  expect(await screen.findByRole('button', { name: 'Other words' })).toBeVisible();
});

it('applies optional capture meaning in the single atomic capture operation', async () => {
  const fixture = studioService();
  render(<App studioId="studio:first" studioService={fixture.service} />);

  fireEvent.click(screen.getAllByRole('button', { name: 'Capture' })[0]!);
  fireEvent.change(
    screen.getByRole('textbox', { name: 'What would you like remembered?' }),
    { target: { value: 'A possible retreat' } },
  );
  fireEvent.change(screen.getByRole('combobox', { name: 'Meaning (optional)' }), {
    target: { value: 'uncharted' },
  });
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
      return { note: saved, path: 'Inbox/a-remembered-note.md', hash: 'hash-2' };
    }),
    dispose: vi.fn(async () => {
      order.push('dispose');
    }),
  });
  const view = render(<App studioId="studio:first" studioService={fixture.service} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Original words' }));
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

  expect(await screen.findByRole('button', { name: 'Original words' })).toBeVisible();
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
            resolve({ note: saved, path: 'Inbox/a-remembered-note.md', hash: 'hash-2' });
        }),
    ),
  });
  render(<App studioId="studio:first" studioService={fixture.service} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Original words' }));
  fireEvent.change(await screen.findByRole('textbox', { name: 'Title' }), {
    target: { value: 'Changed before navigating' },
  });

  fireEvent.click(screen.getByRole('link', { name: 'Life Landscape' }));

  expect(location.pathname).toBe('/foyer');
  expect(screen.getByRole('dialog', { name: 'Edit note' })).toBeVisible();
  expect(fixture.service.save).toHaveBeenCalledOnce();
  await act(async () => finish?.());
  await waitFor(() => expect(location.pathname).toBe('/landscape'));
  expect(screen.queryByRole('dialog', { name: 'Edit note' })).not.toBeInTheDocument();
});

it('keeps failed navigation and the dirty editor in place', async () => {
  const fixture = studioService({
    save: vi.fn().mockRejectedValue(new Error('Disk unavailable')),
  });
  render(<App studioId="studio:first" studioService={fixture.service} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Original words' }));
  fireEvent.change(await screen.findByRole('textbox', { name: 'Title' }), {
    target: { value: 'Changed before navigating' },
  });

  fireEvent.click(screen.getByRole('link', { name: 'Life Landscape' }));

  expect(await screen.findByText(/could not be saved.*Retry before closing/i)).toBeVisible();
  expect(location.pathname).toBe('/foyer');
  expect(screen.getByRole('dialog', { name: 'Edit note' })).toBeVisible();
});
