import { DatabaseSync } from 'node:sqlite';

import { createSqliteIndex, type SqliteIndex } from './sqlite-index';
import type { SqlValue, SqliteDatabase, SqliteStatement } from './sqlite-driver';

function adaptDatabase(database: DatabaseSync): SqliteDatabase {
  return {
    exec(sql) { database.exec(sql); },
    prepare(sql): SqliteStatement {
      const statement = database.prepare(sql);
      return {
        all(...values: SqlValue[]) { return statement.all(...values); },
        get(...values: SqlValue[]) { return statement.get(...values); },
        run(...values: SqlValue[]) { return statement.run(...values); },
      };
    },
    close() { database.close(); },
  };
}

export function createNodeSqliteIndex(path: string): SqliteIndex {
  return createSqliteIndex(adaptDatabase(new DatabaseSync(path)));
}
