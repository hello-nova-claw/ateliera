import type { StudioService } from '@studio/application';
import { render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

import FoyerRoom from './FoyerRoom';

const emptyFoyer = {
  currentSeason: null,
  featured: [],
  becoming: null,
  feelings: [],
  principles: [],
  priorities: [],
  returning: null,
  image: null,
};

function service(overrides: {
  resurfaceDue: string;
  load: ReturnType<typeof vi.fn>;
}): StudioService {
  return {
    rhythmProfile: {
      load: vi.fn().mockResolvedValue({
        profile: { hemisphere: 'S', natal: { placements: {} } },
        revision: 'r1',
        repairRequired: false,
      }),
    },
    preferences: {
      load: vi.fn().mockResolvedValue({
        preferences: {},
        revision: null,
        repairRequired: false,
      }),
      save: vi.fn(),
    },
    index: {
      search: vi.fn().mockResolvedValue([{ id: 'dream-1' }]),
      getManyById: vi.fn().mockResolvedValue([
        {
          note: {
            resurfaceKind: 'dream',
            resurfaceDue: overrides.resurfaceDue,
            resurfaceIntervalDays: 5,
            body: 'A door in the hallway.',
          },
          path: 'Uncharted/dream-1.md',
          hash: 'hash-1',
        },
      ]),
    },
    load: overrides.load,
    projectFoyer: vi.fn().mockResolvedValue(emptyFoyer),
    indexState: vi.fn(() => 'ready' as const),
  } as unknown as StudioService;
}

it('uses the injected clock, in local date terms, to decide whether a card is due', async () => {
  const load = vi.fn().mockResolvedValue({
    note: { body: 'A door in the hallway.' },
    path: 'Uncharted/dream-1.md',
    hash: 'hash-1',
  });
  // A card due exactly on the injected "today" should appear as the Gift.
  const svc = service({ resurfaceDue: '2026-01-05', load });
  const now = () => new Date(2026, 0, 5, 23, 30);

  render(<FoyerRoom service={svc} now={now} />);

  await waitFor(() =>
    expect(screen.getByText('A door in the hallway.')).toBeInTheDocument(),
  );
});

it('does not treat a card due the following local day as due yet', async () => {
  const load = vi.fn().mockResolvedValue({
    note: { body: 'A door in the hallway.' },
    path: 'Uncharted/dream-1.md',
    hash: 'hash-1',
  });
  // A card due the day after the injected "today" must fall back to the calm Gift.
  const svc = service({ resurfaceDue: '2026-01-06', load });
  const now = () => new Date(2026, 0, 5, 23, 30);

  render(<FoyerRoom service={svc} now={now} />);

  await waitFor(() =>
    expect(screen.getByText('A quiet place to begin.')).toBeInTheDocument(),
  );
  expect(screen.queryByText('A door in the hallway.')).not.toBeInTheDocument();
});
