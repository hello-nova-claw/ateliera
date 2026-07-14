import { describe, expect, it } from 'vitest';

import { parseSearchIndexRequest } from './search-index-worker-protocol';

describe('search index worker protocol', () => {
  it('accepts only allowlisted bounded RPC requests', () => {
    expect(parseSearchIndexRequest({ id: 1, method: 'search', args: ['calm'] })).toEqual({
      id: 1, method: 'search', args: ['calm'],
    });
    expect(() => parseSearchIndexRequest({ id: 1, method: 'evaluate', args: [] })).toThrow('Invalid');
    expect(() => parseSearchIndexRequest({ id: 1, method: 'search', args: ['x'.repeat(513)] })).toThrow('512');
    expect(() => parseSearchIndexRequest({ id: 1, method: 'getManyById', args: [Array(10_001).fill('id')] })).toThrow('10,000');
    expect(() => parseSearchIndexRequest({ id: 1, method: 'remove', args: [{ id: 'not-text' }] })).toThrow('text ID');
    expect(() => parseSearchIndexRequest({ id: 1, method: 'search', args: ['calm', { tags: Array(101).fill('tag') }] })).toThrow('100');
    expect(() => parseSearchIndexRequest({ id: 1, method: 'upsert', args: [{}, 'note.md', 'hash', {}] })).toThrow('note');
  });
});
