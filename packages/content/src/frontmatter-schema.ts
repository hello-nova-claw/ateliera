import { z } from 'zod';
import {
  aiAccessLevels,
  landscapeAnchors,
  noteStatuses,
  semanticTypes,
  sensitivityLevels,
} from '@studio/domain';

export const recognizedFrontmatterKeys = [
  'schema_version',
  'id',
  'title',
  'card_type',
  'semantic_type',
  'status',
  'rooms',
  'life_areas',
  'landscape_anchor',
  'seasons',
  'tags',
  'created',
  'updated',
  'source',
  'attachments',
  'display',
  'privacy',
] as const;

const optionalText = z.string().nullish();
const timestamp = z.iso.datetime({ offset: true });

export const frontmatterSchema = z.object({
  schema_version: z.literal(1),
  id: z.string().min(1),
  title: optionalText,
  card_type: z.string().min(1),
  semantic_type: z.enum(semanticTypes),
  status: z.enum(noteStatuses),
  rooms: z.array(z.string()),
  life_areas: z.array(z.string()),
  landscape_anchor: z.enum(landscapeAnchors).optional(),
  seasons: z.array(z.string()),
  tags: z.array(z.string()),
  created: timestamp,
  updated: timestamp,
  source: z
    .object({ title: optionalText, creator: optionalText, url: optionalText })
    .optional(),
  attachments: z.array(z.string()),
  display: z.object({ cover: optionalText, featured: z.boolean() }),
  privacy: z.object({
    sensitivity: z.enum(sensitivityLevels),
    ai_access: z.enum(aiAccessLevels),
  }),
});

export type ValidFrontmatter = z.infer<typeof frontmatterSchema>;
