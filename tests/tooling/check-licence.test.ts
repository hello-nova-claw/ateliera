import { expect, test } from 'vitest';

import {
  checkContentLicence,
  checkMitLicence,
} from '../../bin/check-licence.mjs';

const mit = (holder: string) =>
  `MIT License\n\nCopyright (c) 2026 ${holder}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.\n`;

test('the MIT text with the agreed copyright line passes', () => {
  expect(checkMitLicence(mit('Anna McPhee'))).toEqual([]);
});

test('an edited MIT text fails', () => {
  expect(checkMitLicence(mit('Someone Else'))).not.toEqual([]);
  expect(
    checkMitLicence(mit('Anna McPhee').replace('free of charge', 'for a fee')),
  ).not.toEqual([]);
  expect(
    checkMitLicence(`${mit('Anna McPhee')}\nExcept the parts we say.\n`),
  ).not.toEqual([]);
});

test('the content licence must name reserved paths that exist', () => {
  const text =
    'All rights reserved.\n\n- `apple/Ateliera/Content/`\n- `docs/missing/`\n';
  const exists = (p: string) => p !== 'docs/missing/';
  expect(checkContentLicence(text, exists)).toEqual([
    'CONTENT-LICENSE.md names docs/missing/, which does not exist.',
  ]);
  expect(checkContentLicence('All rights reserved.\n', exists)).toEqual([
    'CONTENT-LICENSE.md names no reserved paths.',
  ]);
  expect(checkContentLicence(undefined, exists)).toEqual([
    'CONTENT-LICENSE.md is missing.',
  ]);
});
