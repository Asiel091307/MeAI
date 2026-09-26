import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { test } from 'vitest';

const packageJson = JSON.parse(
  await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
);

for (const script of ['lint', 'typecheck']) {
  test(`pnpm ${script} checks the project successfully`, () => {
    const command = process.platform === 'win32' ? 'cmd.exe' : 'pnpm';
    const args = process.platform === 'win32'
      ? ['/d', '/s', '/c', `pnpm ${script}`]
      : [script];
    const result = spawnSync(command, args, { encoding: 'utf8', timeout: 120_000 });

    assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message);
  }, 30_000);
}

test('the test script runs the Vitest unit suite', () => {
  assert.equal(packageJson.scripts.test, 'vitest run --config vitest.config.ts');
});

test('the integration script runs a separate Vitest suite', () => {
  assert.equal(packageJson.scripts['test:integration'], 'vitest run --config vitest.integration.config.ts');
});
