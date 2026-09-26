import { spawn } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const options = { directory: 'db/migrations', database: 'meai' };
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (!value || !['--directory', '--database'].includes(key)) {
    throw new Error('Usage: node scripts/migrate.mjs [--directory path] [--database name]');
  }
  options[key.slice(2)] = value;
}

if (!/^[a-z][a-z0-9_]*$/.test(options.database)) {
  throw new Error('Database name must use lowercase letters, digits, and underscores');
}

const directory = resolve(options.directory);
const entries = await readdir(directory, { withFileTypes: true });
const filenames = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
  .map((entry) => entry.name).sort();
const numbers = new Set();

for (const filename of filenames) {
  const match = /^([0-9]{3})_[a-z0-9_]+\.sql$/.exec(filename);
  if (!match || numbers.has(match[1])) {
    throw new Error(`Invalid or duplicate migration number: ${filename}`);
  }
  numbers.add(match[1]);
}

for (const filename of filenames) {
  const version = filename.slice(0, -4);
  const sql = await readFile(resolve(directory, filename), 'utf8');
  if (!sql.trimEnd().endsWith(';')) {
    throw new Error(`Migration must end with a semicolon: ${filename}`);
  }

  const input = `BEGIN;
SELECT pg_advisory_xact_lock(106006);
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
SELECT NOT EXISTS (
  SELECT 1 FROM public.schema_migrations WHERE version = '${version}'
) AS pending \\gset
\\if :pending
${sql}
INSERT INTO public.schema_migrations (version) VALUES ('${version}');
\\echo Applied ${version}
\\else
\\echo Skipped ${version}
\\endif
COMMIT;
`;

  await new Promise((done, fail) => {
    const child = spawn('docker', [
      'compose', 'exec', '-T', 'db', 'psql', '-X', '-v', 'ON_ERROR_STOP=1',
      '-U', 'meai', '-d', options.database, '-f', '-',
    ], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    let errors = '';
    child.stdout.on('data', (data) => { output += data; });
    child.stderr.on('data', (data) => { errors += data; });
    child.on('error', fail);
    child.on('close', (code) => {
      if (code !== 0) fail(new Error(`Migration ${filename} failed: ${errors}`));
      else {
        process.stdout.write(output);
        done();
      }
    });
    child.stdin.end(input);
  });
}
