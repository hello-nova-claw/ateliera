import type { Content, Link, Parent, Root, Text } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { toString } from 'mdast-util-to-string';

export type ParsedLinkKind = 'wiki' | 'path' | 'id';

export interface ParsedLink {
  kind: ParsedLinkKind;
  target: string;
  label: string;
}

const WIKI_LINK = /\[\[([^\]|\n]+?)(?:\|([^\]\n]+?))?\]\]/g;

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

function collectLink(link: Link, output: ParsedLink[]): void {
  const parsed = markdownTarget(link.url);
  if (parsed) output.push({ ...parsed, label: toString(link) });
}

function collectText(text: Text, output: ParsedLink[]): void {
  for (const match of text.value.matchAll(WIKI_LINK)) {
    const target = match[1]!.trim();
    if (target) output.push({ kind: 'wiki', target, label: match[2]?.trim() || target });
  }
}

function walk(node: Root | Content, output: ParsedLink[]): void {
  if (node.type === 'link') { collectLink(node, output); return; }
  if (node.type === 'text') { collectText(node, output); return; }
  if (node.type === 'code' || node.type === 'inlineCode' || node.type === 'html') return;
  if ('children' in node) for (const child of (node as Parent).children) walk(child, output);
}

export function extractLinks(markdown: string): ParsedLink[] {
  const located: ParsedLink[] = [];
  walk(fromMarkdown(markdown), located);
  const seen = new Set<string>();
  return located.flatMap((link) => {
    const key = `${link.kind}:${link.target.toLocaleLowerCase('en')}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [link];
  });
}

export function markdownToPlainText(markdown: string): string {
  return toString(fromMarkdown(markdown), { includeHtml: false }).replace(/\s+/g, ' ').trim();
}
