export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_PAGES = 100;

// Every PDF file starts with the "%PDF-" signature, whatever its name says.
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d];

export interface PdfUpload {
  name: string;
  bytes: Uint8Array;
}

export type PdfUploadValidation = { valid: true } | { valid: false; reason: string };

function hasPdfSignature(bytes: Uint8Array): boolean {
  return PDF_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

export function validatePdfUpload({ bytes }: PdfUpload): PdfUploadValidation {
  if (!hasPdfSignature(bytes)) {
    return { valid: false, reason: 'El archivo no es un PDF. Solo se admiten documentos PDF.' };
  }
  if (bytes.byteLength > MAX_PDF_BYTES) {
    return { valid: false, reason: 'El archivo supera el límite de 10 MB.' };
  }
  return { valid: true };
}


export function validatePdfPageCount(pageCount: number): PdfUploadValidation {
  if (pageCount > MAX_PDF_PAGES) {
    return {
      valid: false,
      reason: `El PDF tiene ${pageCount} páginas y supera el límite de ${MAX_PDF_PAGES} páginas.`,
    };
  }
  return { valid: true };
}
