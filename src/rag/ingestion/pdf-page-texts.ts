import type { OcrLanguage, OcrProvider } from '../providers/ocr';
import { TesseractOcrProvider } from '../providers/tesseract-ocr';
import { renderPdfPageToImage } from './pdf-page-renderer';
import { extractPdfText, type ExtractedPageText } from './pdf-text-extraction';

export interface ExtractPdfPageTextsOptions {
  ocr?: OcrProvider;
  languages?: readonly OcrLanguage[];
}

// Reads the text of every page: digital extraction first, OCR only for pages with no digital text.
// Returns pages in order. Throws PdfDamagedError or PdfProtectedError if the PDF is unreadable.
export async function extractPdfPageTexts(
  bytes: Uint8Array,
  options: ExtractPdfPageTextsOptions = {},
): Promise<ExtractedPageText[]> {
  const digitalPages = await extractPdfText(bytes);
  const pagesNeedingOcr = digitalPages.filter(({ text }) => text.trim().length === 0);
  if (pagesNeedingOcr.length === 0) {
    return digitalPages;
  }

  const ocr = options.ocr ?? new TesseractOcrProvider();
  const languages = options.languages ?? ['es', 'en'];

  const pages: ExtractedPageText[] = [];
  for (const digitalPage of digitalPages) {
    if (digitalPage.text.trim().length > 0) {
      pages.push(digitalPage);
      continue;
    }
    const image = await renderPdfPageToImage(bytes, digitalPage.page);
    const text = await ocr.recognize(image, languages);
    pages.push({ page: digitalPage.page, text });
  }

  return pages;
}
