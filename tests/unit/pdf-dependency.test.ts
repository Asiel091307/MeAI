import { expect, test } from 'vitest';
import packageJson from '../../package.json';

test('the approved PDF dependency is pinned to pdfjs-dist 5.6.205', () => {
  const dependencies: Record<string, string> = packageJson.dependencies;
  expect(dependencies['pdfjs-dist']).toBe('5.6.205');
});

test('pdfjs-dist loads in Node and exposes the PDF reader', async () => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  expect(pdfjs.version).toBe('5.6.205');
  expect(typeof pdfjs.getDocument).toBe('function');
});
