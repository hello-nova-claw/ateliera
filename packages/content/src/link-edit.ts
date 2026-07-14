import type {
  Content,
  Definition,
  Link,
  LinkReference,
  Parent,
  Root,
  Text,
} from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { toString } from 'mdast-util-to-string';
import { gfm } from 'micromark-extension-gfm';

import type { ParsedLinkKind } from './links';

export interface EditableMarkdownLink {
  index: number;
  kind: ParsedLinkKind;
  target: string;
  label: string;
  start: number;
  end: number;
}

export type MarkdownLinkEdit =
  | { kind: 'remove' }
  | { kind: ParsedLinkKind; target: string };

const UNSAFE_ID = /[\u0000-\u001f\u007f-\u009f/\\?#]/u;

function parseMarkdown(markdown: string): Root {
  return fromMarkdown(markdown, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
}

function referenceKey(identifier: string): string {
  return identifier.normalize('NFC').toLocaleLowerCase('en');
}

function definitionsIn(root: Root): Map<string, Definition> {
  const definitions = new Map<string, Definition>();
  const visit = (node: Root | Content): void => {
    if (node.type === 'definition') {
      const key = referenceKey(node.identifier);
      if (!definitions.has(key)) definitions.set(key, node);
      return;
    }
    if ('children' in node) {
      for (const child of (node as Parent).children) visit(child);
    }
  };
  visit(root);
  return definitions;
}

function cleanTarget(target: string): string {
  const fragment = target.indexOf('#');
  const withoutFragment = fragment < 0 ? target : target.slice(0, fragment);
  try {
    return decodeURIComponent(withoutFragment).trim();
  } catch {
    return withoutFragment.trim();
  }
}

function classifyMarkdownTarget(
  destination: string,
): { kind: ParsedLinkKind; target: string } | null {
  const target = cleanTarget(destination);
  const prefix = 'studio://note/';
  if (target.toLocaleLowerCase('en').startsWith(prefix)) {
    const id = target.slice(prefix.length);
    return id === '' ? null : { kind: 'id', target: id };
  }
  if (/^[a-z][a-z\d+.-]*:/iu.test(target) || target.startsWith('//')) {
    return null;
  }
  return target.toLocaleLowerCase('en').endsWith('.md')
    ? { kind: 'path', target }
    : null;
}

function offsets(node: {
  position?: {
    start: { offset?: number | undefined };
    end: { offset?: number | undefined };
  } | undefined;
}): {
  start: number;
  end: number;
} {
  // mdast-util-from-markdown always positions parsed source nodes.
  return {
    start: node.position!.start.offset!,
    end: node.position!.end.offset!,
  };
}

function wikiLinks(text: Text): Omit<EditableMarkdownLink, 'index'>[] {
  const location = offsets(text);
  const output: Omit<EditableMarkdownLink, 'index'>[] = [];
  let cursor = 0;
  while (cursor < text.value.length) {
    const opening = text.value.indexOf('[[', cursor);
    if (opening < 0) break;
    const closing = text.value.indexOf(']]', opening + 2);
    if (closing < 0) break;
    const inside = text.value.slice(opening + 2, closing);
    const divider = inside.indexOf('|');
    const target = (divider < 0 ? inside : inside.slice(0, divider)).trim();
    const label = (divider < 0 ? target : inside.slice(divider + 1).trim()) || target;
    if (target !== '') {
      output.push({
        kind: 'wiki',
        target,
        label,
        start: location.start + opening,
        end: location.start + closing + 2,
      });
    }
    cursor = closing + 2;
  }
  return output;
}

export function editableMarkdownLinks(markdown: string): EditableMarkdownLink[] {
  const root = parseMarkdown(markdown);
  const definitions = definitionsIn(root);
  const output: Omit<EditableMarkdownLink, 'index'>[] = [];
  const collectLink = (node: Link, destination: string): void => {
    const parsed = classifyMarkdownTarget(destination);
    const location = offsets(node);
    if (parsed) output.push({ ...parsed, label: toString(node), ...location });
  };
  const collectBracketedWiki = (node: LinkReference): boolean => {
    const location = offsets(node);
    if (location.start === 0 || location.end >= markdown.length) return false;
    if (markdown[location.start - 1] !== '[' || markdown[location.end] !== ']') return false;
    const source = markdown.slice(location.start + 1, location.end - 1);
    const divider = source.indexOf('|');
    const target = (divider < 0 ? source : source.slice(0, divider)).trim();
    const label = (divider < 0 ? target : source.slice(divider + 1).trim()) || target;
    output.push({
      kind: 'wiki',
      target,
      label,
      start: location.start - 1,
      end: location.end + 1,
    });
    return true;
  };
  const visit = (node: Root | Content): void => {
    if (node.type === 'link') {
      collectLink(node, node.url);
      return;
    }
    if (node.type === 'linkReference') {
      if (collectBracketedWiki(node)) return;
      const definition = definitions.get(referenceKey(node.identifier));
      if (definition) collectLink(node as LinkReference & Link, definition.url);
      return;
    }
    if (node.type === 'text') {
      output.push(...wikiLinks(node));
      return;
    }
    if (node.type === 'code' || node.type === 'inlineCode' || node.type === 'html') return;
    if ('children' in node) {
      for (const child of (node as Parent).children) visit(child);
    }
  };
  visit(root);
  return output
    .sort((left, right) => left.start - right.start)
    .map((link, index) => ({ ...link, index }));
}

function safeId(target: string): string {
  if (
    target === '' ||
    target.length > 128 ||
    target !== target.trim() ||
    target !== target.normalize('NFC') ||
    UNSAFE_ID.test(target)
  ) {
    throw new RangeError('A relink destination must be a safe note ID.');
  }
  return target;
}

function safePath(target: string): string {
  if (
    target === '' ||
    target.length > 1_024 ||
    target !== target.trim() ||
    target.startsWith('/') ||
    target.includes('\\') ||
    target.includes('\0') ||
    target.includes('>') ||
    /^[A-Za-z]:/u.test(target) ||
    !target.toLocaleLowerCase('en').endsWith('.md')
  ) {
    throw new RangeError('A relink destination must be a safe relative Markdown path.');
  }
  let depth = 0;
  for (const segment of target.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (depth === 0) {
        throw new RangeError('A relink destination must be a safe relative Markdown path.');
      }
      depth -= 1;
    } else {
      depth += 1;
    }
  }
  return target;
}

function escapedLabel(label: string): string {
  return label.replaceAll('\\', '\\\\').replaceAll(']', '\\]');
}

function replacement(link: EditableMarkdownLink, edit: MarkdownLinkEdit): string {
  if (edit.kind === 'remove') return link.label;
  if (edit.kind === 'wiki') {
    const target = edit.target.trim();
    if (target === '' || target.includes(']]') || target.includes('\n') || target.includes('\r')) {
      throw new RangeError('A relink destination must be a safe wiki title.');
    }
    return link.label === target ? `[[${target}]]` : `[[${target}|${link.label}]]`;
  }
  const destination = edit.kind === 'id'
    ? `studio://note/${encodeURIComponent(safeId(edit.target))}`
    : safePath(edit.target);
  return `[${escapedLabel(link.label)}](${destination})`;
}

export function rewriteMarkdownLink(
  markdown: string,
  occurrence: number,
  edit: MarkdownLinkEdit,
): string {
  if (!Number.isSafeInteger(occurrence) || occurrence < 0) {
    throw new RangeError('The link occurrence is outside this note.');
  }
  const link = editableMarkdownLinks(markdown)[occurrence];
  if (!link) throw new RangeError('The link occurrence is outside this note.');
  return `${markdown.slice(0, link.start)}${replacement(link, edit)}${markdown.slice(link.end)}`;
}
