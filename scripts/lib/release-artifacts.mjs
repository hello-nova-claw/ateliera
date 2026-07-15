import { readFile, readdir, stat } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

const TEXT_EXTENSIONS = new Set(['.css', '.html', '.js', '.json', '.mjs', '.svg', '.webmanifest']);
const EXCLUDED_FROM_PRECACHE = new Set([
  '_headers',
  'service-worker.js',
  'studio-precache-manifest.json',
]);
const PROTOTYPE_MARKERS = [
  'The Studio.dc.html',
  'Ateliera.dc.html',
  'design/reference',
  'original-mockup.png',
  '<streaming-text',
];
const DOCUMENTATION_URL_HOSTS = new Set([
  'developer.chrome.com',
  'github.com',
  'json-schema.org',
  'react.dev',
  'sqlite.org',
  'www.w3.org',
]);

function extension(path) {
  const dot = path.lastIndexOf('.');
  return dot === -1 ? '' : path.slice(dot);
}

async function listFiles(root, directory = root) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Release artifacts must not contain symbolic links: ${entry.name}`);
    }
    if (entry.isDirectory()) files.push(...(await listFiles(root, absolute)));
    else if (entry.isFile()) files.push(relative(root, absolute).split(sep).join('/'));
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function expectedPrecacheUrl(path) {
  return path === 'index.html' ? '/' : `/${path}`;
}

function validIcon(manifest, purpose) {
  return manifest.icons?.some(
    (icon) =>
      typeof icon.src === 'string' &&
      (purpose === undefined || icon.purpose?.split(/\s+/u).includes(purpose)),
  );
}

export async function inspectPwaArtifact(rootPath) {
  const root = resolve(rootPath);
  const issues = [];
  const files = await listFiles(root);
  const fileSet = new Set(files);
  const required = [
    'index.html',
    'manifest.webmanifest',
    'service-worker.js',
    'studio-precache-manifest.json',
  ];
  for (const path of required) {
    if (!fileSet.has(path)) issues.push(`Missing required PWA artifact: /${path}`);
  }

  let manifest = {};
  let precache = { entries: [], version: '' };
  try {
    manifest = JSON.parse(await readFile(resolve(root, 'manifest.webmanifest'), 'utf8'));
  } catch (error) {
    issues.push(`Invalid PWA manifest: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    precache = JSON.parse(
      await readFile(resolve(root, 'studio-precache-manifest.json'), 'utf8'),
    );
  } catch (error) {
    issues.push(`Invalid precache manifest: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (manifest.name !== 'Ateliera') issues.push('PWA name must be “Ateliera”.');
  if (manifest.start_url !== '/') issues.push('PWA start_url must be /.');
  if (manifest.scope !== '/') issues.push('PWA scope must be /.');
  if (manifest.display !== 'standalone') issues.push('PWA display must be standalone.');
  if (!validIcon(manifest)) issues.push('PWA manifest needs an application icon.');
  if (!validIcon(manifest, 'maskable')) issues.push('PWA manifest needs a maskable icon.');
  for (const icon of manifest.icons ?? []) {
    if (typeof icon.src !== 'string' || !icon.src.startsWith('/')) continue;
    if (!fileSet.has(icon.src.slice(1))) issues.push(`PWA icon is missing: ${icon.src}`);
  }

  const entries = Array.isArray(precache.entries) ? precache.entries : [];
  const precacheUrls = new Set();
  for (const entry of entries) {
    if (
      typeof entry?.url !== 'string' ||
      !entry.url.startsWith('/') ||
      typeof entry.revision !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(entry.revision)
    ) {
      issues.push('Precache entries require a local URL and a SHA-256 revision.');
      continue;
    }
    if (precacheUrls.has(entry.url)) issues.push(`Duplicate precache URL: ${entry.url}`);
    precacheUrls.add(entry.url);
  }
  for (const path of files) {
    if (EXCLUDED_FROM_PRECACHE.has(path)) continue;
    const url = expectedPrecacheUrl(path);
    if (!precacheUrls.has(url)) issues.push(`Production artifact is not precached: ${url}`);
  }

  let javascriptBytes = 0;
  let totalBytes = 0;
  for (const path of files) {
    const info = await stat(resolve(root, path));
    totalBytes += info.size;
    if (path.endsWith('.js')) javascriptBytes += info.size;
    if (!TEXT_EXTENSIONS.has(extension(path))) continue;
    const source = await readFile(resolve(root, path), 'utf8');
    for (const marker of PROTOTYPE_MARKERS) {
      if (source.includes(marker)) {
        issues.push(`Production artifact contains prototype runtime marker in /${path}: ${marker}`);
      }
    }
    const remoteUrls = source.match(/https?:\/\/[^\s"'`)]+/gu) ?? [];
    const unexpectedRemote = remoteUrls.find((value) => {
      if (value.includes('${')) return false;
      try {
        return !DOCUMENTATION_URL_HOSTS.has(new URL(value).hostname);
      } catch {
        return true;
      }
    });
    if (unexpectedRemote) {
      issues.push(
        `Production artifact contains a remote URL in /${path}: ${unexpectedRemote}`,
      );
    }
  }

  if (javascriptBytes > 2_000_000) {
    issues.push(`Production JavaScript is ${javascriptBytes} bytes; budget is 2000000 bytes.`);
  }

  return {
    files,
    issues: [...new Set(issues)],
    metrics: {
      fileCount: files.length,
      javascriptBytes,
      precacheEntries: entries.length,
      totalBytes,
    },
  };
}
