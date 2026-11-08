import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export class PdfDamagedError extends Error {
  constructor(message = 'El PDF está dañado y no se pudieron contar sus páginas.') {
    super(message);
    this.name = 'PdfDamagedError';
  }
}

export class PdfProtectedError extends Error {
  constructor(message = 'El PDF está protegido y no se pudieron contar sus páginas.') {
    super(message);
    this.name = 'PdfProtectedError';
  }
}

// Opens the PDF with pdf.js and reads how many pages it declares.
// Throws PdfDamagedError or PdfProtectedError if the page count cannot be determined.
export async function countPdfPages(bytes: Uint8Array): Promise<number> {
  // pdf.js may take ownership of the buffer it receives, so it gets a copy
  // and the original bytes stay available to be stored in PostgreSQL.
  const loadingTask = getDocument({ data: bytes.slice(), isEvalSupported: false });
  try {
    const pdf = await loadingTask.promise;
    return pdf.numPages;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'PasswordException') {
      throw new PdfProtectedError();
    }
    throw new PdfDamagedError();
  } finally {
    await loadingTask.destroy();
  }
}
