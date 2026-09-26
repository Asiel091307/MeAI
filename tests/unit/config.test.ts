import { expect, test } from 'vitest';
import packageJson from '../../package.json';

test('the project uses pnpm and starts a Next.js application', () => {
  expect(packageJson.packageManager).toMatch(/^pnpm@/);
  expect(packageJson.scripts.dev).toBe('next dev');
});
