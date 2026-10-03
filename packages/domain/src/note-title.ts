import type { StudioNote } from './note';

// A note is one piece of text: when it carries no explicit frontmatter `title`,
// its first non-empty line stands in as the title — for display, `[[wiki]]` link
// resolution, backlinks, search and the suggested filename. This derivation is the
// vault contract shared with the native app; keep both sides identical.

// The first non-empty line of a Markdown body, trimmed, with a single leading
// heading / blockquote / list marker removed so `# Calm morning` reads as
// `Calm morning`. Returns '' when the body has no non-empty line.
export function firstNonEmptyLine(body: string): string {
  for (const raw of (body ?? '').split('\n')) {
    const line = raw.trim();
    if (line) {
      const stripped = line.replace(/^#{1,6}\s+/, '').replace(/^[-*>]\s+/, '').trim();
      return stripped || line;
    }
  }
  return '';
}

// The title a note resolves/renders under: an explicit `title` wins; otherwise the
// first non-empty line of the body. '' when neither is present.
export function effectiveTitle(note: Pick<StudioNote, 'title' | 'body'>): string {
  const explicit = note.title?.trim();
  if (explicit) return explicit;
  return firstNonEmptyLine(note.body ?? '');
}
