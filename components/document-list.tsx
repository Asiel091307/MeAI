'use client';

import React from 'react';
import {
  EMPTY_DOCUMENTS_MESSAGE,
  type PublicDocumentItem,
} from '../app/api/documents/list-documents-handler';
import type { DocumentStatus } from '../src/db/contracts';

export const STATUS_LABELS: Record<DocumentStatus, string> = {
  processing: 'En procesamiento',
  available: 'Disponible',
  failed: 'Fallido',
};

export interface DocumentListProps {
  documents: readonly PublicDocumentItem[];
  emptyMessage?: string | null;
}

export function DocumentList({ documents, emptyMessage }: DocumentListProps) {
  if (documents.length === 0) {
    return (
      <section aria-label="Listado de documentos">
        <p>{emptyMessage ?? EMPTY_DOCUMENTS_MESSAGE}</p>
      </section>
    );
  }

  return (
    <section aria-label="Listado de documentos">
      <ul>
        {documents.map((doc) => (
          <li key={doc.id} data-document-id={doc.id} data-document-status={doc.status}>
            <span>{doc.name}</span>{' '}
            <span aria-label={`Estado de ${doc.name}`}>{STATUS_LABELS[doc.status]}</span>
            {doc.status === 'failed' && doc.error ? (
              <p role="note">{doc.error}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
