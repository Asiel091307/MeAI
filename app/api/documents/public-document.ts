import type { DocumentStatus } from '../../../src/db/contracts';

// Shape and messages of the documents API shared by the route handlers and the browser.
// This module must stay free of server-only imports (pg, the database layer): client
// components import it, and anything it imports ends up in the browser bundle.

export const EMPTY_DOCUMENTS_MESSAGE =
  'Aún no hay documentos incorporados. Sube tu primer PDF para comenzar.';

export interface PublicDocumentItem {
  id: string;
  name: string;
  status: DocumentStatus;
  error: string | null;
  activeVersionId: string | null;
  createdAt: string;
}

export interface ListDocumentsResponseBody {
  documents: PublicDocumentItem[];
  message: string | null;
}
