import { expect, test } from 'vitest';
import type { OcrProvider } from '../../src/rag/providers/ocr';
import {
  PdfDamagedError,
  PdfProtectedError,
} from '../../src/rag/ingestion/pdf-page-count';
import { recognizeScannedPdf } from '../../src/rag/ingestion/pdf-ocr-recognition';
import { TESSERACT_CACHE_DIR } from '../../src/rag/providers/tesseract-ocr';
import {
  createDamagedPdf,
  createProtectedPdf,
  createScannedPdf,
} from '../helpers/pdf-fixtures';

// Real OCR runs in tests/integration/scanned-pdf-ocr.test.mjs; here OCR is a controlled fake.

test('recognizeScannedPdf sends one rendered image per page and keeps page numbers', async () => {
  const pdf = createScannedPdf(['Pagina 1', 'Pagina 2']);
  const calls: Array<{ imageBytes: number; languages: readonly string[] }> = [];

  const mockOcr: OcrProvider = {
    async recognize(image, languages) {
      calls.push({ imageBytes: image.byteLength, languages });
      return `Reconocido ${calls.length}`;
    },
  };

  const pages = await recognizeScannedPdf(pdf, { ocr: mockOcr, languages: ['es'] });

  expect(pages).toEqual([
    { page: 1, text: 'Reconocido 1' },
    { page: 2, text: 'Reconocido 2' },
  ]);
  expect(calls).toHaveLength(2);
  expect(calls[0].imageBytes).toBeGreaterThan(0);
  expect(calls[0].languages).toEqual(['es']);
  expect(calls[1].imageBytes).toBeGreaterThan(0);
  expect(calls[1].languages).toEqual(['es']);
});

test('recognizeScannedPdf uses Spanish and English by default', async () => {
  const pdf = createScannedPdf(['Prueba']);
  const languagesSeen: Array<readonly string[]> = [];
  const mockOcr: OcrProvider = {
    async recognize(_image, languages) {
      languagesSeen.push(languages);
      return 'ok';
    },
  };

  await recognizeScannedPdf(pdf, { ocr: mockOcr });
  expect(languagesSeen).toEqual([['es', 'en']]);
});

test('leaves original PDF bytes unmodified after OCR recognition', async () => {
  const bytes = createScannedPdf(['Prueba']);
  const copy = bytes.slice();

  const mockOcr: OcrProvider = {
    async recognize() {
      return 'ok';
    },
  };

  await recognizeScannedPdf(bytes, { ocr: mockOcr });
  expect(bytes).toEqual(copy);
});

test('fails with PdfDamagedError when reading a damaged PDF', async () => {
  await expect(recognizeScannedPdf(createDamagedPdf())).rejects.toThrow(PdfDamagedError);
});

test('fails with PdfProtectedError when reading a protected PDF', async () => {
  await expect(recognizeScannedPdf(createProtectedPdf())).rejects.toThrow(PdfProtectedError);
});

test('Tesseract language data is cached in .cache/tesseract, not in the project root', () => {
  expect(TESSERACT_CACHE_DIR.replaceAll('\\', '/')).toMatch(/\/\.cache\/tesseract$/);
});
