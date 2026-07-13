import { expect, it } from 'vitest';
import {
  aiAccessLevels,
  landscapeAnchors,
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
