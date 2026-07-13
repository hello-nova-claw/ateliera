import { render, screen } from '@testing-library/react';
import { RoomRoute } from './RoomRoute';

it('provides an accessible status while a room boundary loads', async () => {
  render(<RoomRoute captures={[]} path="/foyer" title="Foyer" />);

  expect(screen.getByRole('status', { name: 'Opening Foyer' })).toBeVisible();
  expect(
    await screen.findByRole('heading', { level: 1, name: 'The Studio' }),
  ).toBeVisible();
});

it('loads each room through the matching route boundary', async () => {
  const { rerender } = render(
    <RoomRoute captures={[]} path="/season" title="Current Season" />,
  );
  expect(
    await screen.findByRole('heading', { level: 1, name: 'Current Season' }),
  ).toBeVisible();

  rerender(<RoomRoute captures={[]} path="/uncharted" title="Uncharted" />);
  expect(
    await screen.findByRole('heading', { level: 1, name: 'Uncharted' }),
  ).toBeVisible();
});
