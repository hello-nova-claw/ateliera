import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SearchPage, type SearchPageModel } from './SearchPage';

const model: SearchPageModel = {
  facets: {
    rooms: [{ value: 'reflection-garden', count: 1 }],
    semanticTypes: [
      { value: 'reflection', count: 1 },
      { value: 'uncharted', count: 1 },
    ],
    lifeAreas: [{ value: 'home', count: 1 }],
    seasons: [{ value: 'winter', count: 1 }],
    statuses: [{ value: 'active', count: 2 }],
    tags: [{ value: 'calm', count: 1 }],
    cardTypes: [{ value: 'text', count: 2 }],
  },
  filters: { semanticTypes: ['reflection'] },
  query: 'calm',
  repairCount: 2,
  results: [
    {
      id: 'reflection',
      path: 'Reflection Garden/quiet.md',
      title: 'A quiet morning that worked',
      snippet: 'A <script>alert(1)</script> calm morning.',
      highlightRanges: [{ start: 28, end: 32 }],
      score: 10,
      semanticType: 'reflection',
      cardType: 'text',
      status: 'active',
      updated: '2026-07-14T01:00:00.000Z',
      matchReason: { field: 'body', strategy: 'keyword', text: 'calm' },
    },
  ],
  state: 'ready',
};

describe('SearchPage', () => {
  it('renders highlighted snippets as safe text and explains why a result matched', () => {
    render(<SearchPage model={model} />);

    const result = screen.getByRole('article', {
      name: 'A quiet morning that worked',
    });
    expect(result).toHaveTextContent('<script>alert(1)</script> calm morning.');
    expect(result.querySelector('script')).toBeNull();
    expect(within(result).getByText('calm', { selector: 'mark' })).toBeVisible();
    expect(within(result).getByText('Matched in the note')).toBeVisible();
  });

  it('exposes every typed filter and reports changes without hiding the query', () => {
    const onFiltersChange = vi.fn();
    render(<SearchPage model={model} onFiltersChange={onFiltersChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    expect(screen.getByRole('checkbox', { name: 'Reflection 1' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Uncharted 1' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Reflection Garden 1' })).toBeVisible();
    expect(screen.getByRole('checkbox', { name: 'Home 1' })).toBeVisible();
    expect(screen.getByRole('checkbox', { name: 'Winter 1' })).toBeVisible();
    expect(screen.getByRole('checkbox', { name: 'Active 2' })).toBeVisible();
    expect(screen.getByRole('checkbox', { name: 'Calm 1' })).toBeVisible();
    expect(screen.getByRole('checkbox', { name: 'Text 2' })).toBeVisible();
    expect(screen.getByLabelText('Updated from')).toBeVisible();
    expect(screen.getByLabelText('Updated to')).toBeVisible();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Uncharted 1' }));
    expect(onFiltersChange).toHaveBeenCalledWith({
      semanticTypes: ['reflection', 'uncharted'],
    });
    expect(screen.getByRole('searchbox')).toHaveValue('calm');
  });

  it('opens results and the calm repair queue through named controls', () => {
    const onOpenRepairQueue = vi.fn();
    const onOpenResult = vi.fn();
    render(
      <SearchPage
        model={model}
        onOpenRepairQueue={onOpenRepairQueue}
        onOpenResult={onOpenResult}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'A quiet morning that worked' }));
    expect(onOpenResult).toHaveBeenCalledWith('reflection', expect.any(HTMLButtonElement));
    fireEvent.click(screen.getByRole('button', { name: 'Review 2 repair items' }));
    expect(onOpenRepairQueue).toHaveBeenCalled();
  });

  it('keeps local search available offline and renders stable loading and empty states', () => {
    const { rerender } = render(
      <SearchPage model={{ ...model, results: [], state: 'offline' }} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Stored locally');
    expect(screen.getByText('No notes match this search.')).toBeVisible();

    rerender(<SearchPage model={{ ...model, results: [], state: 'loading' }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Gathering your Studio');
  });

  it('bounds search input to 512 characters', () => {
    const onQueryChange = vi.fn();
    render(<SearchPage model={model} onQueryChange={onQueryChange} />);
    const input = screen.getByRole('searchbox');
    expect(input).toHaveAttribute('maxlength', '512');
    fireEvent.change(input, { target: { value: 'x'.repeat(600) } });
    expect(onQueryChange).toHaveBeenCalledWith('x'.repeat(512));
  });
});
