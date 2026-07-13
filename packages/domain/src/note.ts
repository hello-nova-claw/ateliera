import type { LandscapeAnchor } from './landscape';
import type { SemanticType } from './semantic-type';

export const noteStatuses = [
  'draft',
  'active',
  'resting',
  'archived',
  'trashed',
] as const;
export type NoteStatus = (typeof noteStatuses)[number];
export const sensitivityLevels = ['private', 'sensitive'] as const;
export const aiAccessLevels = ['never', 'ask', 'selected', 'scoped'] as const;
export type Sensitivity = (typeof sensitivityLevels)[number];
export type AiAccess = (typeof aiAccessLevels)[number];

export interface NoteSource {
  title?: string;
  creator?: string;
  url?: string;
}

export interface StudioNote {
  schemaVersion: 1;
  id: string;
  title?: string;
  body: string;
  cardType: string;
  semanticType: SemanticType;
  status: NoteStatus;
  rooms: string[];
  lifeAreas: string[];
  landscapeAnchor?: LandscapeAnchor;
  seasons: string[];
  tags: string[];
  created: string;
  updated: string;
  source?: NoteSource;
  attachments: string[];
  display: { cover?: string; featured: boolean };
  privacy: {
    sensitivity: Sensitivity;
    aiAccess: AiAccess;
  };
  extraFrontmatter: Record<string, unknown>;
  lineEnding?: '\n' | '\r\n';
}
