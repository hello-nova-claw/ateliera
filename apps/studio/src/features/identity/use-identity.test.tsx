import type {
  IdentityStudioProjection,
  StudioService,
} from '@studio/application';
import { act, renderHook, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

import { useIdentity } from './use-identity';

const empty: IdentityStudioProjection = {
  currentlyBecoming: null,
  sections: {
    'already-true': [],
    'practicing-now': [],
    'values-principles': [],
    'desired-feelings': [],
    'beliefs-practice': [],
    'embodiment-cues': [],
    'identity-shifts': [],
  },
};

function service(): StudioService {
  return {
    projectIdentityStudio: vi.fn(async () => empty),
    capture: vi.fn(async () => ({
      note: {} as never,
      path: 'Identity Studio/truth.md',
      hash: 'hash',
    })),
    promoteIdentity: vi.fn(async () => undefined),
    reorderIdentity: vi.fn(async () => undefined),
    indexState: vi.fn(() => 'ready'),
  } as unknown as StudioService;
}

it('projects and refreshes after identity mutations', async () => {
  const studio = service();
  const { result } = renderHook(() => useIdentity(studio, 0));
  await waitFor(() => expect(result.current.state).toBe('ready'));

  await act(() =>
    result.current.add('already-true', {
      body: 'I am attentive.',
      title: 'Attentive',
    }),
  );
  expect(studio.capture).toHaveBeenCalledWith({
    body: 'I am attentive.',
    title: 'Attentive',
    identitySection: 'already-true',
  });

  await act(() => result.current.promote('identity-one'));
  expect(studio.promoteIdentity).toHaveBeenCalledWith('identity-one');

  await act(() =>
    result.current.reorder('practicing-now', ['identity-two', 'identity-one']),
  );
  expect(studio.reorderIdentity).toHaveBeenCalledWith('practicing-now', [
    'identity-two',
    'identity-one',
  ]);
  expect(studio.projectIdentityStudio).toHaveBeenCalledTimes(4);
});

it('retains a calm error and reports an offline Studio', async () => {
  const studio = service();
  vi.mocked(studio.projectIdentityStudio).mockRejectedValue(
    new Error('Identity notes need metadata repair.'),
  );
  const { result } = renderHook(() => useIdentity(studio, 0, false));

  await waitFor(() => expect(result.current.state).toBe('error'));
  expect(result.current.error).toBe('Identity notes need metadata repair.');
  expect(result.current.offline).toBe(true);
});
