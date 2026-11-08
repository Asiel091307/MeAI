import { expect, test } from 'vitest';
import {
  countPdfPages,
  PdfDamagedError,
  PdfProtectedError,
} from '../../src/rag/ingestion/pdf-page-count';
import {
  createBlankPdf,
  createDamagedPdf,
  createProtectedPdf,
} from '../helpers/pdf-fixtures';

test('the pages of a PDF are counted by reading the document', async () => {
  expect(await countPdfPages(createBlankPdf(1))).toBe(1);
  expect(await countPdfPages(createBlankPdf(100))).toBe(100);
  expect(await countPdfPages(createBlankPdf(101))).toBe(101);
});

test('counting pages leaves the original bytes intact for storage', async () => {
  const bytes = createBlankPdf(2);
  const copy = bytes.slice();

  await countPdfPages(bytes);

  expect(bytes.byteLength).toBe(copy.byteLength);
  expect(bytes).toEqual(copy);
});


test('counting pages of a damaged PDF fails with PdfDamagedError', async () => {
  const error = await countPdfPages(createDamagedPdf()).catch((e) => e);
  expect(error).toBeInstanceOf(PdfDamagedError);
  expect(error.message).toBe('El PDF está dañado y no se pudieron contar sus páginas.');
});

test('counting pages of a protected PDF fails with PdfProtectedError', async () => {
  const error = await countPdfPages(createProtectedPdf()).catch((e) => e);
  expect(error).toBeInstanceOf(PdfProtectedError);
  expect(error.message).toBe('El PDF está protegido y no se pudieron contar sus páginas.');
});
