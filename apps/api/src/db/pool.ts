import pg from "pg";

export type Db = pg.Pool;
export type DbClient = pg.PoolClient;

export function createPool(connectionString: string): Db {
  return new pg.Pool({ connectionString, max: 10, application_name: "bluebird-api" });
}

/**
 * Runs `fn` in a transaction with `app.user_id` set — the value the Row-Level
 * Security policies key on. Without it, every user-owned table reads empty.
 */
export async function withUser<T>(
  pool: Db,
  userId: string,
  fn: (client: DbClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
