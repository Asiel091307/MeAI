import type { ExtractedPageText } from './pdf-text-extraction';

export type ReadablePagesResult = { readable: true } | { readable: false; reason: string };

// A page is readable only if it has at least one letter or digit.
// Pages that are only symbols are what OCR returns for illegible handwriting.
function hasReadableText(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

function joinPageNumbers(pageNumbers: readonly number[]): string {
  if (pageNumbers.length === 1) {
    return String(pageNumbers[0]);
  }
  return `${pageNumbers.slice(0, -1).join(', ')} y ${pageNumbers[pageNumbers.length - 1]}`;
}

// Publication rule: if any page is empty or illegible, the whole document is rejected.
export function ensureReadablePages(pages: readonly ExtractedPageText[]): ReadablePagesResult {
  if (pages.length === 0) {
    return { readable: false, reason: 'El PDF no tiene páginas.' };
  }

  const unreadable = pages.filter(({ text }) => !hasReadableText(text)).map(({ page }) => page);
  if (unreadable.length === 0) {
    return { readable: true };
  }

  const label = unreadable.length === 1 ? 'la página' : 'las páginas';
  return {
    readable: false,
    reason: `No se pudo leer texto en ${label} ${joinPageNumbers(unreadable)}.`,
  };
}
