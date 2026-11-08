import { expect, test } from 'vitest';
import packageJson from '../../package.json';

test('the approved OCR dependency is pinned to tesseract.js 7.0.0', () => {
  const dependencies: Record<string, string> = packageJson.dependencies;
  expect(dependencies['tesseract.js']).toBe('7.0.0');
});

test('the approved page rendering dependency is pinned to @napi-rs/canvas 1.1.0', () => {
  const dependencies: Record<string, string> = packageJson.dependencies;
  expect(dependencies['@napi-rs/canvas']).toBe('1.1.0');
});

test('@napi-rs/canvas loads in Node and exposes createCanvas', async () => {
  const canvasModule = await import('@napi-rs/canvas');
  expect(typeof canvasModule.createCanvas).toBe('function');
});

test('tesseract.js loads in Node and exposes createWorker', async () => {
  const tesseract = await import('tesseract.js');
  expect(typeof tesseract.createWorker).toBe('function');
});

