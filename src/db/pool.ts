import { Pool } from 'pg';

let pool: Pool | undefined;

// One shared connection pool for the whole server process, created on first use.
export function getPool(env: Readonly<Record<string, string | undefined>> = process.env): Pool {
  pool ??= new Pool({
    host: env.DB_HOST || '127.0.0.1',
    port: Number(env.DB_PORT || 5432),
    database: env.DB_NAME || 'meai',
    user: env.DB_USER || 'meai',
    password: env.DB_PASSWORD || env.POSTGRES_PASSWORD,
  });
  return pool;
}
