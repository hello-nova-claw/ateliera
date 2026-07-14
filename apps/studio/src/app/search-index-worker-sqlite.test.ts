import { describe, expect, it, vi } from 'vitest';
import type { SqlValue } from '@studio/index';

import { createSqliteDriverFromWasmDatabase } from './search-index-worker-sqlite';

function statement(rows: Array<Record<string, SqlValue>>) {
  let cursor = 0;
  return {
    bind: vi.fn(),
    step: vi.fn(() => cursor < rows.length),
    get: vi.fn((target: Record<string, SqlValue>) => Object.assign(target, rows[cursor++])),
    finalize: vi.fn(),
  };
}

describe('SQLite WASM driver adapter', () => {
  it('binds, returns object rows, and finalizes each prepared statement', () => {
    const first = statement([{ id: 'one' }, { id: 'two' }]);
    const second = statement([{ id: 'one' }]);
    const third = statement([]);
    const database = {
      exec: vi.fn(),
      prepare: vi.fn()
        .mockReturnValueOnce(first)
        .mockReturnValueOnce(second)
        .mockReturnValueOnce(third),
      close: vi.fn(),
    };
    const driver = createSqliteDriverFromWasmDatabase(database);

    expect(driver.prepare('SELECT *').all('value')).toEqual([{ id: 'one' }, { id: 'two' }]);
    expect(driver.prepare('SELECT one').get('value')).toEqual({ id: 'one' });
    expect(driver.prepare('UPDATE one').run('value')).toBeUndefined();
    expect(first.bind).toHaveBeenCalledWith(['value']);
    expect(first.finalize).toHaveBeenCalledOnce();
    expect(second.finalize).toHaveBeenCalledOnce();
    expect(third.finalize).toHaveBeenCalledOnce();
  });

  it('finalizes statements that throw', () => {
    const failing = statement([]);
    failing.bind.mockImplementation(() => { throw new Error('bind failed'); });
    const driver = createSqliteDriverFromWasmDatabase({
      exec: vi.fn(), prepare: vi.fn(() => failing), close: vi.fn(),
    });
    expect(() => driver.prepare('broken').all('value')).toThrow('bind failed');
    expect(failing.finalize).toHaveBeenCalledOnce();
  });
});
