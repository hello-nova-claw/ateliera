export type SqlValue = string | number | bigint | Uint8Array | null;

export interface SqliteStatement {
  all(...values: SqlValue[]): unknown[];
  get(...values: SqlValue[]): unknown;
  run(...values: SqlValue[]): unknown;
}

export interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}
