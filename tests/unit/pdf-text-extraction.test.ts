import { expect, test } from 'vitest';
import {
  PdfDamagedError,
  PdfProtectedError,
} from '../../src/rag/ingestion/pdf-page-count';
import { extractPdfText } from '../../src/rag/ingestion/pdf-text-extraction';
import {
  createBlankPdf,
  createDamagedPdf,
  createProtectedPdf,
  createTextPdf,
} from '../helpers/pdf-fixtures';

test('extracts text from a two-page digital PDF preserving page numbers', async () => {
  const pdf = createTextPdf(['Primera pagina de notas', 'Segunda pagina con mas detalles']);
  const pages = await extractPdfText(pdf);

  expect(pages).toEqual([
    { page: 1, text: 'Primera pagina de notas' },
    { page: 2, text: 'Segunda pagina con mas detalles' },
  ]);
});

test('extracts multiple lines of text within a single page', async () => {
  const pdf = createTextPdf(['Linea superior\nLinea inferior']);
  const pages = await extractPdfText(pdf);

  expect(pages).toEqual([
    { page: 1, text: 'Linea superior\nLinea inferior' },
  ]);
});

test('returns an empty string for a blank page without text', async () => {
  const pdf = createBlankPdf(1);
  const pages = await extractPdfText(pdf);

  expect(pages).toEqual([{ page: 1, text: '' }]);
});

test('leaves original PDF bytes unmodified after extraction', async () => {
  const bytes = createTextPdf(['Texto de prueba']);
  const copy = bytes.slice();

  await extractPdfText(bytes);

  expect(bytes).toEqual(copy);
});

test('fails with PdfDamagedError when reading a damaged PDF', async () => {
  await expect(extractPdfText(createDamagedPdf())).rejects.toThrow(PdfDamagedError);
});

test('fails with PdfProtectedError when reading a protected PDF', async () => {
  await expect(extractPdfText(createProtectedPdf())).rejects.toThrow(PdfProtectedError);
});
