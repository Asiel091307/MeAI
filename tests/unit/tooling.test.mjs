import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { test } from 'vitest';

const packageJson = JSON.parse(
  await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
);

for (const script of ['lint', 'typecheck']) {
  // Asynchronous on purpose: a synchronous spawn blocks the Vitest worker for the whole tsc run,
  // and the runner then reports a "Timeout calling onTaskUpdate" error even though tests pass.
  test(`pnpm ${script} checks the project successfully`, async () => {
    const command = process.platform === 'win32' ? 'cmd.exe' : 'pnpm';
    const args = process.platform === 'win32'
      ? ['/d', '/s', '/c', `pnpm ${script}`]
      : [script];
    try {
      await promisify(execFile)(command, args, { encoding: 'utf8', timeout: 120_000 });
    } catch (error) {
      assert.fail(error.stderr || error.stdout || error.message);
    }
  }, 150_000);
}

test('the test script runs the Vitest unit suite', () => {
  assert.equal(packageJson.scripts.test, 'vitest run --config vitest.config.ts');
});

test('the integration script runs a separate Vitest suite', () => {
  assert.equal(packageJson.scripts['test:integration'], 'vitest run --config vitest.integration.config.ts');
});
