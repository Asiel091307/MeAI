import type { OcrLanguage, OcrProvider } from '../providers/ocr';
import type { ExtractedPageText } from './pdf-text-extraction';
import { countPdfPages } from './pdf-page-count';
import { renderPdfPageToImage } from './pdf-page-renderer';
import { TesseractOcrProvider } from '../providers/tesseract-ocr';

export interface RecognizeScannedPdfOptions {
  ocr?: OcrProvider;
  languages?: readonly OcrLanguage[];
}

// Recognizes text from scanned PDF pages using OCR, preserving the original page numbers.
// Throws PdfDamagedError or PdfProtectedError if the PDF is unreadable.
export async function recognizeScannedPdf(
  bytes: Uint8Array,
  options: RecognizeScannedPdfOptions = {},
): Promise<ExtractedPageText[]> {
  const pageCount = await countPdfPages(bytes);
  const ocr = options.ocr ?? new TesseractOcrProvider();
  const languages = options.languages ?? ['es', 'en'];

  const pages: ExtractedPageText[] = [];

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const image = await renderPdfPageToImage(bytes, pageNumber);
    const text = await ocr.recognize(image, languages);
    pages.push({
      page: pageNumber,
      text,
    });
  }

  return pages;
}

