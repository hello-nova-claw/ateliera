import type { SeasonRecord } from '@studio/application';
import { createSeasonDraft, type SeasonWizardStep } from '@studio/domain';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { SeasonPage } from './SeasonPage';

function record(overrides = {}): SeasonRecord {
  const state = { ...createSeasonDraft('winter', '2026-07-14T00:00:00.000Z'),
    title: 'A spacious winter', statement: 'making room', status: 'active' as const,
    startsOn: '2026-07-14', endsOn: '2026-09-30', feelings: ['Calm', 'Curious'],
    priorities: ['Home', 'Studio', 'Family'], enough: 'A useful first version.',
    practices: ['Create before consuming'], supports: ['Childcare'], constraints: ['Energy'],
    notNow: ['A perfect whole-house system'],
    decisions: [{ id: 'd1', text: 'Choose the smallest useful scope', horizon: '30' as const, kind: 'decision' as const }],
    ...overrides };
  return { state, path: 'Current Season/winter.md', hash: 'hash', note: {
    schemaVersion: 1, id: 'season-note', title: state.title, body: '', cardType: 'season',
    semanticType: 'growth', status: state.status, rooms: ['current-season'], lifeAreas: [],
    seasons: [], tags: [], created: state.created, updated: state.updated, attachments: [],
    display: { featured: false }, privacy: { sensitivity: 'private', aiAccess: 'ask' },
    extraFrontmatter: { season_id: state.id },
  } };
}

it('renders the accepted editorial season cover and keeps Not now collapsed', () => {
  render(<SeasonPage record={record()} state="ready" />);
  expect(screen.getByRole('heading', { level: 1, name: 'A spacious winter' })).toBeVisible();
  expect(screen.getByText('This is a season of making room')).toBeVisible();
  expect(screen.getAllByRole('article', { name: /Priority/ })).toHaveLength(3);
  expect(screen.getByText('A useful first version.')).toBeVisible();
  expect(screen.getByText('A perfect whole-house system')).not.toBeVisible();
  fireEvent.click(screen.getByText('Not now'));
  expect(screen.getByText('A perfect whole-house system')).toBeVisible();
});

it('starts gently from the empty state', () => {
  const onBegin = vi.fn();
  render(<SeasonPage record={null} state="ready" onBegin={onBegin} />);
  fireEvent.click(screen.getByRole('button', { name: 'Begin a season' }));
  expect(onBegin).toHaveBeenCalledOnce();
});

it('shows interruptible wizard progress, validates step errors, and saves a step', () => {
  const onSaveStep = vi.fn();
  const draft = record({ status: 'draft', completedSteps: ['name-dates'] as SeasonWizardStep[] });
  render(<SeasonPage record={draft} state="ready" wizardStep="prior-reflection" onSaveStep={onSaveStep} />);
  expect(screen.getByText('Step 2 of 9')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(screen.getByRole('alert')).toHaveTextContent('reflection');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Skip this reflection for now' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(onSaveStep).toHaveBeenCalledWith('prior-reflection', expect.objectContaining({
    skippedPriorReflection: true,
  }));
});

it('requires an explicit choice to retain a fourth priority', () => {
  render(<SeasonPage record={record({ status: 'draft' })} state="ready" wizardStep="priorities" />);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Rest' }));
  expect(screen.getByText(/three priorities/i)).toBeVisible();
  expect(screen.getByRole('checkbox', { name: /keep all four/i })).toBeVisible();
});

it('surfaces active-season conflicts without silently choosing one', () => {
  render(<SeasonPage record={record()} conflicts={[record({ id: 'other', title: 'Another season' })]} state="ready" />);
  expect(screen.getByRole('alert')).toHaveTextContent('More than one season is active');
});
