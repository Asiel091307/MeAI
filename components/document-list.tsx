'use client';

import React, { useState } from 'react';
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
  onDeleteDocument?: (documentId: string) => Promise<void> | void;
  onReprocessDocument?: (documentId: string) => Promise<void> | void;
}

export function DocumentList({
  documents,
  emptyMessage,
  onDeleteDocument,
  onReprocessDocument,
}: DocumentListProps) {
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [busyDocId, setBusyDocId] = useState<string | null>(null);

  if (documents.length === 0) {
    return (
      <section aria-label="Listado de documentos">
        <p>{emptyMessage ?? EMPTY_DOCUMENTS_MESSAGE}</p>
      </section>
    );
  }

  const handleConfirmDelete = async (docId: string) => {
    setBusyDocId(docId);
    try {
      await onDeleteDocument?.(docId);
    } finally {
      setBusyDocId(null);
      setConfirmingDeleteId(null);
    }
  };

  const handleReprocess = async (docId: string) => {
    setBusyDocId(docId);
    try {
      await onReprocessDocument?.(docId);
    } finally {
      setBusyDocId(null);
    }
  };

  return (
    <section aria-label="Listado de documentos">
      <ul>
        {documents.map((doc) => {
          const canReprocess = doc.status === 'available' || doc.status === 'failed';
          const isConfirming = confirmingDeleteId === doc.id;
          const isBusy = busyDocId === doc.id;

          return (
            <li key={doc.id} data-document-id={doc.id} data-document-status={doc.status}>
              <span>{doc.name}</span>{' '}
              <span aria-label={`Estado de ${doc.name}`}>{STATUS_LABELS[doc.status]}</span>
              {doc.status === 'failed' && doc.error ? (
                <p role="note">{doc.error}</p>
              ) : null}

              <div>
                {canReprocess ? (
                  <button
                    type="button"
                    aria-label={`Reprocesar ${doc.name}`}
                    disabled={isBusy}
                    onClick={() => void handleReprocess(doc.id)}
                  >
                    Reprocesar
                  </button>
                ) : null}

                {!isConfirming ? (
                  <button
                    type="button"
                    aria-label={`Eliminar ${doc.name}`}
                    disabled={isBusy}
                    onClick={() => setConfirmingDeleteId(doc.id)}
                  >
                    Eliminar
                  </button>
                ) : (
                  <div role="group" aria-label={`Confirmar eliminación de ${doc.name}`}>
                    <span>{`¿Confirmas que deseas eliminar ${doc.name}?`}</span>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleConfirmDelete(doc.id)}
                    >
                      Confirmar eliminación
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => setConfirmingDeleteId(null)}
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
