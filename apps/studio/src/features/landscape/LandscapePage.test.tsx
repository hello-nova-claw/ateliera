import { fireEvent, render, screen } from '@testing-library/react';
import { defaultLifeAreas, landscapeAnchors } from '@studio/domain';
import type { LandscapeBoardProjection } from '@studio/application';
import { describe, expect, it, vi } from 'vitest';

import { LandscapePage } from './LandscapePage';

const emptyBoard: LandscapeBoardProjection = {
  cells: defaultLifeAreas.slice(0, 5).flatMap((area) =>
    landscapeAnchors.map((anchor) => ({
      lifeArea: area.id,
      anchor,
      featured: null,
      additionalCount: 0,
      noteIds: [],
      cards: [],
    })),
  ),
};

describe('LandscapePage', () => {
  it('renders a named desktop matrix with fixed anchors and calm empty cells', () => {
    render(
      <LandscapePage
        areas={[...defaultLifeAreas.slice(0, 5)]}
        board={emptyBoard}
        onNavigate={vi.fn()}
        path="/landscape"
      />,
    );
    expect(screen.getByRole('region', { name: 'Life Landscape matrix' })).toBeInTheDocument();
    expect(screen.getAllByText('There is room here.')).toHaveLength(25);
    expect(screen.getByRole('button', { name: 'Open Home' })).toBeInTheDocument();
  });

  it('renders one focused area with five anchors and opens cards from their titles', () => {
    const onOpen = vi.fn();
    const board: LandscapeBoardProjection = {
      cells: emptyBoard.cells.map((cell) =>
        cell.lifeArea === 'home' && cell.anchor === 'vision'
          ? {
              ...cell,
              featured: {
                noteId: 'home-vision',
                path: 'Landscape/home.md',
                title: 'A calm home',
                excerpt: 'Clear surfaces and room to rest.',
                semanticType: 'vision',
                cardType: 'vision',
                status: 'active',
                updated: '2026-07-13T00:00:00.000Z',
                lifeAreas: ['home'],
                anchor: 'vision',
              },
              noteIds: ['home-vision'],
              cards: [],
            }
          : cell,
      ),
    };
    render(
      <LandscapePage
        areas={[...defaultLifeAreas.slice(0, 5)]}
        board={board}
        onNavigate={vi.fn()}
        onOpen={onOpen}
        path="/landscape/home"
      />,
    );
    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument();
    for (const name of ['Vision', 'Identity, values & feelings', 'Decisions', 'Practices', 'Structure & strategy']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole('button', { name: 'A calm home' }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ noteId: 'home-vision' }), expect.any(HTMLButtonElement));
    expect(document.querySelector('.life-landscape__matrix')).not.toBeInTheDocument();
  });

  it('offers explicit move and link alternatives with undo', async () => {
    const onMove = vi.fn(async () => undefined);
    const board: LandscapeBoardProjection = {
      cells: emptyBoard.cells.map((cell) =>
        cell.lifeArea === 'home' && cell.anchor === 'vision'
          ? {
              ...cell,
              featured: {
                noteId: 'home-vision', path: 'Landscape/home.md', title: 'A calm home', excerpt: '', semanticType: 'vision', cardType: 'vision', status: 'active', updated: '2026-07-13T00:00:00.000Z', lifeAreas: ['home'], anchor: 'vision',
              },
              noteIds: ['home-vision'], cards: [],
            }
          : cell,
      ),
    };
    render(<LandscapePage areas={[...defaultLifeAreas.slice(0, 5)]} board={board} onMove={onMove} onNavigate={vi.fn()} path="/landscape/home" />);
    fireEvent.click(screen.getByRole('button', { name: 'Move A calm home' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Move to Practices/ }));
    expect(onMove).toHaveBeenCalledWith(expect.objectContaining({ anchor: 'practices', lifeAreas: ['home'] }));
    expect(await screen.findByRole('button', { name: 'Undo move' })).toBeInTheDocument();
  });
});
