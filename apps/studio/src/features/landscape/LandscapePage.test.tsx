import { act, fireEvent, render, screen, within } from '@testing-library/react';
import {
  defaultLifeAreas,
  landscapeAnchors,
  type LandscapeAnchor,
} from '@studio/domain';
import type { LandscapeBoardProjection } from '@studio/application';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';

import { LandscapePage, type LandscapePageProps } from './LandscapePage';
import { tourExamples } from '../onboarding/tour-examples';

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
  it('traces tour examples through one authentic Landscape column', () => {
    const onUseTourExample = vi.fn();
    render(
      <LandscapePage
        areas={[...defaultLifeAreas.slice(0, 5)]}
        board={emptyBoard}
        onNavigate={vi.fn()}
        onUseTourExample={onUseTourExample}
        path="/landscape"
        tourExamples={tourExamples.landscape}
      />,
    );

    const matrix = screen.getByRole('region', {
      name: 'Life Landscape matrix',
    });
    expect(within(matrix).getAllByText('Example')).toHaveLength(5);
    fireEvent.click(
      within(matrix).getByRole('button', {
        name: 'Use as a starting point: Vision',
      }),
    );
    expect(onUseTourExample).toHaveBeenCalledWith(
      tourExamples.landscape[0],
      expect.any(HTMLButtonElement),
      { lifeArea: 'family' },
    );
  });
  it('renders a named desktop matrix with fixed anchors and calm empty cells', () => {
    const onCreate = vi.fn();
    render(
      <LandscapePage
        areas={[...defaultLifeAreas.slice(0, 5)]}
        board={emptyBoard}
        onCreate={onCreate}
        onNavigate={vi.fn()}
        path="/landscape"
      />,
    );
    expect(
      screen.getByRole('region', { name: 'Life Landscape matrix' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('There is room here.')).not.toBeInTheDocument();
    expect(
      screen.queryByText('+ Add'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open Home' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add to Home Vision' }));
    expect(onCreate).toHaveBeenCalledWith(
      'home',
      'vision',
      expect.any(HTMLButtonElement),
    );
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
                hash: 'home-vision-hash',
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
    for (const name of [
      'Vision',
      'Identity, values & feelings',
      'Decisions',
      'Practices',
      'Structure & strategy',
    ]) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole('button', { name: 'A calm home' }));
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ noteId: 'home-vision' }),
      expect.any(HTMLButtonElement),
    );
    expect(
      document.querySelector('.life-landscape__matrix'),
    ).not.toBeInTheDocument();
  });

  it('offers explicit move and link alternatives with undo', async () => {
    const onMove = vi.fn(async () => ({ hash: 'moved-hash' }));
    const board: LandscapeBoardProjection = {
      cells: emptyBoard.cells.map((cell) =>
        cell.lifeArea === 'home' && cell.anchor === 'vision'
          ? {
              ...cell,
              featured: {
                noteId: 'home-vision',
                path: 'Landscape/home.md',
                hash: 'home-vision-hash',
                title: 'A calm home',
                excerpt: '',
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
        onMove={onMove}
        onNavigate={vi.fn()}
        path="/landscape/home"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Move A calm home' }));
    fireEvent.click(
      screen.getByRole('menuitem', { name: /Move to Practices/ }),
    );
    expect(onMove).toHaveBeenCalledWith(
      expect.objectContaining({ anchor: 'practices', lifeAreas: ['home'] }),
    );
    expect(
      await screen.findByRole('button', { name: 'Undo move' }),
    ).toBeInTheDocument();
  });

  it('offers keyboard reorder with undo and reports a failed move without losing the card', async () => {
    const first = {
      noteId: 'one',
      path: 'Landscape/one.md',
      hash: 'first-hash',
      title: 'First note',
      excerpt: '',
      semanticType: 'vision' as const,
      cardType: 'vision',
      status: 'active' as const,
      updated: '2026-07-13T00:00:00.000Z',
      lifeAreas: ['home'],
      anchor: 'vision' as const,
    };
    const second = {
      ...first,
      noteId: 'two',
      path: 'Landscape/two.md',
      title: 'Second note',
    };
    const board: LandscapeBoardProjection = {
      cells: emptyBoard.cells.map((cell) =>
        cell.lifeArea === 'home' && cell.anchor === 'vision'
          ? {
              ...cell,
              featured: first,
              cards: [first, second],
              noteIds: ['one', 'two'],
              additionalCount: 1,
            }
          : cell,
      ),
    };
    const onReorder = vi.fn(async () => undefined);
    let rejectMove!: (reason: Error) => void;
    const onMove = vi.fn(
      () =>
        new Promise<{ hash: string }>((_resolve, reject) => {
          rejectMove = reject;
        }),
    );
    render(
      <LandscapePage
        areas={[...defaultLifeAreas.slice(0, 5)]}
        board={board}
        onMove={onMove}
        onNavigate={vi.fn()}
        onReorder={onReorder}
        path="/landscape/home"
      />,
    );

    fireEvent.keyDown(screen.getByRole('button', { name: 'Drag First note' }), {
      key: 'ArrowDown',
    });
    expect(onReorder).toHaveBeenCalledWith('home', 'vision', ['two', 'one']);
    expect(
      await screen.findByRole('button', { name: 'Undo move' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Move First note' }));
    const failedItem = screen.getByRole('menuitem', {
      name: /Move to Practices/,
    });
    failedItem.focus();
    fireEvent.click(failedItem);
    screen.getByRole('button', { name: '← Back to map' }).focus();
    await act(async () => rejectMove(new Error('Another version exists.')));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Another version exists.',
    );
    expect(
      screen.getByRole('button', { name: 'First note' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(failedItem).toHaveFocus();
  });

  it('returns focus to the exact reorder action after an asynchronous failure', async () => {
    const first = {
      noteId: 'one',
      path: 'Landscape/one.md',
      hash: 'first-hash',
      title: 'First note',
      excerpt: '',
      semanticType: 'vision' as const,
      cardType: 'vision',
      status: 'active' as const,
      updated: '2026-07-13T00:00:00.000Z',
      lifeAreas: ['home'],
      anchor: 'vision' as const,
    };
    const second = {
      ...first,
      noteId: 'two',
      path: 'Landscape/two.md',
      title: 'Second note',
    };
    const board: LandscapeBoardProjection = {
      cells: emptyBoard.cells.map((cell) =>
        cell.lifeArea === 'home' && cell.anchor === 'vision'
          ? {
              ...cell,
              featured: first,
              cards: [first, second],
              noteIds: ['one', 'two'],
              additionalCount: 1,
            }
          : cell,
      ),
    };
    let rejectReorder!: (reason: Error) => void;
    const onReorder = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectReorder = reject;
        }),
    );
    render(
      <LandscapePage
        areas={[...defaultLifeAreas.slice(0, 5)]}
        board={board}
        onMove={vi.fn(async () => ({ hash: 'moved-hash' }))}
        onNavigate={vi.fn()}
        onReorder={onReorder}
        path="/landscape/home"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Move First note' }));
    const failedItem = screen.getByRole('menuitem', { name: 'Move later' });
    failedItem.focus();
    fireEvent.click(failedItem);
    screen.getByRole('button', { name: '← Back to map' }).focus();
    await act(async () =>
      rejectReorder(new Error('The order changed elsewhere.')),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The order changed elsewhere.',
    );
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(failedItem).toHaveFocus();
  });

  it('uses complete keyboard menu semantics and restores focus on dismissal', async () => {
    const card = {
      noteId: 'menu-note',
      path: 'Life Landscape/home/menu.md',
      hash: 'menu-hash',
      title: 'A considered move',
      excerpt: '',
      semanticType: 'vision' as const,
      cardType: 'vision',
      status: 'active' as const,
      updated: '2026-07-13T00:00:00.000Z',
      lifeAreas: ['home'],
      anchor: 'vision' as const,
    };
    const board: LandscapeBoardProjection = {
      cells: emptyBoard.cells.map((item) =>
        item.lifeArea === 'home' && item.anchor === 'vision'
          ? { ...item, featured: card, cards: [card], noteIds: [card.noteId] }
          : item,
      ),
    };
    render(
      <LandscapePage
        areas={[...defaultLifeAreas.slice(0, 5)]}
        board={board}
        onMove={vi.fn(async () => ({ hash: 'moved-hash' }))}
        onNavigate={vi.fn()}
        path="/landscape/home"
      />,
    );
    const trigger = screen.getByRole('button', {
      name: 'Move A considered move',
    });

    fireEvent.click(trigger);
    const menu = await screen.findByRole('menu', {
      name: 'Ways to move A considered move',
    });
    const enabled = screen
      .getAllByRole('menuitem')
      .filter((item) => !item.hasAttribute('disabled'));
    await vi.waitFor(() => expect(enabled[0]).toHaveFocus());
    fireEvent.keyDown(menu, { key: 'End' });
    expect(enabled.at(-1)).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(enabled[0]).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(enabled[1]).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(enabled[0]).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    await screen.findByRole('menu');
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('preserves Undo and reports a conflict when reversal fails', async () => {
    const card = {
      noteId: 'undo-note',
      path: 'Life Landscape/home/undo.md',
      hash: 'shown-hash',
      title: 'A reversible move',
      excerpt: '',
      semanticType: 'vision' as const,
      cardType: 'vision',
      status: 'active' as const,
      updated: '2026-07-13T00:00:00.000Z',
      lifeAreas: ['home'],
      anchor: 'vision' as const,
    };
    const board: LandscapeBoardProjection = {
      cells: emptyBoard.cells.map((item) =>
        item.lifeArea === 'home' && item.anchor === 'vision'
          ? { ...item, featured: card, cards: [card], noteIds: [card.noteId] }
          : item,
      ),
    };
    const onMove = vi
      .fn()
      .mockResolvedValueOnce({ hash: 'post-move-hash' })
      .mockRejectedValueOnce(new Error('The note changed before Undo.'));
    render(
      <LandscapePage
        areas={[...defaultLifeAreas.slice(0, 5)]}
        board={board}
        onMove={onMove}
        onNavigate={vi.fn()}
        path="/landscape/home"
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Move A reversible move' }),
    );
    fireEvent.click(
      screen.getByRole('menuitem', { name: /Move to Practices/ }),
    );
    const undo = await screen.findByRole('button', { name: 'Undo move' });
    fireEvent.click(undo);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The note changed before Undo.',
    );
    expect(
      screen.getByRole('button', { name: 'Undo move' }),
    ).toBeInTheDocument();
    expect(onMove).toHaveBeenLastCalledWith(
      expect.objectContaining({
        card: expect.objectContaining({ hash: 'post-move-hash' }),
        lifeAreas: ['home'],
        anchor: 'vision',
      }),
    );
  });

  it('offers an explicit mobile-safe move or link drag mode', () => {
    const card = {
      noteId: 'drag-note',
      path: 'Life Landscape/home/drag.md',
      hash: 'drag-hash',
      title: 'A movable vision',
      excerpt: '',
      semanticType: 'vision' as const,
      cardType: 'vision',
      status: 'active' as const,
      updated: '2026-07-13T00:00:00.000Z',
      lifeAreas: ['home'],
      anchor: 'vision' as const,
    };
    const board: LandscapeBoardProjection = {
      cells: emptyBoard.cells.map((item) =>
        item.lifeArea === 'home' && item.anchor === 'vision'
          ? { ...item, featured: card, cards: [card], noteIds: [card.noteId] }
          : item,
      ),
    };
    render(
      <LandscapePage
        areas={[...defaultLifeAreas.slice(0, 5)]}
        board={board}
        onMove={vi.fn(async () => ({ hash: 'next-hash' }))}
        onNavigate={vi.fn()}
        path="/landscape/home"
      />,
    );

    expect(
      screen.getByRole('combobox', {
        name: 'Drag action for A movable vision',
      }),
    ).toHaveValue('move');
    expect(
      screen.getByRole('option', { name: 'Move here' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Also show here' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/press and hold on touch/i)).toBeInTheDocument();
  });

  it('authors custom area titles and renames active areas', () => {
    const onAddArea = vi.fn();
    const onRenameArea = vi.fn();
    render(
      <LandscapePage
        areas={[...defaultLifeAreas.slice(0, 5)]}
        board={emptyBoard}
        onAddArea={onAddArea}
        onNavigate={vi.fn()}
        onRenameArea={onRenameArea}
        path="/landscape"
      />,
    );

    fireEvent.click(screen.getByText('Manage life areas'));
    fireEvent.change(screen.getByLabelText('New life area'), {
      target: { value: 'Rest & Renewal' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add custom area' }));
    expect(onAddArea).toHaveBeenCalledWith({ title: 'Rest & Renewal' });

    fireEvent.click(screen.getByRole('button', { name: 'Rename Home' }));
    fireEvent.change(screen.getByLabelText('Name for Home'), {
      target: { value: 'Home & Hearth' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Home name' }));
    expect(onRenameArea).toHaveBeenCalledWith('home', 'Home & Hearth');
  });

  it('guides the manage-area fields with descriptions and ghost examples', () => {
    render(
      <LandscapePage
        areas={[...defaultLifeAreas.slice(0, 5)]}
        board={emptyBoard}
        onAddArea={vi.fn()}
        onNavigate={vi.fn()}
        onRenameArea={vi.fn()}
        path="/landscape"
      />,
    );

    fireEvent.click(screen.getByText('Manage life areas'));
    expect(screen.getByLabelText('New life area')).toHaveAttribute(
      'placeholder',
      'e.g. Body & energy',
    );
    expect(
      screen.getByText(
        'A part of your life you want to tend. Five to ten keeps the Landscape spacious.',
      ),
    ).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Rename Home' }));
    expect(screen.getByLabelText('Name for Home')).toHaveAttribute(
      'placeholder',
      'e.g. Home & belonging',
    );
    expect(screen.getByText('A name that feels like yours.')).toBeVisible();
  });

  it('keeps an unreadable area configuration untouched until explicit recovery confirmation', async () => {
    const onRepairAreas = vi.fn(async () => undefined);
    render(
      <LandscapePage
        areas={[...defaultLifeAreas.slice(0, 5)]}
        board={emptyBoard}
        onAddArea={vi.fn()}
        onNavigate={vi.fn()}
        onRepairAreas={onRepairAreas}
        path="/landscape"
        repairRequired
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'The original file is untouched',
    );
    expect(screen.queryByText('Manage life areas')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review recovery' }));
    expect(onRepairAreas).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Replace with defaults' }),
      );
    });
    await vi.waitFor(() => expect(onRepairAreas).toHaveBeenCalledOnce());
  });

  it('explains a newer configuration calmly and exposes no mutating controls', () => {
    render(
      <LandscapePage
        areas={[...defaultLifeAreas.slice(0, 5)]}
        board={emptyBoard}
        configUnavailable="unsupported"
        onAddArea={vi.fn()}
        onNavigate={vi.fn()}
        onRemoveArea={vi.fn()}
        onRenameArea={vi.fn()}
        onReorderArea={vi.fn()}
        path="/landscape"
      />,
    );

    expect(
      screen.getByRole('status', { name: 'Life area compatibility' }),
    ).toHaveTextContent('newer version of Ateliera');
    expect(screen.queryByText('Manage life areas')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Rename/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Hide/ }),
    ).not.toBeInTheDocument();
  });

  it('restores focus to a surviving menu trigger after link and reorder', async () => {
    const first = {
      noteId: 'focus-one',
      path: 'Life Landscape/home/focus-one.md',
      hash: 'focus-one-hash',
      title: 'First focus note',
      excerpt: '',
      semanticType: 'vision' as const,
      cardType: 'vision',
      status: 'active' as const,
      updated: '2026-07-13T00:00:00.000Z',
      lifeAreas: ['home'],
      anchor: 'vision' as const,
    };
    const second = {
      ...first,
      noteId: 'focus-two',
      title: 'Second focus note',
    };
    const board: LandscapeBoardProjection = {
      cells: emptyBoard.cells.map((item) =>
        item.lifeArea === 'home' && item.anchor === 'vision'
          ? {
              ...item,
              featured: first,
              cards: [first, second],
              noteIds: [first.noteId, second.noteId],
            }
          : item,
      ),
    };
    const onMove = vi
      .fn<NonNullable<LandscapePageProps['onMove']>>()
      .mockResolvedValueOnce({ hash: 'linked-hash' })
      .mockResolvedValueOnce({ hash: 'moved-hash' });
    render(
      <LandscapePage
        areas={[...defaultLifeAreas.slice(0, 5)]}
        board={board}
        onMove={onMove}
        onNavigate={vi.fn()}
        onReorder={vi.fn(async () => undefined)}
        path="/landscape/home"
      />,
    );
    const trigger = screen.getByRole('button', {
      name: 'Move Second focus note',
    });

    fireEvent.click(trigger);
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Move earlier' }));
    });
    await vi.waitFor(() => expect(trigger).toHaveFocus());

    fireEvent.click(trigger);
    await act(async () => {
      fireEvent.click(
        screen.getByRole('menuitem', { name: 'Also show in Family' }),
      );
    });
    await vi.waitFor(() => expect(trigger).toHaveFocus());

    fireEvent.click(trigger);
    await act(async () => {
      fireEvent.click(
        screen.getByRole('menuitem', { name: /Move to Practices/ }),
      );
    });
    expect(onMove).toHaveBeenLastCalledWith(
      expect.objectContaining({
        anchor: 'practices',
        card: expect.objectContaining({ hash: 'linked-hash' }),
      }),
    );
  });

  it('moves focus to the reparented card title after a delayed projection replaces its trigger', async () => {
    const card = {
      noteId: 'reparented-note',
      path: 'Life Landscape/home/reparented.md',
      hash: 'reparented-hash',
      title: 'A reparented note',
      excerpt: '',
      semanticType: 'vision' as const,
      cardType: 'vision',
      status: 'active' as const,
      updated: '2026-07-13T00:00:00.000Z',
      lifeAreas: ['home'],
      anchor: 'vision' as const,
    };
    function Harness() {
      const [anchor, setAnchor] = useState<LandscapeAnchor>(card.anchor);
      const board: LandscapeBoardProjection = {
        cells: emptyBoard.cells.map((item) =>
          item.lifeArea === 'home' && item.anchor === anchor
            ? {
                ...item,
                featured: { ...card, anchor },
                cards: [{ ...card, anchor }],
                noteIds: [card.noteId],
              }
            : item,
        ),
      };
      return (
        <LandscapePage
          areas={[...defaultLifeAreas.slice(0, 5)]}
          board={board}
          onMove={async (move) => {
            setTimeout(() => setAnchor(move.anchor), 1_100);
            return { hash: 'moved-hash' };
          }}
          onNavigate={vi.fn()}
          path="/landscape/home"
        />
      );
    }
    render(<Harness />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Move A reparented note' }),
    );
    fireEvent.click(
      screen.getByRole('menuitem', { name: /Move to Practices/ }),
    );
    const title = await within(
      screen.getByRole('region', { name: 'Practices' }),
    ).findByRole('button', { name: 'A reparented note' }, { timeout: 2_000 });
    await vi.waitFor(() => expect(title).toHaveFocus());
  });
});
