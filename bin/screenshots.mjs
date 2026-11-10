#!/usr/bin/env node
// The screenshot catalogue: collects the shots ScreenshotCatalogueUITests attaches,
// compares a pull request's shots with main's, and writes the Screenshots comment.
//
// Usage:
//   node bin/screenshots.mjs collect <.xcresult> <out dir>       (macOS: scales each shot down)
//   node bin/screenshots.mjs validate <dir>
//   node bin/screenshots.mjs stage <main dir> <head dir> <pr dir> (prints the diff as JSON)
//   node bin/screenshots.mjs comment <diff.json> <repo> <pr> <head sha> <branch sha>
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const MARKER = '<!-- ateliera-screenshots -->';

// <screen>--<state>--<locale>--<device>.jpg: the UI test's attachment name, as a JPEG.
export const SHOT = /^[a-z0-9-]+--[a-z0-9-]+--[A-Za-z0-9-]+--[a-z0-9-]+\.jpg$/;

const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const MAX_BYTES = 1024 * 1024;

// Shown with images in the comment; the rest are listed by name.
export const SHOWN = 20;

/** Xcode exports "<name>_<n>_<UUID>.png"; returns "<name>.jpg", or null for anything else. */
export function shotName(suggested) {
  const match = /^(.+)_\d+_[0-9A-Fa-f-]{36}\.png$/.exec(suggested);
  if (!match) return null;
  const name = `${match[1]}.jpg`;
  return SHOT.test(name) ? name : null;
}

export function isJpeg(buffer) {
  return buffer.subarray(0, JPEG.length).equals(JPEG);
}

/**
 * The shots come from the pull request's own code, so they're checked before anything
 * publishes them: names in the catalogue's form, real JPEGs, and small.
 */
export function validate(dir) {
  for (const file of readdirSync(dir)) {
    if (!SHOT.test(file)) throw new Error(`Unexpected file in the shots: ${file}`);
    const path = join(dir, file);
    if (statSync(path).size > MAX_BYTES) throw new Error(`Shot too large: ${file}`);
    if (!isJpeg(readFileSync(path))) throw new Error(`Not a JPEG: ${file}`);
  }
}

export function hashes(dir) {
  const result = new Map();
  let files = [];
  try {
    files = readdirSync(dir);
  } catch {
    return result;
  }
  for (const file of files.filter((name) => SHOT.test(name))) {
    result.set(file, createHash('sha256').update(readFileSync(join(dir, file))).digest('hex'));
  }
  return result;
}

export function diff(base, head) {
  const changed = [];
  const added = [];
  const removed = [];
  let unchanged = 0;
  for (const [name, hash] of head) {
    if (!base.has(name)) added.push(name);
    else if (base.get(name) !== hash) changed.push(name);
    else unchanged += 1;
  }
  for (const name of base.keys()) if (!head.has(name)) removed.push(name);
  return {
    changed: changed.sort(),
    added: added.sort(),
    removed: removed.sort(),
    unchanged,
  };
}

/** Copies the changed and added shots into a fresh pr dir, so only those are kept. */
export function stage(mainDir, headDir, prDir) {
  validate(headDir);
  const result = diff(hashes(mainDir), hashes(headDir));
  rmSync(prDir, { recursive: true, force: true });
  mkdirSync(prDir, { recursive: true });
  for (const name of [...result.changed, ...result.added])
    copyFileSync(join(headDir, name), join(prDir, name));
  return result;
}

export function comment({ diff: result, repo, pr, headSha, branchSha }) {
  const raw = (path) =>
    `https://raw.githubusercontent.com/${repo}/${branchSha}/${path}`;
  const label = (name) => name.replace(/\.jpg$/, '');
  const lines = [MARKER, '### Screenshots', ''];
  const { changed, added, removed, unchanged } = result;
  lines.push(
    `For ${headSha.slice(0, 7)}, compared with \`main\`: ${changed.length} changed, ${added.length} new, ${removed.length} gone, ${unchanged} the same. Every shot is taken in an invented fixture vault.`,
    '',
  );
  if (changed.length + added.length + removed.length === 0) {
    lines.push('Nothing on screen changed.');
    return lines.join('\n');
  }
  if (changed.length > 0) {
    lines.push('#### Changed', '', '| Shot | `main` | This pull request |', '| --- | --- | --- |');
    for (const name of changed.slice(0, SHOWN))
      lines.push(
        `| ${label(name)} | <img src="${raw(`main/${name}`)}" width="200" alt="${label(name)} on main"> | <img src="${raw(`pr-${pr}/${name}`)}" width="200" alt="${label(name)} in this pull request"> |`,
      );
    lines.push('');
  }
  if (added.length > 0) {
    lines.push('#### New', '', '| Shot | This pull request |', '| --- | --- |');
    for (const name of added.slice(0, SHOWN))
      lines.push(
        `| ${label(name)} | <img src="${raw(`pr-${pr}/${name}`)}" width="200" alt="${label(name)} in this pull request"> |`,
      );
    lines.push('');
  }
  const rest = [...changed.slice(SHOWN), ...added.slice(SHOWN)];
  if (rest.length > 0) {
    lines.push(
      `<details><summary>${rest.length} more</summary>`,
      '',
      ...rest.map((name) => `- [${label(name)}](${raw(`pr-${pr}/${name}`)})`),
      '',
      '</details>',
      '',
    );
  }
  if (removed.length > 0) {
    lines.push(
      `<details><summary>${removed.length} gone</summary>`,
      '',
      ...removed.map((name) => `- ${label(name)}`),
      '',
      '</details>',
    );
  }
  return lines.join('\n').trimEnd();
}

function collect(bundle, out) {
  const exported = mkdtempSync(join(tmpdir(), 'shots-'));
  execFileSync('xcrun', [
    'xcresulttool', 'export', 'attachments',
    '--path', bundle, '--output-path', exported,
  ]);
  const manifest = JSON.parse(readFileSync(join(exported, 'manifest.json'), 'utf8'));
  mkdirSync(out, { recursive: true });
  let count = 0;
  for (const test of manifest)
    for (const attachment of test.attachments) {
      const name = shotName(attachment.suggestedHumanReadableName);
      if (!name) continue;
      // A third of the size, as a JPEG, is plenty to see a change and keeps the branch small.
      execFileSync('sips', [
        '--resampleWidth', '430', '-s', 'format', 'jpeg', '-s', 'formatOptions', '75',
        join(exported, attachment.exportedFileName),
        '--out', join(out, name),
      ], { stdio: 'ignore' });
      count += 1;
    }
  console.log(`Collected ${count} shots.`);
}

function main([command, ...args]) {
  if (command === 'collect') collect(args[0], args[1]);
  else if (command === 'validate') validate(args[0]);
  else if (command === 'stage') console.log(JSON.stringify(stage(args[0], args[1], args[2])));
  else if (command === 'comment') {
    const [file, repo, pr, headSha, branchSha] = args;
    const result = JSON.parse(readFileSync(file, 'utf8'));
    console.log(comment({ diff: result, repo, pr, headSha, branchSha }));
  } else {
    console.error('Usage: node bin/screenshots.mjs <collect|validate|stage|comment> …');
    process.exit(2);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main(process.argv.slice(2));
