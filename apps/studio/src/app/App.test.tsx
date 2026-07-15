import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
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
import { VaultConflictError } from '@studio/storage/portable';
import { StrictMode } from 'react';
import { afterEach, vi } from 'vitest';
import type { TourStep } from '../features/onboarding/onboarding-state';
import { App } from './App';

const selectTauriVault = vi.fn();
const createTauriStudio = vi.fn();
const createBrowserVault = vi.fn();
const createAppStudioService = vi.fn();

vi.mock('./studio-service-factory', () => ({ createAppStudioService }));

vi.mock('@studio/storage/tauri', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@studio/storage/tauri')>()),
  createTauriStudio,
  selectTauriVault,
}));

vi.mock('@studio/storage/browser', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@studio/storage/browser')>()),
  createBrowserVault,
}));

afterEach(() => {
  cleanup();
  history.replaceState(null, '', '/foyer');
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
  createTauriStudio.mockReset();
  createBrowserVault.mockReset();
  createAppStudioService.mockReset();
  selectTauriVault.mockReset();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function browserStorage(records: unknown[]): Storage {
  const values = new Map<string, string>([
    ['studio:browser-studios', JSON.stringify(records)],
  ]);
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

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
    onboarding: {
      load: async () => ({
        onboarding: {
          version: 1,
          status: 'not-started',
          currentStep: 'welcome',
          updatedAt: '2026-07-15T00:00:00.000Z',
        },
        extra: {},
        revision: null,
        repairRequired: false,
      }),
      save: vi.fn(),
      transition: vi.fn(),
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
  await waitFor(() => expect(document.title).toBe('Foyer — Ateliera'));
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
  expect(screen.getByRole('main', { name: 'Ateliera' })).toBeVisible();
  expect(screen.queryByText('Ready offline')).not.toBeInTheDocument();
});

it('renders only the entry boundary before a Studio Space is active', () => {
  history.replaceState(null, '', '/not-a-room');
  const replaceState = vi.spyOn(history, 'replaceState');

  render(<App />);

  expect(screen.getByRole('main', { name: 'Ateliera welcome' })).toBeVisible();
  expect(
    screen.getByRole('heading', {
      level: 1,
      name: 'Ateliera',
    }),
  ).toBeVisible();
  expect(
    screen.queryByRole('navigation', { name: 'Studio rooms' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('navigation', { name: 'Mobile navigation' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Search' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Capture' }),
  ).not.toBeInTheDocument();
  expect(replaceState).not.toHaveBeenCalledWith(null, '', '/foyer');
  expect(location.pathname).toBe('/not-a-room');
  expect(document.title).toBe('Welcome — Ateliera');
});

it('introduces Ateliera before asking for a new Studio Space', () => {
  render(<App />);

  expect(
    screen.getByRole('heading', { level: 1, name: 'Ateliera' }),
  ).toBeVisible();
  expect(
    screen.getByText(
      'A private studio for designing a life from the inside out.',
    ),
  ).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Create a new Studio Space' }),
  ).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Theme' })).toBeEnabled();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
});

it('offers one known browser Studio Space as a direct return', () => {
  vi.stubGlobal(
    'localStorage',
    browserStorage([
      {
        name: 'Anna’s Studio',
        vaultId: 'studio:anna',
        createdAt: '2026-07-15T00:00:00.000Z',
      },
    ]),
  );

  render(<App />);

  expect(screen.getByText('Welcome back.')).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Open Anna’s Studio' }),
  ).toBeEnabled();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
});

it('presents several known Studio Spaces as a short list of cards', () => {
  vi.stubGlobal(
    'localStorage',
    browserStorage([
      {
        name: 'Anna’s Studio',
        vaultId: 'studio:anna',
        createdAt: '2026-07-15T00:00:00.000Z',
      },
      {
        name: 'Quiet Work',
        vaultId: 'studio:quiet-work',
        createdAt: '2026-07-15T01:00:00.000Z',
      },
    ]),
  );

  render(<App />);

  const spaces = screen.getByRole('list', { name: 'Your Studio Spaces' });
  expect(spaces).toBeVisible();
  expect(
    within(spaces).getByRole('button', { name: 'Open Anna’s Studio' }),
  ).toBeEnabled();
  expect(
    within(spaces).getByRole('button', { name: 'Open Quiet Work' }),
  ).toBeEnabled();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
});

it('welcomes a newly created Studio before mounting its rooms', async () => {
  vi.stubGlobal('localStorage', browserStorage([]));
  const fixture = studioService();
  createBrowserVault.mockReturnValue({ list: vi.fn(async () => []) });
  createAppStudioService.mockResolvedValue(fixture.service);

  render(<App />);
  fireEvent.click(
    screen.getByRole('button', { name: 'Create a new Studio Space' }),
  );
  fireEvent.change(screen.getByLabelText('Studio name'), {
    target: { value: 'Anna’s Studio' },
  });
  fireEvent.click(screen.getByRole('button', { name: /^Create$/ }));

  expect(
    await screen.findByRole('heading', {
      name: 'Your Studio Space is ready.',
    }),
  ).toBeVisible();
  expect(
    screen.queryByRole('navigation', { name: 'Studio rooms' }),
  ).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Enter my Studio' }));
  await waitFor(() =>
    expect(fixture.service.onboarding.transition).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'dismiss' }),
    ),
  );
  expect(
    await screen.findByRole('navigation', { name: 'Studio rooms' }),
  ).toBeVisible();
});

it('serializes competing choices at the First Visit threshold', async () => {
  vi.stubGlobal('localStorage', browserStorage([]));
  const pending =
    deferred<
      Awaited<ReturnType<StudioService['onboarding']['transition']>>
    >();
  const fixture = studioService({
    onboarding: {
      ...studioService().service.onboarding,
      transition: vi.fn(() => pending.promise),
    },
  });
  createBrowserVault.mockReturnValue({ list: vi.fn(async () => []) });
  createAppStudioService.mockResolvedValue(fixture.service);

  render(<App />);
  fireEvent.click(
    screen.getByRole('button', { name: 'Create a new Studio Space' }),
  );
  fireEvent.click(screen.getByRole('button', { name: /^Create$/u }));
  const tour = await screen.findByRole('button', {
    name: 'Take a gentle tour',
  });
  const enter = screen.getByRole('button', { name: 'Enter my Studio' });
  fireEvent.click(tour);
  fireEvent.click(enter);

  await waitFor(() => expect(tour).toBeDisabled());
  expect(enter).toBeDisabled();
  await waitFor(() =>
    expect(fixture.service.onboarding.transition).toHaveBeenCalledTimes(1),
  );
  expect(fixture.service.onboarding.transition).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'visit' }),
  );

  pending.resolve({
    onboarding: {
      version: 1,
      status: 'in-progress',
      currentStep: 'foyer',
      updatedAt: '2026-07-15T00:00:00.000Z',
    },
    extra: {},
    revision: 'settings-hash',
    repairRequired: false,
  });
  expect(
    await screen.findByRole('heading', { name: 'Ateliera' }),
  ).toBeVisible();
});

it('opens a returning Studio directly unless its tour was interrupted', async () => {
  vi.stubGlobal(
    'localStorage',
    browserStorage([
      {
        name: 'Anna’s Studio',
        vaultId: 'studio:anna',
        createdAt: '2026-07-15T00:00:00.000Z',
      },
    ]),
  );
  const fixture = studioService();
  createBrowserVault.mockReturnValue({});
  createAppStudioService.mockResolvedValue(fixture.service);

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Open Anna’s Studio' }));

  expect(
    await screen.findByRole('navigation', { name: 'Studio rooms' }),
  ).toBeVisible();
  expect(screen.getByRole('heading', { name: 'New here?' })).toBeVisible();
  expect(
    screen.queryByRole('heading', { name: 'Your Studio Space is ready.' }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
  await waitFor(() =>
    expect(fixture.service.onboarding.transition).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'dismiss-invitation' }),
    ),
  );
  expect(screen.queryByRole('heading', { name: 'New here?' })).not.toBeInTheDocument();
});

it('disposes a prepared service when onboarding settings cannot be read', async () => {
  vi.stubGlobal(
    'localStorage',
    browserStorage([
      {
        name: 'Anna’s Studio',
        vaultId: 'studio:anna',
        createdAt: '2026-07-15T00:00:00.000Z',
      },
    ]),
  );
  const fixture = studioService({
    onboarding: {
      ...studioService().service.onboarding,
      load: vi.fn(async () => {
        throw new Error('Settings could not be read.');
      }),
    },
  });
  createBrowserVault.mockReturnValue({});
  createAppStudioService.mockResolvedValue(fixture.service);

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Open Anna’s Studio' }));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Settings could not be read.',
  );
  expect(fixture.service.dispose).toHaveBeenCalledOnce();
  expect(
    screen.queryByRole('navigation', { name: 'Studio rooms' }),
  ).not.toBeInTheDocument();
});

it('offers to continue an explicitly interrupted first visit', async () => {
  vi.stubGlobal(
    'localStorage',
    browserStorage([
      {
        name: 'Anna’s Studio',
        vaultId: 'studio:anna',
        createdAt: '2026-07-15T00:00:00.000Z',
      },
    ]),
  );
  const fixture = studioService({
    onboarding: {
      ...studioService().service.onboarding,
      load: async () => ({
        onboarding: {
          version: 1,
          status: 'in-progress',
          currentStep: 'uncharted',
          startedAt: '2026-07-15T00:00:00.000Z',
          updatedAt: '2026-07-15T01:00:00.000Z',
        },
        extra: {},
        revision: 'settings-hash',
        repairRequired: false,
      }),
    },
  });
  createBrowserVault.mockReturnValue({});
  createAppStudioService.mockResolvedValue(fixture.service);

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Open Anna’s Studio' }));

  expect(
    await screen.findByRole('heading', { name: 'Welcome back.' }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Continue the tour' }));
  expect(
    await screen.findByRole('heading', { name: 'What if…?' }),
  ).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Uncharted' })).toBeVisible();
});

it('hides the active tour outside its rooms and resumes it on return', async () => {
  vi.stubGlobal(
    'localStorage',
    browserStorage([
      {
        name: 'Anna’s Studio',
        vaultId: 'studio:anna',
        createdAt: '2026-07-15T00:00:00.000Z',
      },
    ]),
  );
  const fixture = studioService({
    onboarding: {
      ...studioService().service.onboarding,
      load: async () => ({
        onboarding: {
          version: 1,
          status: 'in-progress',
          currentStep: 'foyer',
          startedAt: '2026-07-15T00:00:00.000Z',
          updatedAt: '2026-07-15T01:00:00.000Z',
        },
        extra: {},
        revision: 'settings-hash',
        repairRequired: false,
      }),
    },
  });
  createBrowserVault.mockReturnValue({});
  createAppStudioService.mockResolvedValue(fixture.service);

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Open Anna’s Studio' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Continue the tour' }),
  );

  expect(
    await screen.findByRole('heading', { level: 2, name: 'Foyer' }),
  ).toBeVisible();
  expect(
    await screen.findAllByRole('article', {
      name: /^Example .+ card$/u,
    }),
  ).not.toHaveLength(0);

  fireEvent.click(screen.getByRole('link', { name: 'Settings' }));

  await waitFor(() =>
    expect(
      screen.queryByRole('heading', { level: 2, name: 'Foyer' }),
    ).not.toBeInTheDocument(),
  );
  expect(
    screen.queryByRole('article', { name: /^Example .+ card$/u }),
  ).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('link', { name: 'Foyer' }));

  expect(
    await screen.findByRole('heading', { level: 2, name: 'Foyer' }),
  ).toBeVisible();
  expect(
    await screen.findAllByRole('article', {
      name: /^Example .+ card$/u,
    }),
  ).not.toHaveLength(0);
});

it('persists the newest tour room after competing direct navigations', async () => {
  vi.stubGlobal(
    'localStorage',
    browserStorage([
      {
        name: 'Anna’s Studio',
        vaultId: 'studio:anna',
        createdAt: '2026-07-15T00:00:00.000Z',
      },
    ]),
  );
  const landscapeVisit = deferred<void>();
  const persistedSteps: string[] = [];
  const transition = vi.fn(
    async (
      action: Parameters<StudioService['onboarding']['transition']>[0],
    ) => {
      const step = action.type === 'visit' ? action.step : 'foyer';
      if (step === 'landscape') await landscapeVisit.promise;
      persistedSteps.push(step);
      return {
        onboarding: {
          version: 1 as const,
          status: 'in-progress' as const,
          currentStep: step,
          updatedAt: '2026-07-15T01:00:00.000Z',
        },
        extra: {},
        revision: `settings-${step}`,
        repairRequired: false,
      };
    },
  );
  const fixture = studioService({
    onboarding: {
      ...studioService().service.onboarding,
      load: async () => ({
        onboarding: {
          version: 1,
          status: 'in-progress',
          currentStep: 'foyer',
          startedAt: '2026-07-15T00:00:00.000Z',
          updatedAt: '2026-07-15T01:00:00.000Z',
        },
        extra: {},
        revision: 'settings-hash',
        repairRequired: false,
      }),
      transition,
    },
  });
  createBrowserVault.mockReturnValue({});
  createAppStudioService.mockResolvedValue(fixture.service);

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Open Anna’s Studio' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Continue the tour' }),
  );
  await screen.findByRole('heading', { level: 2, name: 'Foyer' });

  fireEvent.click(screen.getByRole('link', { name: 'Life Landscape' }));
  await waitFor(() =>
    expect(transition).toHaveBeenCalledWith(
      expect.objectContaining({ step: 'landscape', type: 'visit' }),
    ),
  );
  fireEvent.click(screen.getByRole('link', { name: 'Current Season' }));

  expect(persistedSteps).toEqual(['foyer']);
  landscapeVisit.resolve();

  await waitFor(() => expect(persistedSteps.at(-1)).toBe('season'));
  expect(persistedSteps).toEqual(['foyer', 'landscape', 'season']);
});

it('serializes a guide advance behind an in-flight direct tour visit', async () => {
  vi.stubGlobal(
    'localStorage',
    browserStorage([
      {
        name: 'Anna’s Studio',
        vaultId: 'studio:anna',
        createdAt: '2026-07-15T00:00:00.000Z',
      },
    ]),
  );
  const landscapeVisit = deferred<void>();
  const persistedSteps: string[] = [];
  const transition = vi.fn(
    async (
      action: Parameters<StudioService['onboarding']['transition']>[0],
    ) => {
      const step = action.type === 'visit' ? action.step : 'foyer';
      if (step === 'landscape') await landscapeVisit.promise;
      persistedSteps.push(step);
      return {
        onboarding: {
          version: 1 as const,
          status: 'in-progress' as const,
          currentStep: step,
          updatedAt: '2026-07-15T01:00:00.000Z',
        },
        extra: {},
        revision: `settings-${step}`,
        repairRequired: false,
      };
    },
  );
  const fixture = studioService({
    onboarding: {
      ...studioService().service.onboarding,
      load: async () => ({
        onboarding: {
          version: 1,
          status: 'in-progress',
          currentStep: 'foyer',
          updatedAt: '2026-07-15T01:00:00.000Z',
        },
        extra: {},
        revision: 'settings-hash',
        repairRequired: false,
      }),
      transition,
    },
  });
  createBrowserVault.mockReturnValue({});
  createAppStudioService.mockResolvedValue(fixture.service);

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Open Anna’s Studio' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Continue the tour' }),
  );
  await screen.findByRole('heading', { level: 2, name: 'Foyer' });
  fireEvent.click(screen.getByRole('link', { name: 'Life Landscape' }));
  await waitFor(() =>
    expect(transition).toHaveBeenCalledWith(
      expect.objectContaining({ step: 'landscape', type: 'visit' }),
    ),
  );

  fireEvent.click(
    await screen.findByRole('button', { name: 'Visit Current Season' }),
  );
  expect(persistedSteps).toEqual(['foyer']);
  landscapeVisit.resolve();

  await waitFor(() => expect(persistedSteps.at(-1)).toBe('season'));
  expect(persistedSteps).toEqual(['foyer', 'landscape', 'season']);
});

it.each([
  {
    destination: 'Life Landscape',
    destinationStep: 'landscape',
    terminalAction: 'Leave tour',
    terminalType: 'dismiss',
  },
  {
    destination: 'Reflection Garden',
    destinationStep: 'reflection',
    terminalAction: 'Return to the Foyer',
    terminalType: 'complete',
  },
] as const)(
  'serializes $terminalType behind an in-flight direct tour visit',
  async ({ destination, destinationStep, terminalAction, terminalType }) => {
    vi.stubGlobal(
      'localStorage',
      browserStorage([
        {
          name: 'Anna’s Studio',
          vaultId: 'studio:anna',
          createdAt: '2026-07-15T00:00:00.000Z',
        },
      ]),
    );
    const directVisit = deferred<void>();
    const persisted: string[] = [];
    const transition = vi.fn(
      async (
        action: Parameters<StudioService['onboarding']['transition']>[0],
      ) => {
        if (action.type === 'visit' && action.step === destinationStep)
          await directVisit.promise;
        const label = action.type === 'visit' ? action.step : action.type;
        const durableStep: TourStep | 'complete' | 'welcome' =
          action.type === 'visit'
            ? action.step
            : action.type === 'complete'
              ? 'complete'
              : destinationStep;
        persisted.push(label);
        return {
          onboarding: {
            version: 1 as const,
            status:
              action.type === 'complete'
                ? ('completed' as const)
                : action.type === 'dismiss'
                  ? ('dismissed' as const)
                  : ('in-progress' as const),
            currentStep: durableStep,
            updatedAt: '2026-07-15T01:00:00.000Z',
          },
          extra: {},
          revision: `settings-${label}`,
          repairRequired: false,
        };
      },
    );
    const fixture = studioService({
      onboarding: {
        ...studioService().service.onboarding,
        load: async () => ({
          onboarding: {
            version: 1,
            status: 'in-progress',
            currentStep: 'foyer',
            updatedAt: '2026-07-15T01:00:00.000Z',
          },
          extra: {},
          revision: 'settings-hash',
          repairRequired: false,
        }),
        transition,
      },
    });
    createBrowserVault.mockReturnValue({});
    createAppStudioService.mockResolvedValue(fixture.service);

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Anna’s Studio' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Continue the tour' }),
    );
    await screen.findByRole('heading', { level: 2, name: 'Foyer' });
    fireEvent.click(screen.getByRole('link', { name: destination }));
    await waitFor(() =>
      expect(transition).toHaveBeenCalledWith(
        expect.objectContaining({ step: destinationStep, type: 'visit' }),
      ),
    );

    fireEvent.click(
      await screen.findByRole('button', { name: terminalAction }),
    );
    directVisit.resolve();

    await waitFor(() => expect(persisted.at(-1)).toBe(terminalType));
    expect(persisted.slice(-2)).toEqual([destinationStep, terminalType]);
  },
);

it('resumes at the Foyer after a replay is interrupted', async () => {
  vi.stubGlobal(
    'localStorage',
    browserStorage([
      {
        name: 'Anna’s Studio',
        vaultId: 'studio:anna',
        createdAt: '2026-07-15T00:00:00.000Z',
      },
    ]),
  );
  let status: 'completed' | 'in-progress' = 'completed';
  let currentStep:
    | 'complete'
    | 'welcome'
    | 'foyer'
    | 'landscape'
    | 'season'
    | 'uncharted'
    | 'reflection' = 'complete';
  const transition = vi.fn(
    async (
      action: Parameters<StudioService['onboarding']['transition']>[0],
    ) => {
      status = 'in-progress';
      currentStep = action.type === 'visit' ? action.step : 'welcome';
      return {
        onboarding: {
          version: 1 as const,
          status,
          currentStep,
          updatedAt: '2026-07-15T01:00:00.000Z',
        },
        extra: {},
        revision: `settings-${currentStep}`,
        repairRequired: false,
      };
    },
  );
  const fixture = studioService({
    onboarding: {
      ...studioService().service.onboarding,
      load: async () => ({
        onboarding: {
          version: 1,
          status,
          currentStep,
          updatedAt: '2026-07-15T01:00:00.000Z',
        },
        extra: {},
        revision: 'settings-hash',
        repairRequired: false,
      }),
      transition,
    },
  });
  createBrowserVault.mockReturnValue({});
  createAppStudioService.mockResolvedValue(fixture.service);

  const first = render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Open Anna’s Studio' }));
  fireEvent.click(await screen.findByRole('link', { name: 'Settings' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Start the tour again' }),
  );
  await screen.findByRole('heading', { level: 2, name: 'Foyer' });
  expect(transition.mock.calls.map(([action]) => action.type)).toEqual([
    'replay',
    'visit',
  ]);
  first.unmount();

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Open Anna’s Studio' }));
  expect(
    await screen.findByRole('heading', { name: 'Welcome back.' }),
  ).toBeVisible();
  expect(screen.getByRole('button', { name: 'Continue the tour' })).toBeVisible();
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
  const onlineSpy = vi
    .spyOn(navigator, 'onLine', 'get')
    .mockImplementation(() => online);
  const fixture = studioService();
  render(<App studioId="studio:first" studioService={fixture.service} />);
  expect(
    await screen.findByRole('heading', { name: 'What if…?' }),
  ).toBeVisible();

  online = false;
  fireEvent(window, new Event('offline'));
  expect(
    await screen.findByText(
      'Stored locally. This room remains available offline.',
    ),
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
    screen.getByRole('button', { name: 'Open an existing Studio Space' }),
  );

  await waitFor(() => expect(selectTauriVault).toHaveBeenCalledOnce());
  expect(screen.getByRole('heading', { name: 'Ateliera' })).toBeVisible();
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

  expect(screen.getByRole('heading', { name: 'Ateliera' })).toBeVisible();
  fireEvent.click(
    screen.getByRole('button', { name: 'Open an existing Studio Space' }),
  );
  await waitFor(() => expect(selectTauriVault).toHaveBeenCalledOnce());
  expect(screen.getByRole('heading', { name: 'Ateliera' })).toBeVisible();
});

it('stops failed opening progress and offers retry or a return to entry', async () => {
  Object.defineProperty(window, '__TAURI_INTERNALS__', {
    configurable: true,
    value: {},
  });
  selectTauriVault.mockRejectedValue(new Error('folder unavailable'));

  render(<App />);
  fireEvent.click(
    screen.getByRole('button', { name: 'Open an existing Studio Space' }),
  );

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'This Studio couldn’t be opened. Choose its folder and try again.',
  );
  expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  fireEvent.click(
    screen.getByRole('button', { name: 'Return to the beginning' }),
  );
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Open an existing Studio Space' }),
  ).toBeEnabled();
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
  fireEvent.click(
    screen.getByRole('button', { name: 'Create a new Studio Space' }),
  );
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
    expect(screen.getByRole('button', { name: /^Create$/ })).toBeEnabled(),
  );
});

it('keeps a cancelled Studio Space name and restores focus to its entry action', async () => {
  render(<App />);
  const create = screen.getByRole('button', {
    name: 'Create a new Studio Space',
  });
  fireEvent.click(create);
  fireEvent.change(screen.getByLabelText('Studio name'), {
    target: { value: 'Quiet Work' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Not now' }));

  await waitFor(() => expect(create).toHaveFocus());
  fireEvent.click(create);
  expect(screen.getByLabelText('Studio name')).toHaveValue('Quiet Work');
});

it('explains a long-running creation without fake progress or an endless spinner', async () => {
  vi.useFakeTimers();
  Object.defineProperty(window, '__TAURI_INTERNALS__', {
    configurable: true,
    value: {},
  });
  createTauriStudio.mockReturnValue(new Promise(() => undefined));

  render(<App />);
  fireEvent.click(
    screen.getByRole('button', { name: 'Create a new Studio Space' }),
  );
  fireEvent.click(screen.getByRole('button', { name: /^Create$/ }));
  await act(async () => vi.advanceTimersByTime(10_001));

  expect(
    screen.getByText(
      'This is taking longer than usual. Your Studio Space is still being prepared.',
    ),
  ).toBeVisible();
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  vi.useRealTimers();
});

it('serializes browser Studio selection and unlocks after completion', async () => {
  let finishList:
    | ((entries: [{ kind: 'file'; path: string; size: number }]) => void)
    | undefined;
  createBrowserVault.mockReturnValue({
    list: () =>
      new Promise((resolve) => {
        finishList = resolve;
      }),
  });

  render(<App />);
  fireEvent.click(
    screen.getByRole('button', { name: 'Create a new Studio Space' }),
  );
  fireEvent.change(screen.getByLabelText('Studio name'), {
    target: { value: 'Anna’s Studio' },
  });
  const submit = screen.getByRole('button', { name: /^Create$/ });
  fireEvent.click(submit);
  fireEvent.click(submit);

  await waitFor(() => expect(createBrowserVault).toHaveBeenCalledOnce());
  expect(
    screen.getByRole('button', { name: 'Create a new Studio Space' }),
  ).toBeDisabled();

  finishList?.([{ kind: 'file', path: 'Inbox/existing.md', size: 1 }]);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /^Create$/ })).toBeEnabled(),
  );
});

it('uses calm Studio language when native creation cannot finish', async () => {
  Object.defineProperty(window, '__TAURI_INTERNALS__', {
    configurable: true,
    value: {},
  });
  createTauriStudio.mockRejectedValue(new Error('vault_unavailable'));

  render(<App />);
  fireEvent.click(
    screen.getByRole('button', { name: 'Create a new Studio Space' }),
  );
  fireEvent.click(screen.getByRole('button', { name: /^Create$/ }));

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent(
    'Your Studio couldn’t be created. Choose another location or try again.',
  );
  expect(alert).not.toHaveTextContent(/vault/i);
});

it('explains when a named native Studio already exists', async () => {
  Object.defineProperty(window, '__TAURI_INTERNALS__', {
    configurable: true,
    value: {},
  });
  createTauriStudio.mockRejectedValue(new VaultConflictError());

  render(<App />);
  fireEvent.click(
    screen.getByRole('button', { name: 'Create a new Studio Space' }),
  );
  fireEvent.change(screen.getByLabelText('Studio name'), {
    target: { value: 'Anna’s Studio' },
  });
  fireEvent.click(screen.getByRole('button', { name: /^Create$/ }));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'A Studio named “Anna’s Studio” already exists there. Choose another location or name, or open the existing Studio.',
  );
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
