import { fireEvent, render, screen } from '@testing-library/react';
import { CommandPalette } from './CommandPalette';

it('filters commands and performs the selected action', () => {
  const openFoyer = vi.fn();
  render(
    <CommandPalette
      commands={[
        { id: 'foyer', label: 'Open Foyer', onSelect: openFoyer },
        { id: 'capture', label: 'Capture a thought', onSelect: () => undefined },
      ]}
      isOpen
      onClose={() => undefined}
    />,
  );
  fireEvent.change(screen.getByRole('combobox', { name: 'Find a command' }), {
    target: { value: 'foy' },
  });
  expect(screen.queryByText('Capture a thought')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('option', { name: 'Open Foyer' }));
  expect(openFoyer).toHaveBeenCalledOnce();
});
