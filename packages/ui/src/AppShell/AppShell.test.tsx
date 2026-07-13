import { fireEvent, render, screen } from '@testing-library/react';
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
});
