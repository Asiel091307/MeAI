import { Pool } from 'pg';

let pool: Pool | undefined;

// DATABASE_URL (for example a hosted PostgreSQL) wins; otherwise the individual DB_* variables.
export function createPool(env: Readonly<Record<string, string | undefined>>): Pool {
  if (env.DATABASE_URL) {
    return new Pool({ connectionString: env.DATABASE_URL });
  }
  return new Pool({
    host: env.DB_HOST || '127.0.0.1',
    port: Number(env.DB_PORT || 5432),
    database: env.DB_NAME || 'meai',
    user: env.DB_USER || 'meai',
    password: env.DB_PASSWORD || env.POSTGRES_PASSWORD,
  });
}

// One shared connection pool for the whole server process, created on first use.
export function getPool(env: Readonly<Record<string, string | undefined>> = process.env): Pool {
  pool ??= createPool(env);
  return pool;
}
