import { expect, test } from 'vitest';
import { createScannedPdf } from '../helpers/pdf-fixtures';
import { renderPdfPageToImage } from '../../src/rag/ingestion/pdf-page-renderer';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

test('a scanned PDF page renders to a PNG image', async () => {
  const pdf = createScannedPdf(['Prueba 1', 'Prueba 2']);

  for (const pageNumber of [1, 2]) {
    const image = await renderPdfPageToImage(pdf, pageNumber);
    expect(Array.from(image.slice(0, 8))).toEqual(PNG_SIGNATURE);
  }
});
