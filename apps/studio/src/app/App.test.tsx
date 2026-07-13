import { render, screen } from '@testing-library/react';
import { App } from './App';

it('renders the Studio landmark', async () => {
  render(
    <App
      captureService={{
        capture: async (text) => ({ id: 'test', text }),
        list: async () => [],
      }}
    />,
  );
  expect(screen.getByRole('main', { name: 'The Studio' })).toBeVisible();
  expect(await screen.findByText('Ready offline')).toBeVisible();
});
