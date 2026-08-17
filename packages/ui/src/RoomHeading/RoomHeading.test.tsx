import { render, screen } from '@testing-library/react';
import { RoomHeading } from './RoomHeading';

it('renders one consistent room title relationship', () => {
  render(
    <RoomHeading
      eyebrow="notice what is changing"
      intro="Return to what matters."
      title="Reflection Garden"
      titleId="reflection-title"
    />,
  );
  expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleName(
    'Reflection Garden',
  );
  expect(screen.getByText('notice what is changing')).toHaveClass(
    'studio-room-heading__script',
  );
});
