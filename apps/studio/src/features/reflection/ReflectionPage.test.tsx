import { fireEvent, render, screen } from '@testing-library/react';
import type { ReflectionGardenProjection } from '@studio/application';
import { vi } from 'vitest';

import { ReflectionPage } from './ReflectionPage';

const model: ReflectionGardenProjection = {
  cards: [
    {
      noteId: 'now',
      path: 'Reflection Garden/Reflections/now.md',
      hash: 'now-hash',
      title: 'I returned without making it a failure',
      excerpt: 'The interruption did not erase the practice.',
      semanticType: 'reflection',
      cardType: 'reflection',
      status: 'active',
      updated: '2026-07-14T09:00:00.000Z',
      created: '2026-07-14T09:00:00.000Z',
      lifeAreas: ['family'],
      seasons: ['2026-winter'],
      tags: ['calm'],
      linkedNoteIds: ['identity-1'],
      thenNoteId: 'then',
    },
    {
      noteId: 'then',
      path: 'Reflection Garden/Celebrations/then.md',
      hash: 'then-hash',
      title: 'A morning that held',
      excerpt: 'Fifteen minutes still counted.',
      semanticType: 'celebration',
      cardType: 'celebration',
      status: 'active',
      updated: '2025-07-14T09:00:00.000Z',
      created: '2025-07-14T09:00:00.000Z',
      lifeAreas: [],
      seasons: [],
      tags: ['calm'],
      linkedNoteIds: [],
    },
  ],
  themes: [{ name: 'calm', count: 2 }],
};

it('offers Garden, Reflection, Celebration and Themes without a heatmap', () => {
  render(<ReflectionPage model={model} />);
  expect(screen.getByRole('tablist', { name: 'Reflection Garden view' })).toBeVisible();
  expect(screen.getAllByRole('tab')).toHaveLength(4);
  expect(screen.getByText('I returned without making it a failure').closest('article')).toHaveClass(
    'reflection-entry--reflection',
  );
  expect(screen.getByText('A morning that held').closest('article')).toHaveClass(
    'reflection-entry--celebration',
  );
  expect(screen.queryByText(/heatmap|streak/i)).not.toBeInTheDocument();
});

it('filters the stream and reveals a deterministic theme reading view', () => {
  render(<ReflectionPage model={model} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Celebration' }));
  expect(screen.getByText('A morning that held')).toBeVisible();
  expect(screen.queryByText('I returned without making it a failure')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Themes' }));
  fireEvent.click(screen.getByRole('button', { name: 'calm, 2 entries' }));
  expect(screen.getByText('I returned without making it a failure')).toBeVisible();
  expect(screen.getByText('A morning that held')).toBeVisible();
});

it('captures a one-sentence reflection and supports opening the full editor', async () => {
  const onCapture = vi.fn(async () => undefined);
  render(<ReflectionPage model={model} onCapture={onCapture} />);
  fireEvent.change(screen.getByLabelText('A sentence to keep'), {
    target: { value: 'I noticed that five quiet minutes changed the afternoon.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Keep reflection' }));
  expect(onCapture).toHaveBeenCalledWith(
    'reflection',
    'I noticed that five quiet minutes changed the afternoon.',
    false,
    expect.any(HTMLButtonElement),
  );
  expect(await screen.findByRole('status')).toHaveTextContent('Remembered');

  fireEvent.change(screen.getByLabelText('A sentence to keep'), {
    target: { value: 'There is more I want to explore.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Continue in the editor' }));
  expect(onCapture).toHaveBeenLastCalledWith(
    'reflection',
    'There is more I want to explore.',
    true,
    expect.any(HTMLButtonElement),
  );
});

it('shows linked evidence and an optional Then & now pair', () => {
  render(<ReflectionPage model={model} />);
  expect(screen.getByRole('region', { name: 'Then and now' })).toHaveTextContent(
    'A morning that held',
  );
  expect(screen.getByLabelText('Connections for I returned without making it a failure')).toHaveTextContent(
    'Family',
  );
});

it('keeps recoverable loading, offline, stale and malformed states calm', () => {
  const view = render(<ReflectionPage model={{ cards: [], themes: [] }} state="loading" />);
  expect(screen.getByRole('status')).toHaveTextContent('Gathering the garden');
  view.rerender(<ReflectionPage model={model} state="offline" />);
  expect(screen.getByRole('status')).toHaveTextContent('Stored locally');
  view.rerender(<ReflectionPage model={model} state="stale" />);
  expect(screen.getByRole('status')).toHaveTextContent('what is here');
  view.rerender(
    <ReflectionPage
      error="One entry needs metadata repair. Its words remain untouched."
      model={model}
      state="error"
    />,
  );
  expect(screen.getByRole('alert')).toHaveTextContent('words remain untouched');
});

