import { neon } from '@neondatabase/serverless';

export function sql() {
  return neon(process.env.DATABASE_URL);
}

export async function setupDb() {
  const db = sql();
  await db`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      shopify_id BIGINT UNIQUE,
      data JSONB NOT NULL,
      binnen_status TEXT DEFAULT 'pending',
      binnen_by TEXT,
      binnen_at TEXT,
      bez_status TEXT DEFAULT 'wachten',
      bez_by TEXT,
      bez_at TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await db`
    CREATE TABLE IF NOT EXISTS activity_log (
      id SERIAL PRIMARY KEY,
      message TEXT NOT NULL,
      user_name TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}
