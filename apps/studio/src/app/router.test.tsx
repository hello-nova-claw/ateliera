import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { useStudioRouter } from './router';

function RouterProbe() {
  const { path, title } = useStudioRouter();
  return <output>{`${path}|${title}`}</output>;
}

function GuardedRouterProbe({ guard }: { guard: (next: string) => boolean }) {
  const { path, title } = useStudioRouter(guard);
  return <output>{`${path}|${title}`}</output>;
}

function ReplaceRouterProbe() {
  const { navigate, path } = useStudioRouter();
  return (
    <>
      <output>{path}</output>
      <button
        onClick={() => navigate('/landscape/family', false, true)}
        type="button"
      >
        Replace
      </button>
    </>
  );
}

afterEach(() => {
  history.replaceState(null, '', '/foyer');
  vi.restoreAllMocks();
});

it('canonically replaces an unknown initial route with the Foyer', () => {
  history.replaceState(null, '', '/a-room-that-does-not-exist');
  const replaceState = vi.spyOn(history, 'replaceState');

  render(<RouterProbe />);

  expect(replaceState).toHaveBeenCalledWith(null, '', '/foyer');
  expect(location.pathname).toBe('/foyer');
  expect(screen.getByText('/foyer|Foyer')).toBeVisible();
});

it('canonically replaces an unknown history destination with the Foyer', () => {
  render(<RouterProbe />);
  const replaceState = vi.spyOn(history, 'replaceState');

  history.pushState(null, '', '/lost');
  dispatchEvent(new PopStateEvent('popstate'));

  expect(replaceState).toHaveBeenCalledWith(null, '', '/foyer');
  expect(location.pathname).toBe('/foyer');
  expect(screen.getByText('/foyer|Foyer')).toBeVisible();
});

it('restores the current URL when a history destination is guarded', () => {
  const guard = vi.fn(() => true);
  render(<GuardedRouterProbe guard={guard} />);

  history.pushState(null, '', '/landscape');
  dispatchEvent(new PopStateEvent('popstate'));

  expect(guard).toHaveBeenCalledWith('/landscape');
  expect(location.pathname).toBe('/foyer');
  expect(screen.getByText('/foyer|Foyer')).toBeVisible();
});

it('replaces the current history entry when requested', () => {
  history.replaceState(null, '', '/landscape');
  const replaceState = vi.spyOn(history, 'replaceState');
  const pushState = vi.spyOn(history, 'pushState');
  render(<ReplaceRouterProbe />);

  fireEvent.click(screen.getByRole('button', { name: 'Replace' }));

  expect(replaceState).toHaveBeenCalledWith(null, '', '/landscape/family');
  expect(pushState).not.toHaveBeenCalled();
  expect(screen.getByText('/landscape/family')).toBeVisible();
});

it.each([
  ['/identity', 'Identity Studio'],
  ['/wisdom', 'Wisdom Garden'],
])('recognises the completed room at %s', (path, title) => {
  history.replaceState(null, '', path);
  render(<RouterProbe />);
  expect(screen.getByText(`${path}|${title}`)).toBeVisible();
});
