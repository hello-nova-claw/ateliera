import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';

interface RenderNode {
  type: string;
  children?: RenderNode[];
  [key: string]: unknown;
}

interface ReferenceDefinition {
  title?: string | null;
  url: string;
}

const SAFE_IMAGE_EXTENSION = /\.(?:avif|gif|jpe?g|png|webp)(?:[?#].*)?$/i;
const ACTIVE_SCHEME = /^(?:data|file|javascript|vbscript):/i;
const SAFE_LINK_SCHEME = /^(?:https?|mailto):/i;
const SCHEME = /^[a-z][a-z\d+.-]*:/i;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizedUrlForValidation(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || /[\u0000-\u001f\u007f]/.test(trimmed) || trimmed.includes('\\')) return null;
  let decoded = trimmed;
  for (let index = 0; index < 2; index += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      return null;
    }
  }
  if (/[\u0000-\u001f\u007f]/.test(decoded)) return null;
  return decoded.replace(/[\t\n\r ]/g, '');
}

export function isSafeMarkdownUrl(value: string, kind: 'image' | 'link'): boolean {
  const normalized = normalizedUrlForValidation(value);
  if (!normalized || normalized.startsWith('//') || ACTIVE_SCHEME.test(normalized)) return false;
  if (kind === 'image') {
    return !SCHEME.test(normalized) && !normalized.startsWith('/') && SAFE_IMAGE_EXTENSION.test(normalized);
  }
  return !SCHEME.test(normalized) || SAFE_LINK_SCHEME.test(normalized);
}

function definitions(root: RenderNode): Map<string, ReferenceDefinition> {
  const found = new Map<string, ReferenceDefinition>();
  const visit = (node: RenderNode): void => {
    if (node.type === 'definition') {
      const key = String(node.identifier ?? '').normalize('NFC').toLocaleLowerCase('en');
      const url = typeof node.url === 'string' ? node.url : '';
      const title = typeof node.title === 'string' ? node.title : null;
      if (!found.has(key)) found.set(key, { title, url });
      return;
    }
    if ('children' in node && Array.isArray(node.children)) {
      for (const child of node.children as RenderNode[]) visit(child);
    }
  };
  visit(root);
  return found;
}

function children(node: RenderNode, references: Map<string, ReferenceDefinition>): string {
  if (!('children' in node) || !Array.isArray(node.children)) return '';
  return (node.children as RenderNode[]).map((child) => renderNode(child, references)).join('');
}

function linkHtml(url: string, label: string, title?: string | null): string {
  if (!isSafeMarkdownUrl(url, 'link')) return label;
  const titleAttribute = title ? ` title="${escapeHtml(title)}"` : '';
  return `<a href="${escapeHtml(url)}" rel="noopener noreferrer"${titleAttribute}>${label}</a>`;
}

function imageHtml(url: string, alt: string, title?: string | null): string {
  if (!isSafeMarkdownUrl(url, 'image')) return escapeHtml(alt);
  const titleAttribute = title ? ` title="${escapeHtml(title)}"` : '';
  return `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async"${titleAttribute}>`;
}

function renderNode(node: RenderNode, references: Map<string, ReferenceDefinition>): string {
  const body = () => children(node, references);
  switch (node.type) {
    case 'root': return body();
    case 'text': return escapeHtml(String(node.value ?? ''));
    case 'html': return '';
    case 'paragraph': return `<p>${body()}</p>`;
    case 'heading': {
      const depth = Number(node.depth);
      const safeDepth = Number.isInteger(depth) && depth >= 1 && depth <= 6 ? depth : 2;
      return `<h${safeDepth}>${body()}</h${safeDepth}>`;
    }
    case 'emphasis': return `<em>${body()}</em>`;
    case 'strong': return `<strong>${body()}</strong>`;
    case 'delete': return `<del>${body()}</del>`;
    case 'inlineCode': return `<code>${escapeHtml(String(node.value ?? ''))}</code>`;
    case 'code': {
      const language = typeof node.lang === 'string' && /^[a-z\d_-]{1,40}$/i.test(node.lang)
        ? ` class="language-${escapeHtml(node.lang)}"`
        : '';
      return `<pre><code${language}>${escapeHtml(String(node.value ?? ''))}</code></pre>`;
    }
    case 'blockquote': return `<blockquote>${body()}</blockquote>`;
    case 'thematicBreak': return '<hr>';
    case 'break': return '<br>';
    case 'list': {
      const ordered = node.ordered === true;
      const start = ordered && typeof node.start === 'number' && node.start !== 1
        ? ` start="${Math.max(1, Math.trunc(node.start))}"`
        : '';
      return `<${ordered ? 'ol' : 'ul'}${start}>${body()}</${ordered ? 'ol' : 'ul'}>`;
    }
    case 'listItem': return `<li>${body()}</li>`;
    case 'link': return linkHtml(String(node.url ?? ''), body(), typeof node.title === 'string' ? node.title : null);
    case 'image': return imageHtml(
      String(node.url ?? ''),
      typeof node.alt === 'string' ? node.alt : '',
      typeof node.title === 'string' ? node.title : null,
    );
    case 'linkReference': {
      const key = String(node.identifier ?? '').normalize('NFC').toLocaleLowerCase('en');
      const reference = references.get(key);
      return reference ? linkHtml(reference.url, body(), reference.title) : body();
    }
    case 'imageReference': {
      const key = String(node.identifier ?? '').normalize('NFC').toLocaleLowerCase('en');
      const reference = references.get(key);
      const alt = typeof node.alt === 'string' ? node.alt : '';
      return reference ? imageHtml(reference.url, alt, reference.title) : escapeHtml(alt);
    }
    case 'table': return `<table>${body()}</table>`;
    case 'tableRow': return `<tr>${body()}</tr>`;
    case 'tableCell': return `<td>${body()}</td>`;
    case 'definition': return '';
    default: return body();
  }
}

/**
 * Renders a deliberately small, inert CommonMark/GFM HTML allowlist.
 * Raw HTML is always escaped and unsafe URLs are emitted as plain labels.
 */
export function renderMarkdown(markdown: string): string {
  const root = fromMarkdown(markdown, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  }) as unknown as RenderNode;
  return renderNode(root, definitions(root));
}
