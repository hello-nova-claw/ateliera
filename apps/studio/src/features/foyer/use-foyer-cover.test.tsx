import { act, renderHook, waitFor } from '@testing-library/react';
import type { FoyerImageProjection, StudioService } from '@studio/application';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useFoyerCover } from './use-foyer-cover';

const image: FoyerImageProjection = {
  noteId: 'image',
  path: 'Foyer/image.md',
  source: '../Attachments/morning.png',
  alt: 'Morning light',
};

beforeEach(() => {
  Object.defineProperties(URL, {
    createObjectURL: { configurable: true, value: vi.fn(), writable: true },
    revokeObjectURL: { configurable: true, value: vi.fn(), writable: true },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('creates a private object URL from vault bytes and revokes it on cleanup', async () => {
  const createObjectURL = vi.mocked(URL.createObjectURL);
  createObjectURL.mockReturnValue('blob:studio-cover');
  const revokeObjectURL = vi.mocked(URL.revokeObjectURL);
  const service = {
    resolveCover: vi.fn(async () => ({
      kind: 'available',
      path: 'Attachments/morning.png',
      mimeType: 'image/png',
      bytes: new Uint8Array([137, 80, 78, 71]),
    })),
  } as unknown as StudioService;
  const view = renderHook(() => useFoyerCover(service, image));

  await waitFor(() =>
    expect(view.result.current).toEqual({
      state: 'ready',
      url: 'blob:studio-cover',
    }),
  );
  expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
  expect(createObjectURL.mock.calls[0]?.[0].type).toBe('image/png');
  view.unmount();
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:studio-cover');
});

it('revokes stale media when the source note changes', async () => {
  vi.mocked(URL.createObjectURL)
    .mockReturnValueOnce('blob:first')
    .mockReturnValueOnce('blob:second');
  const revokeObjectURL = vi.mocked(URL.revokeObjectURL);
  const service = {
    resolveCover: vi.fn(async () => ({
      kind: 'available',
      path: 'Attachments/morning.png',
      mimeType: 'image/png',
      bytes: new Uint8Array([137, 80, 78, 71]),
    })),
  } as unknown as StudioService;
  const view = renderHook(({ item }) => useFoyerCover(service, item), {
    initialProps: { item: image },
  });
  await waitFor(() => expect(view.result.current.state).toBe('ready'));

  view.rerender({ item: { ...image, path: 'Foyer/another.md' } });
  await waitFor(() =>
    expect(view.result.current).toEqual({ state: 'ready', url: 'blob:second' }),
  );
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:first');
});

it('reports unavailable and storage-error states without creating a URL', async () => {
  const createObjectURL = vi.mocked(URL.createObjectURL);
  const unavailable = {
    resolveCover: vi.fn(async () => ({
      kind: 'unavailable',
      reason: 'unsupported-format',
      reference: '../Attachments/file.svg',
    })),
  } as unknown as StudioService;
  const unavailableView = renderHook(() => useFoyerCover(unavailable, image));
  await waitFor(() =>
    expect(unavailableView.result.current).toEqual({
      state: 'unavailable',
      reason: 'unsupported-format',
    }),
  );
  expect(createObjectURL).not.toHaveBeenCalled();

  const broken = {
    resolveCover: vi.fn(async () => {
      throw new Error('vault unavailable');
    }),
  } as unknown as StudioService;
  const brokenView = renderHook(() => useFoyerCover(broken, image));
  await act(async () => undefined);
  await waitFor(() =>
    expect(brokenView.result.current).toEqual({
      state: 'error',
      error: 'vault unavailable',
    }),
  );
});
