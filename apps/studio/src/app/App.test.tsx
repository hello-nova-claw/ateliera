import { render, screen } from '@testing-library/react';
import { App } from './App';

it('renders the Studio landmark', () => {
  render(<App />);
  expect(screen.getByRole('main', { name: 'The Studio' })).toBeVisible();
});
