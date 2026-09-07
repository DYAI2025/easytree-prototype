import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";

export type Database = PostgresJsDatabase<Record<string, never>>;

export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface DbHandle {
  readonly db: Database;
  /** Rohzugriff fuer Migrationen, Truncate und Smoke-Tests. */
  readonly sql: Sql;
  readonly close: () => Promise<void>;
}

export function createDb(connectionString: string, options: { max?: number } = {}): DbHandle {
  const sql = postgres(connectionString, { max: options.max ?? 10 });

  return {
    db: drizzle(sql),
    sql,
    close: async () => {
      await sql.end();
    },
  };
}

/** Fuehrt `fn` in einer Transaktion aus. Fehler -> vollstaendiger Rollback. */
export async function withTransaction<T>(
  db: Database,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => fn(tx));
}
