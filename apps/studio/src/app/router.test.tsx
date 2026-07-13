import { render, screen } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { useStudioRouter } from './router';

function RouterProbe() {
  const { path, title } = useStudioRouter();
  return <output>{`${path}|${title}`}</output>;
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
