import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FirstVisitGuide } from './FirstVisitGuide';
import { FirstVisitWelcome } from './FirstVisitWelcome';
import { TourPreview } from './TourPreview';
import { tourExamples } from './tour-examples';

describe('First Visit', () => {
  it('presents entering directly as a valid choice', () => {
    const enter = vi.fn();
    render(<FirstVisitWelcome mode="new" onEnter={enter} onTour={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Enter my Studio' }));
    expect(enter).toHaveBeenCalledOnce();
    expect(screen.queryByText(/skip/i)).not.toBeInTheDocument();
  });

  it('keeps a persistence error visible on the welcome screen', () => {
    render(
      <FirstVisitWelcome
        error="Ateliera could not remember this choice."
        mode="new"
        onEnter={vi.fn()}
        onTour={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Ateliera could not remember this choice.',
    );
  });

  it('prevents competing welcome choices while one is being remembered', () => {
    render(
      <FirstVisitWelcome busy mode="new" onEnter={vi.fn()} onTour={vi.fn()} />,
    );
    expect(
      screen.getByRole('button', { name: 'Take a gentle tour' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Enter my Studio' }),
    ).toBeDisabled();
  });

  it('uses named destinations without visible product-tour progress', () => {
    render(<FirstVisitGuide onLeave={vi.fn()} onNext={vi.fn()} step="foyer" />);
    expect(
      screen.getByRole('complementary', { name: 'Guided tour · Foyer' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Next room · Life Landscape' }),
    ).toBeVisible();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText(/step\s+1|20%|1 of 5/i)).not.toBeInTheDocument();
  });

  it('keeps the primary next action first in visual and keyboard order', () => {
    render(
      <FirstVisitGuide
        onLeave={vi.fn()}
        onNext={vi.fn()}
        onPrevious={vi.fn()}
        step="landscape"
      />,
    );
    const guide = screen.getByRole('complementary', {
      name: 'Guided tour · Life Landscape',
    });
    expect(
      Array.from(guide.querySelectorAll('button'), (button) =>
        button.textContent?.trim(),
      ),
    ).toEqual(['Next room · Current Season→', 'Previous room', 'Leave tour']);
  });

  it('keeps examples presentation-only and clearly labelled', () => {
    const use = vi.fn();
    render(<TourPreview onUse={use} step="foyer" />);
    expect(screen.getAllByText('Example')).toHaveLength(3);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Use as a starting point: Currently becoming',
      }),
    );
    expect(use).toHaveBeenCalledWith(
      tourExamples.foyer[0],
      expect.any(HTMLButtonElement),
    );
    expect(Object.isFrozen(tourExamples)).toBe(true);
    for (const examples of Object.values(tourExamples)) {
      expect(Object.isFrozen(examples)).toBe(true);
      for (const example of examples) {
        expect(Object.isFrozen(example)).toBe(true);
        if (example.startingPoint !== undefined) {
          expect(Object.isFrozen(example.startingPoint)).toBe(true);
        }
        expect(example).not.toHaveProperty('id');
        expect(example).not.toHaveProperty('schemaVersion');
        expect(example).not.toHaveProperty('created');
      }
    }
  });

  it('removes a preview once it has become a real starting point', () => {
    render(
      <TourPreview
        rememberedPreviewKeys={new Set(['foyer-becoming'])}
        step="foyer"
      />,
    );
    expect(screen.getAllByText('Example')).toHaveLength(2);
    expect(screen.queryByText('Currently becoming')).not.toBeInTheDocument();
  });
});
