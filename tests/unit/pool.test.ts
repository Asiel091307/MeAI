import { expect, test } from 'vitest';
import { createPool } from '../../src/db/pool';

test('DATABASE_URL takes precedence over the DB_* variables', async () => {
  const pool = createPool({
    DATABASE_URL: 'postgres://user1:secret@db.example.com:6543/mydb',
    DB_HOST: 'ignored-host',
    DB_NAME: 'ignored',
  });
  expect(pool.options.connectionString).toBe('postgres://user1:secret@db.example.com:6543/mydb');
  expect(pool.options.host).toBeUndefined();
  await pool.end();
});

test('without DATABASE_URL the DB_* variables and defaults are used', async () => {
  const withVariables = createPool({
    DB_HOST: 'db',
    DB_PORT: '5433',
    DB_NAME: 'app',
    DB_USER: 'me',
    DB_PASSWORD: 'pw',
  });
  expect(withVariables.options).toMatchObject({
    host: 'db',
    port: 5433,
    database: 'app',
    user: 'me',
    password: 'pw',
  });
  expect(withVariables.options.connectionString).toBeUndefined();
  await withVariables.end();

  const defaults = createPool({});
  expect(defaults.options).toMatchObject({ host: '127.0.0.1', port: 5432, database: 'meai', user: 'meai' });
  await defaults.end();
});

test('getPool builds the shared pool from DATABASE_URL', async () => {
  const { getPool } = await import('../../src/db/pool');
  const pool = getPool({ DATABASE_URL: 'postgres://user1:secret@db.example.com:6543/mydb' });
  expect(pool.options.connectionString).toBe('postgres://user1:secret@db.example.com:6543/mydb');
  expect(getPool()).toBe(pool);
  await pool.end();
});
