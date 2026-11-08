import { expect, test } from 'vitest';
import type { OcrProvider } from '../../src/rag/providers/ocr';
import { ensureReadablePages } from '../../src/rag/ingestion/readable-pages';
import { extractPdfPageTexts } from '../../src/rag/ingestion/pdf-page-texts';
import { createBlankPdf, createMixedPdf, createTextPdf } from '../helpers/pdf-fixtures';

function fakeOcr(reply: string): OcrProvider {
  return {
    async recognize() {
      return reply;
    },
  };
}

test('a PDF with zero pages is not readable', () => {
  expect(ensureReadablePages([])).toEqual({ readable: false, reason: 'El PDF no tiene páginas.' });
});

test('blank pages are not readable and are named in the reason', async () => {
  const pages = await extractPdfPageTexts(createBlankPdf(2), { ocr: fakeOcr('') });

  expect(ensureReadablePages(pages)).toEqual({
    readable: false,
    reason: 'No se pudo leer texto en las páginas 1 y 2.',
  });
});

test('a handwriting-like page that OCR returns as noise is not readable', async () => {
  const pdf = createMixedPdf([
    { kind: 'digital', text: 'Texto claro' },
    { kind: 'scanned', text: 'garabato' },
  ]);

  const pages = await extractPdfPageTexts(pdf, { ocr: fakeOcr('~ ^ ,,') });

  expect(ensureReadablePages(pages)).toEqual({
    readable: false,
    reason: 'No se pudo leer texto en la página 2.',
  });
});

test('a partially illegible PDF is rejected and names only the bad page', () => {
  const result = ensureReadablePages([
    { page: 1, text: 'Contenido válido' },
    { page: 2, text: '   \n ' },
    { page: 3, text: 'Más contenido' },
  ]);

  expect(result).toEqual({
    readable: false,
    reason: 'No se pudo leer texto en la página 2.',
  });
});

test('lists three or more affected pages with commas and "y"', () => {
  const result = ensureReadablePages([
    { page: 1, text: '' },
    { page: 2, text: '...' },
    { page: 3, text: '' },
  ]);

  expect(result).toEqual({
    readable: false,
    reason: 'No se pudo leer texto en las páginas 1, 2 y 3.',
  });
});

test('accented letters and digits count as readable text', () => {
  expect(ensureReadablePages([{ page: 1, text: 'ñandú' }, { page: 2, text: '2024' }])).toEqual({
    readable: true,
  });
});

test('a fully digital PDF is readable', async () => {
  const pages = await extractPdfPageTexts(createTextPdf(['Uno', 'Dos']), { ocr: fakeOcr('') });
  expect(ensureReadablePages(pages)).toEqual({ readable: true });
});
