import type { ExtractedPageText } from './pdf-text-extraction';

export interface ChunkOptions {
  // Characters per chunk. Passed explicitly; no default here.
  chunkSize: number;
  // Characters shared by consecutive chunks of the same page, so a sentence cut at a border is not lost.
  overlap: number;
}

export interface ChunkDraft {
  documentId: string;
  page: number;
  position: number;
  text: string;
}

function validateChunkOptions({ chunkSize, overlap }: ChunkOptions): void {
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new Error('chunkSize must be an integer greater than 0.');
  }
  if (!Number.isInteger(overlap) || overlap < 0) {
    throw new Error('overlap must be an integer greater than or equal to 0.');
  }
  if (overlap >= chunkSize) {
    throw new Error('overlap must be less than chunkSize.');
  }
}

// Splits each non-blank page into chunks. A chunk never crosses a page boundary,
// so every chunk keeps the document id, page number and position of its origin.
export function chunkPages(
  documentId: string,
  pages: readonly ExtractedPageText[],
  options: ChunkOptions,
): ChunkDraft[] {
  validateChunkOptions(options);

  const step = options.chunkSize - options.overlap;
  const chunks: ChunkDraft[] = [];

  for (const { page, text } of pages) {
    let position = 0;
    for (let start = 0; start < text.length; start += step) {
      const end = start + options.chunkSize;
      const chunkText = text.slice(start, end).trim();
      if (chunkText !== '') {
        position += 1;
        chunks.push({ documentId, page, position, text: chunkText });
      }
      if (end >= text.length) {
        break;
      }
    }
  }

  return chunks;
}
