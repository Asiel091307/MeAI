// Contract of the "get the original file of a document" use case (spec 004, RF-004-5).
// Shared by lane A (getDocumentFile) and lane B (GET /api/documents/:id/file).
export type DocumentFileResult =
  | { status: 'found'; name: string; bytes: Uint8Array }
  | { status: 'not_found' };

export type GetDocumentFile = (documentId: string) => Promise<DocumentFileResult>;
