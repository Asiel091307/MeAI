import { expect, test } from 'vitest';
import { extractPdfPageTexts } from '../../src/rag/ingestion/pdf-page-texts';
import { ensureReadablePages } from '../../src/rag/ingestion/readable-pages';
import { createMixedPdf } from '../helpers/pdf-fixtures';

// Real Tesseract OCR on a PDF that mixes digital Spanish pages with a scanned English page.
test('digital pages keep their text and scanned pages are recognized, all in page order', async () => {
  const pdf = createMixedPdf([
    { kind: 'digital', text: 'La solicitud se presenta en septiembre' },
    { kind: 'scanned', text: 'The invoice is due in October' },
    { kind: 'digital', text: 'Fin del documento' },
  ]);

  const pages = await extractPdfPageTexts(pdf, { languages: ['es', 'en'] });

  expect(pages.map(({ page }) => page)).toEqual([1, 2, 3]);
  expect(pages[0].text).toBe('La solicitud se presenta en septiembre');
  const scanned = pages[1].text.toLowerCase();
  expect(scanned).toContain('invoice');
  expect(scanned).toContain('october');
  expect(pages[2].text).toBe('Fin del documento');
  expect(ensureReadablePages(pages)).toEqual({ readable: true });
}, 180_000);
