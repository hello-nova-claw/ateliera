import type { SqlValue, SqliteDatabase, SqliteStatement } from '@studio/index';

interface WasmPreparedStatement {
  bind(values: readonly SqlValue[]): unknown;
  step(): boolean;
  get(target: Record<string, SqlValue>): Record<string, SqlValue>;
  finalize(): unknown;
}

export interface WasmDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): WasmPreparedStatement;
  close(): unknown;
}

function execute<T>(
  database: WasmDatabase,
  sql: string,
  values: SqlValue[],
  operation: (statement: WasmPreparedStatement) => T,
): T {
  const statement = database.prepare(sql);
  try {
    if (values.length > 0) statement.bind(values);
    return operation(statement);
  } finally {
    statement.finalize();
  }
}

export function createSqliteDriverFromWasmDatabase(database: WasmDatabase): SqliteDatabase {
  return {
    exec(sql) { database.exec(sql); },
    prepare(sql): SqliteStatement {
      return {
        all(...values) {
          return execute(database, sql, values, (statement) => {
            const found: Array<Record<string, SqlValue>> = [];
            while (statement.step()) found.push(statement.get({}));
            return found;
          });
        },
        get(...values) {
          return execute(database, sql, values, (statement) =>
            statement.step() ? statement.get({}) : undefined,
          );
        },
        run(...values) {
          execute(database, sql, values, (statement) => { statement.step(); });
        },
      };
    },
    close() { database.close(); },
  };
}
