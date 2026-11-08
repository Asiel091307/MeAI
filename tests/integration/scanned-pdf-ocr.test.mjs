import { expect, test } from 'vitest';
import { extractPdfText } from '../../src/rag/ingestion/pdf-text-extraction';
import { recognizeScannedPdf } from '../../src/rag/ingestion/pdf-ocr-recognition';
import { createScannedPdf } from '../helpers/pdf-fixtures';

// Real Tesseract OCR. The first run downloads the Spanish and English language data
// into .cache/tesseract; later runs reuse that local copy.
test('OCR recognizes a scanned Spanish page and a scanned English page, keeping each page number', async () => {
  const pdf = createScannedPdf([
    'La solicitud se presenta en septiembre',
    'The invoice is due in October',
  ]);

  // A scanned PDF has no digital text: only images.
  expect(await extractPdfText(pdf)).toEqual([
    { page: 1, text: '' },
    { page: 2, text: '' },
  ]);

  const pages = await recognizeScannedPdf(pdf, { languages: ['es', 'en'] });

  expect(pages.map(({ page }) => page)).toEqual([1, 2]);
  const spanish = pages[0].text.toLowerCase();
  const english = pages[1].text.toLowerCase();
  expect(spanish).toContain('solicitud');
  expect(spanish).toContain('septiembre');
  expect(english).toContain('invoice');
  expect(english).toContain('october');
  // Each text stays on its own page.
  expect(spanish).not.toContain('invoice');
  expect(english).not.toContain('solicitud');
}, 180_000);
