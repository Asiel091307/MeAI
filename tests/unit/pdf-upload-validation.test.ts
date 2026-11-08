import { expect, test } from 'vitest';
import {
  MAX_PDF_BYTES,
  MAX_PDF_PAGES,
  validatePdfPageCount,
  validatePdfUpload,
} from '../../src/rag/ingestion/pdf-upload-validation';

const pdfHeader = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d]); // "%PDF-"

function pdfOfSize(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set(pdfHeader);
  return bytes;
}

test('the PDF size limit is 10 MB', () => {
  expect(MAX_PDF_BYTES).toBe(10 * 1024 * 1024);
});

test('a PDF of up to 10 MB is accepted', () => {
  expect(validatePdfUpload({ name: 'notas.pdf', bytes: pdfOfSize(1024) })).toEqual({ valid: true });
  expect(validatePdfUpload({ name: 'notas.pdf', bytes: pdfOfSize(MAX_PDF_BYTES) })).toEqual({
    valid: true,
  });
});

test('a file larger than 10 MB is rejected with a reason in Spanish', () => {
  expect(validatePdfUpload({ name: 'grande.pdf', bytes: pdfOfSize(MAX_PDF_BYTES + 1) })).toEqual({
    valid: false,
    reason: 'El archivo supera el límite de 10 MB.',
  });
});

test('a file that is not a PDF is rejected with a reason in Spanish', () => {
  const notPdf = 'El archivo no es un PDF. Solo se admiten documentos PDF.';
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
  expect(validatePdfUpload({ name: 'foto.png', bytes: png })).toEqual({ valid: false, reason: notPdf });
  // The content decides, not the file name.
  expect(validatePdfUpload({ name: 'falso.pdf', bytes: png })).toEqual({ valid: false, reason: notPdf });
  expect(validatePdfUpload({ name: 'vacio.pdf', bytes: new Uint8Array() })).toEqual({
    valid: false,
    reason: notPdf,
  });
});

test('the PDF page limit is 100 pages', () => {
  expect(MAX_PDF_PAGES).toBe(100);
});

test('a PDF of up to 100 pages is accepted', () => {
  expect(validatePdfPageCount(1)).toEqual({ valid: true });
  expect(validatePdfPageCount(100)).toEqual({ valid: true });
});

test('a PDF of more than 100 pages is rejected with the exceeded limit in Spanish', () => {
  expect(validatePdfPageCount(101)).toEqual({
    valid: false,
    reason: 'El PDF tiene 101 páginas y supera el límite de 100 páginas.',
  });
});
