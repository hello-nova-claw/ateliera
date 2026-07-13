export type ParsedLinkKind = 'wiki' | 'path' | 'id';

export interface ParsedLink {
  kind: ParsedLinkKind;
  target: string;
  label: string;
}

const WIKI_LINK = /\[\[([^\]|\n]+?)(?:\|([^\]\n]+?))?\]\]/g;
const MARKDOWN_LINK = /(?<!!)\[([^\]\n]+)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;

function withoutCode(markdown: string): string {
  return markdown
    .replace(/^(?: {0,3})(`{3,}|~{3,})[^\n]*\n[\s\S]*?^(?: {0,3})\1\s*$/gm, '')
    .replace(/`+[^`\n]*`+/g, '');
}

function cleanTarget(target: string): string {
  const withoutFragment = target.split('#', 1)[0]!;
  try {
    return decodeURIComponent(withoutFragment).trim();
  } catch {
    return withoutFragment.trim();
  }
}

function markdownTarget(target: string): { kind: ParsedLinkKind; target: string } | null {
  const cleaned = cleanTarget(target);
  const stable = /^studio:\/\/note\/([^/?#]+)$/i.exec(cleaned);
  if (stable) return { kind: 'id', target: stable[1]! };
  if (/^[a-z][a-z\d+.-]*:/i.test(cleaned) || cleaned.startsWith('//')) return null;
  if (!cleaned.toLowerCase().endsWith('.md')) return null;
  return { kind: 'path', target: cleaned };
}

export function extractLinks(markdown: string): ParsedLink[] {
  const source = withoutCode(markdown);
  const located: Array<ParsedLink & { offset: number }> = [];
  for (const match of source.matchAll(WIKI_LINK)) {
    const target = match[1]!.trim();
    if (target) located.push({ kind: 'wiki', target, label: match[2]?.trim() || target, offset: match.index });
  }
  for (const match of source.matchAll(MARKDOWN_LINK)) {
    const parsed = markdownTarget(match[2]!);
    if (parsed) located.push({ ...parsed, label: match[1]!.trim(), offset: match.index });
  }

  located.sort((left, right) => left.offset - right.offset);
  const seen = new Set<string>();
  return located.flatMap((locatedLink) => {
    const link: ParsedLink = { kind: locatedLink.kind, target: locatedLink.target, label: locatedLink.label };
    const key = `${link.kind}:${link.target.toLocaleLowerCase('en')}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [link];
  });
}
