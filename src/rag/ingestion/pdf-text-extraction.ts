import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  PdfDamagedError,
  PdfProtectedError,
} from './pdf-page-count';

export interface ExtractedPageText {
  page: number;
  text: string;
}

function assembleTextContent(items: unknown[]): string {
  let text = '';
  for (const item of items) {
    if (item && typeof item === 'object' && 'str' in item && typeof item.str === 'string') {
      text += item.str;
      if ('hasEOL' in item && item.hasEOL) {
        text += '\n';
      } else if (item.str.length > 0 && !item.str.endsWith(' ')) {
        text += ' ';
      }
    }
  }

  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

// Extracts text from each page of a digital PDF, preserving page numbers (1-indexed).
// Throws PdfDamagedError or PdfProtectedError if the PDF cannot be opened.
export async function extractPdfText(bytes: Uint8Array): Promise<ExtractedPageText[]> {
  const loadingTask = getDocument({ data: bytes.slice(), isEvalSupported: false });
  try {
    const pdf = await loadingTask.promise;
    const pages: ExtractedPageText[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        pages.push({
          page: pageNumber,
          text: assembleTextContent(content.items),
        });
      } finally {
        page.cleanup();
      }
    }

    return pages;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'PasswordException') {
      throw new PdfProtectedError();
    }
    if (error instanceof PdfDamagedError || error instanceof PdfProtectedError) {
      throw error;
    }
    throw new PdfDamagedError();
  } finally {
    await loadingTask.destroy();
  }
}
