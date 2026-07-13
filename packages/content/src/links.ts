import type { Content, Definition, Link, LinkReference, Parent, Root, Text } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { toString } from 'mdast-util-to-string';
import { gfm } from 'micromark-extension-gfm';

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

function referenceKey(identifier: string): string {
  return identifier.normalize('NFC').toLocaleLowerCase('en');
}

function collectReference(link: LinkReference, definitions: Map<string, Definition>, output: ParsedLink[]): void {
  const definition = definitions.get(referenceKey(link.identifier))!;
  const parsed = markdownTarget(definition.url);
  if (parsed) output.push({ ...parsed, label: toString(link) });
}

function collectText(text: Text, output: ParsedLink[]): void {
  for (const match of text.value.matchAll(WIKI_LINK)) {
    const target = match[1]!.trim();
    if (target) output.push({ kind: 'wiki', target, label: match[2]?.trim() || target });
  }
}

function walk(node: Root | Content, definitions: Map<string, Definition>, output: ParsedLink[]): void {
  if (node.type === 'link') { collectLink(node, output); return; }
  if (node.type === 'linkReference') { collectReference(node, definitions, output); return; }
  if (node.type === 'text') { collectText(node, output); return; }
  if (node.type === 'code' || node.type === 'inlineCode' || node.type === 'html') return;
  if ('children' in node) for (const child of (node as Parent).children) walk(child, definitions, output);
}

function parseMarkdown(markdown: string): Root {
  return fromMarkdown(markdown, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
}

function definitionsIn(root: Root): Map<string, Definition> {
  const definitions = new Map<string, Definition>();
  for (const child of root.children) {
    if (child.type === 'definition') definitions.set(referenceKey(child.identifier), child);
  }
  return definitions;
}

function plainTextParts(node: Root | Content): string[] {
  if (node.type === 'html' || node.type === 'definition') return [];
  if (node.type === 'text' || node.type === 'inlineCode' || node.type === 'code') return [node.value];
  if (node.type === 'image') return node.alt ? [node.alt] : [];
  if ('children' in node) return (node as Parent).children.flatMap((child) => plainTextParts(child));
  return [];
}

export function extractLinks(markdown: string): ParsedLink[] {
  const root = parseMarkdown(markdown);
  const located: ParsedLink[] = [];
  walk(root, definitionsIn(root), located);
  const seen = new Set<string>();
  return located.flatMap((link) => {
    const key = `${link.kind}:${link.target.toLocaleLowerCase('en')}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [link];
  });
}

export function markdownToPlainText(markdown: string): string {
  return plainTextParts(parseMarkdown(markdown)).join(' ').replace(/\s+/g, ' ').trim();
}
