import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AppShell } from './AppShell';

it('provides named navigation, main content, and a one-tap capture action', () => {
  const onCapture = vi.fn();
  render(
    <AppShell
      activePath="/foyer"
      onCapture={onCapture}
      onNavigate={() => undefined}
      roomTitle="Foyer"
    >
      <h1>Foyer</h1>
    </AppShell>,
  );

  expect(
    screen.getByRole('navigation', { name: 'Studio rooms' }),
  ).toBeVisible();
  expect(screen.getByRole('main')).toHaveAccessibleName('Foyer');
  fireEvent.click(screen.getAllByRole('button', { name: 'Capture' })[0]!);
  expect(onCapture).toHaveBeenCalledOnce();
});

it('marks the active room and omits development-only destinations', () => {
  render(
    <AppShell
      activePath="/landscape"
      onCapture={() => undefined}
      onNavigate={() => undefined}
      roomTitle="Life Landscape"
    >
      <h1>Life Landscape</h1>
    </AppShell>,
  );

  expect(screen.getByRole('link', { name: 'Life Landscape' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(screen.queryByText('Design System')).not.toBeInTheDocument();
  expect(screen.queryByText('States Gallery')).not.toBeInTheDocument();
  expect(screen.queryByText('Mobile Preview')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Identity Studio' })).toHaveAttribute(
    'href',
    '/identity',
  );
  expect(screen.getByRole('link', { name: 'Wisdom Garden' })).toHaveAttribute(
    'href',
    '/wisdom',
  );
});

it('makes every room reachable from the compact More menu with focus restoration', () => {
  const onNavigate = vi.fn();
  render(
    <AppShell
      activePath="/foyer"
      onCapture={() => undefined}
      onNavigate={onNavigate}
      roomTitle="Foyer"
    >
      <h1>Foyer</h1>
    </AppShell>,
  );
  const more = screen.getByRole('button', { name: 'More' });
  fireEvent.click(more);
  expect(screen.getByRole('menu', { name: 'More Studio rooms' })).toBeVisible();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Current Season' }));
  expect(onNavigate).toHaveBeenCalledWith('/season');
  expect(more).toHaveFocus();
});

it('restores the More trigger after an outside pointer closes the menu', async () => {
  render(
    <AppShell
      activePath="/foyer"
      onCapture={() => undefined}
      onNavigate={() => undefined}
      roomTitle="Foyer"
    >
      <button type="button">Outside</button>
    </AppShell>,
  );
  const more = screen.getByRole('button', { name: 'More' });
  fireEvent.click(more);
  expect(screen.getByRole('menu')).toBeVisible();

  fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }));

  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  await waitFor(() => expect(more).toHaveFocus());
});

it('makes unrelated shell chrome inert while a focused experience is active', () => {
  const { rerender } = render(
    <AppShell
      activePath="/foyer"
      focusMode="tour"
      onCapture={() => undefined}
      onNavigate={() => undefined}
      roomTitle="Foyer"
    >
      <button type="button">Active room action</button>
    </AppShell>,
  );

  const shell = screen.getByRole('main').closest('.studio-app-shell');
  if (shell === null) throw new Error('Expected the app shell');
  expect(shell).toHaveAttribute('data-focus-mode', 'tour');
  expect(
    screen.getByRole('navigation', { name: 'Studio rooms', hidden: true })
      .parentElement,
  ).toHaveAttribute('inert');
  expect(shell.querySelector('.studio-app-shell__topbar')).toHaveAttribute(
    'inert',
  );
  expect(
    screen.getByRole('navigation', { name: 'Mobile navigation', hidden: true }),
  ).toHaveAttribute('inert');
  expect(screen.getByRole('main')).not.toHaveAttribute('inert');
  expect(
    screen.getByRole('button', { name: 'Active room action' }),
  ).toBeEnabled();

  rerender(
    <AppShell
      activePath="/foyer"
      onCapture={() => undefined}
      onNavigate={() => undefined}
      roomTitle="Foyer"
    >
      <button type="button">Active room action</button>
    </AppShell>,
  );
  expect(shell).not.toHaveAttribute('data-focus-mode');
  expect(shell.querySelector('.studio-app-shell__rail')).not.toHaveAttribute(
    'inert',
  );
  expect(shell.querySelector('.studio-app-shell__topbar')).not.toHaveAttribute(
    'inert',
  );
});
