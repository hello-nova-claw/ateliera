import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { expect, test } from 'vitest';

// A solid 4 × 4 RGB PNG, written by hand so the test needs no image library.
function png(red: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes: Buffer) => {
    let c = 0xffffffff;
    for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(4, 0);
  header.writeUInt32BE(4, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.from([0, ...Array.from({ length: 4 }, () => [red, 90, 60]).flat()]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat([row, row, row, row]))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test.skipIf(process.platform !== 'darwin')(
  "replaces only shots that look the same as main's",
  () => {
    const main = mkdtempSync(join(tmpdir(), 'match-main-'));
    const head = mkdtempSync(join(tmpdir(), 'match-head-'));
    writeFileSync(join(main, 'same.png'), png(100));
    writeFileSync(join(head, 'same.png'), png(110));
    writeFileSync(join(main, 'changed.png'), png(100));
    writeFileSync(join(head, 'changed.png'), png(200));
    writeFileSync(join(head, 'new.png'), png(50));

    const output = execFileSync(
      'swift',
      ['bin/match-shots.swift', main, head],
      { encoding: 'utf8' },
    );

    expect(output).toContain('Matched 1 shots');
    expect(readFileSync(join(head, 'same.png'))).toEqual(png(100));
    expect(readFileSync(join(head, 'changed.png'))).toEqual(png(200));
    expect(readFileSync(join(head, 'new.png'))).toEqual(png(50));
  },
  120_000,
);
