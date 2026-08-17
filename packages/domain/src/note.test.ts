import { expect, it } from 'vitest';
import {
  aiAccessLevels,
  defaultLifeAreas,
  landscapeAnchorDefinitions,
  landscapeAnchors,
  semanticTypeForLandscapeAnchor,
  noteStatuses,
  semanticTypes,
  sensitivityLevels,
} from './index';

it('exposes the complete stable domain enums', () => {
  expect(semanticTypes).toEqual([
    'foundations',
    'vision',
    'growth',
    'reflection',
    'celebration',
    'uncharted',
  ]);
  expect(noteStatuses).toEqual([
    'draft',
    'active',
    'resting',
    'archived',
    'trashed',
  ]);
  expect(landscapeAnchors).toEqual([
    'vision',
    'identity-values-feelings',
    'decisions',
    'practices',
    'structure-strategy',
  ]);
  expect(sensitivityLevels).toEqual(['private', 'sensitive']);
  expect(aiAccessLevels).toEqual(['never', 'ask', 'selected', 'scoped']);
});

it('defines the configurable Landscape defaults and five fixed prompts', () => {
  expect(defaultLifeAreas).toHaveLength(10);
  expect(defaultLifeAreas.slice(0, 5).map((area) => area.id)).toEqual([
    'family',
    'home',
    'health-wellbeing',
    'work-business',
    'money',
  ]);
  expect(landscapeAnchorDefinitions.map((anchor) => anchor.id)).toEqual(
    landscapeAnchors,
  );
  expect(
    landscapeAnchorDefinitions.every((anchor) => anchor.prompt.length > 20),
  ).toBe(true);
});

it('maps every structural Landscape anchor to one canonical meaning', () => {
  expect(
    Object.fromEntries(
      landscapeAnchors.map((anchor) => [
        anchor,
        semanticTypeForLandscapeAnchor(anchor),
      ]),
    ),
  ).toEqual({
    vision: 'vision',
    'identity-values-feelings': 'foundations',
    decisions: 'growth',
    practices: 'growth',
    'structure-strategy': 'foundations',
  });
});
