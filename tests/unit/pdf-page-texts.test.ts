import { expect, test } from 'vitest';
import type { OcrProvider } from '../../src/rag/providers/ocr';
import {
  PdfDamagedError,
  PdfProtectedError,
} from '../../src/rag/ingestion/pdf-page-count';
import { extractPdfPageTexts } from '../../src/rag/ingestion/pdf-page-texts';
import {
  createDamagedPdf,
  createMixedPdf,
  createProtectedPdf,
  createTextPdf,
} from '../helpers/pdf-fixtures';

function createRecordingOcr(reply: string) {
  const calls: Array<{ imageBytes: number; languages: readonly string[] }> = [];
  const ocr: OcrProvider = {
    async recognize(image, languages) {
      calls.push({ imageBytes: image.byteLength, languages });
      return reply;
    },
  };
  return { ocr, calls };
}

test('extractPdfPageTexts returns text for all pages of a mixed PDF in order', async () => {
  const pdf = createMixedPdf([
    { kind: 'digital', text: 'Digital one' },
    { kind: 'scanned', text: 'Scanned two' },
    { kind: 'digital', text: 'Digital three' },
  ]);
  const { ocr } = createRecordingOcr('Texto OCR');

  const pages = await extractPdfPageTexts(pdf, { ocr });

  expect(pages).toEqual([
    { page: 1, text: 'Digital one' },
    { page: 2, text: 'Texto OCR' },
    { page: 3, text: 'Digital three' },
  ]);
});

test('extractPdfPageTexts runs OCR only on pages without digital text', async () => {
  const pdf = createMixedPdf([
    { kind: 'scanned', text: 'First' },
    { kind: 'digital', text: 'Digital two' },
    { kind: 'scanned', text: 'Third' },
  ]);
  const { ocr, calls } = createRecordingOcr('ocr');

  const pages = await extractPdfPageTexts(pdf, { ocr, languages: ['en'] });

  expect(calls).toHaveLength(2);
  expect(calls.every((call) => call.languages[0] === 'en' && call.imageBytes > 0)).toBe(true);
  expect(pages.map((page) => page.text)).toEqual(['ocr', 'Digital two', 'ocr']);
});

test('extractPdfPageTexts never calls OCR for a fully digital PDF', async () => {
  const { ocr, calls } = createRecordingOcr('should not be used');

  const pages = await extractPdfPageTexts(createTextPdf(['Uno', 'Dos']), { ocr });

  expect(calls).toHaveLength(0);
  expect(pages).toEqual([
    { page: 1, text: 'Uno' },
    { page: 2, text: 'Dos' },
  ]);
});

test('extractPdfPageTexts uses Spanish and English by default', async () => {
  const pdf = createMixedPdf([{ kind: 'scanned', text: 'Prueba' }]);
  const languagesSeen: Array<readonly string[]> = [];
  const ocr: OcrProvider = {
    async recognize(_image, languages) {
      languagesSeen.push(languages);
      return 'ok';
    },
  };

  await extractPdfPageTexts(pdf, { ocr });
  expect(languagesSeen).toEqual([['es', 'en']]);
});

test('extractPdfPageTexts fails with PdfDamagedError for a damaged PDF', async () => {
  await expect(extractPdfPageTexts(createDamagedPdf())).rejects.toThrow(PdfDamagedError);
});

test('extractPdfPageTexts fails with PdfProtectedError for a protected PDF', async () => {
  await expect(extractPdfPageTexts(createProtectedPdf())).rejects.toThrow(PdfProtectedError);
});
