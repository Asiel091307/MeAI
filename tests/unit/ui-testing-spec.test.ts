import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';

const specUrl = new URL('../../docs/specs/003-ui-testing/spec.md', import.meta.url);

test('spec 003 includes a technical comparison and approved decision for UI testing', async () => {
  const content = await readFile(specUrl, 'utf8');

  expect(content).toContain('@testing-library/react');
  expect(content).toContain('happy-dom');
  expect(content).toContain('Aprobada por el usuario el 2026-11-10');
  expect(content).toContain('devDependencies');
});

