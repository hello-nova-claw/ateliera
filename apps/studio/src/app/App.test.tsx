import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { App } from './App';

const selectTauriVault = vi.fn();

vi.mock('@studio/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@studio/storage')>()),
  selectTauriVault,
}));

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
  selectTauriVault.mockReset();
});

it('renders the Studio landmark', async () => {
  render(
    <App
      captureService={{
        capture: async (text) => ({ id: 'test', text }),
        list: async () => [],
      }}
    />,
  );
  await act(async () => {
    await Promise.resolve();
  });
  expect(screen.getByRole('main', { name: 'The Studio' })).toBeVisible();
  expect(screen.queryByText('Ready offline')).not.toBeInTheDocument();
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
  fireEvent.click(screen.getAllByRole('button', { name: 'Capture' })[0]!);
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
    const capture = screen.getAllByRole('button', { name: 'Capture' })[0]!;
    fireEvent.click(capture);
    if (action === 'Remember') {
      fireEvent.change(
        screen.getByRole('textbox', {
          name: 'What would you like remembered?',
        }),
        { target: { value: 'The hill' } },
      );
    }
    fireEvent.click(screen.getByRole('button', { name: action }));
    await waitFor(() =>
      expect(
        screen.getAllByRole('button', { name: 'Capture' })[0],
      ).toHaveFocus(),
    );
  },
);

it('asks the native shell to select a vault before opening the Studio', async () => {
  Object.defineProperty(window, '__TAURI_INTERNALS__', {
    configurable: true,
    value: {},
  });
  selectTauriVault.mockResolvedValue(null);

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Open this Studio' }));

  await waitFor(() => expect(selectTauriVault).toHaveBeenCalledOnce());
  expect(screen.getByRole('heading', { name: 'Make this space yours.' })).toBeVisible();
});
