#!/usr/bin/env node
// Fails if LICENSE stops being the unaltered MIT text with the agreed copyright
// line, or if CONTENT-LICENSE.md is missing or names reserved paths that don't
// exist. See docs/design.md, Decisions: Licensing.
//
// Usage: node bin/check-licence.mjs
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const COPYRIGHT = 'Copyright (c) 2026 Anna McPhee';

const MIT = `MIT License

${COPYRIGHT}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

export function checkMitLicence(text) {
  return text === MIT
    ? []
    : [`LICENSE must be the unaltered MIT text with "${COPYRIGHT}".`];
}

export function checkContentLicence(text, exists) {
  if (text === undefined) return ['CONTENT-LICENSE.md is missing.'];
  const paths = [...text.matchAll(/^- `([^`]+)`/gm)].map((m) => m[1]);
  if (paths.length === 0)
    return ['CONTENT-LICENSE.md names no reserved paths.'];
  return paths
    .filter((path) => !exists(path))
    .map((path) => `CONTENT-LICENSE.md names ${path}, which does not exist.`);
}

function main() {
  const read = (path) =>
    existsSync(path) ? readFileSync(path, 'utf8') : undefined;
  const errors = [
    ...checkMitLicence(read('LICENSE') ?? ''),
    ...checkContentLicence(read('CONTENT-LICENSE.md'), existsSync),
  ];
  for (const error of errors) console.log(`::error::${error}`);
  if (errors.length > 0) process.exit(1);
  console.log('Licence files intact.');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
