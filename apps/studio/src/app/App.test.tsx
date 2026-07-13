import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

it('describes best-effort local storage without an alarm', async () => {
  render(
    <App
      captureService={{
        capture: async (text) => ({ id: 'test', text }),
        list: async () => [],
      }}
      requestPersistence={async () => 'best-effort'}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Capture' }));
  fireEvent.change(
    screen.getByRole('textbox', { name: 'What would you like remembered?' }),
    { target: { value: 'The hill' } },
  );
  fireEvent.click(screen.getByRole('button', { name: 'Remember' }));
  expect(
    await screen.findByText(
      'Stored locally; this browser may clear it if space is needed.',
    ),
  ).toBeVisible();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it.each(['Not now', 'Remember'])(
  'returns focus to Capture after %s closes the composer',
  async (action) => {
    render(
      <App
        captureService={{
          capture: async (text) => ({ id: 'test', text }),
          list: async () => [],
        }}
      />,
    );
    const capture = screen.getByRole('button', { name: 'Capture' });
    fireEvent.click(capture);
    if (action === 'Remember') {
      fireEvent.change(
        screen.getByRole('textbox', { name: 'What would you like remembered?' }),
        { target: { value: 'The hill' } },
      );
    }
    fireEvent.click(screen.getByRole('button', { name: action }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Capture' })).toHaveFocus(),
    );
  },
);
