import type { StudioNote } from '@studio/domain';

const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function createNoteId(now = Date.now()): string {
  let time = now;
  let prefix = '';
  for (let index = 0; index < 10; index += 1) {
    prefix = alphabet[time % 32] + prefix;
    time = Math.floor(time / 32);
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let suffix = '';
  for (const byte of bytes) suffix += alphabet[byte % 32];
  return prefix + suffix;
}

function slugify(value: string): string {
  return (
    value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64) || 'note'
  );
}

export function suggestFilename(
  note: Pick<StudioNote, 'created' | 'title' | 'cardType' | 'id'>,
): string {
  const date =
    /^\d{4}-\d{2}-\d{2}/.exec(note.created)?.[0] ??
    new Date(note.created).toISOString().slice(0, 10);
  return `${date}--${slugify(note.title ?? note.cardType)}--${note.id.slice(-6).toLowerCase()}.md`;
}
