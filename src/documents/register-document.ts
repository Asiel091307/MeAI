import type { Document, DocumentRepository } from '../db/contracts';
import {
  countPdfPages,
  PdfDamagedError,
  PdfProtectedError,
} from '../rag/ingestion/pdf-page-count';
import {
  type PdfUpload,
  validatePdfPageCount,
  validatePdfUpload,
} from '../rag/ingestion/pdf-upload-validation';

export type RegisterDocumentResult =
  | { registered: true; document: Document }
  | { registered: false; reason: string };

export async function registerDocument(
  documents: Pick<DocumentRepository, 'create'>,
  upload: PdfUpload,
): Promise<RegisterDocumentResult> {
  const validation = validatePdfUpload(upload);
  if (!validation.valid) {
    return { registered: false, reason: validation.reason };
  }

  let pageCount: number;
  try {
    pageCount = await countPdfPages(upload.bytes);
  } catch (error) {
    const reason =
      error instanceof PdfProtectedError || error instanceof PdfDamagedError
        ? error.message
        : 'El PDF está dañado y no se pudieron contar sus páginas.';
    const document = await documents.create({
      name: upload.name,
      pdfBytes: upload.bytes,
      status: 'failed',
      error: reason,
    });
    return { registered: true, document };
  }

  const pageValidation = validatePdfPageCount(pageCount);
  if (!pageValidation.valid) {
    return { registered: false, reason: pageValidation.reason };
  }

  const document = await documents.create({ name: upload.name, pdfBytes: upload.bytes });
  return { registered: true, document };
}
