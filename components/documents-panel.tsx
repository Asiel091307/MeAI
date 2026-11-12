'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  EMPTY_DOCUMENTS_MESSAGE,
  type ListDocumentsResponseBody,
  type PublicDocumentItem,
} from '../app/api/documents/public-document';
import { DocumentList } from './document-list';
import { PdfUploader } from './pdf-uploader';
import { serverUnreachableMessage } from './server-unreachable';

export interface DocumentsPanelProps {
  fetchFn?: typeof fetch;
  initialDocuments?: PublicDocumentItem[];
  pollIntervalMs?: number;
  onDocumentsChange?: (documents: PublicDocumentItem[]) => void;
  onDocumentDeleted?: (documentId: string) => void;
  onDocumentReprocessing?: (documentId: string) => void;
}

export function DocumentsPanel({
  fetchFn,
  initialDocuments = [],
  pollIntervalMs = 2000,
  onDocumentsChange,
  onDocumentDeleted,
  onDocumentReprocessing,
}: DocumentsPanelProps) {
  const [documents, setDocuments] = useState<PublicDocumentItem[]>(initialDocuments);
  const [emptyMessage, setEmptyMessage] = useState<string | null>(EMPTY_DOCUMENTS_MESSAGE);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    try {
      const requestFetch = fetchFn ?? globalThis.fetch;
      if (
        typeof requestFetch !== 'function' ||
        (!fetchFn && typeof process !== 'undefined' && process.env.VITEST && !('mock' in requestFetch))
      ) {
        return;
      }

      const response = await requestFetch('/api/documents', {
        method: 'GET',
        cache: 'no-store',
      });

      if (!response.ok) {
        return;
      }

      const body = (await response.json()) as ListDocumentsResponseBody;
      if (Array.isArray(body.documents)) {
        setDocuments(body.documents);
        setEmptyMessage(body.message ?? EMPTY_DOCUMENTS_MESSAGE);
        onDocumentsChange?.(body.documents);
      }
    } catch {
      // Ignore network errors during background polling or unmocked test renders
    }
  }, [fetchFn, onDocumentsChange]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const hasProcessingDocuments = documents.some((doc) => doc.status === 'processing');

  useEffect(() => {
    if (!hasProcessingDocuments || pollIntervalMs <= 0) {
      return;
    }

    const timer = setInterval(() => {
      void loadDocuments();
    }, pollIntervalMs);

    return () => {
      clearInterval(timer);
    };
  }, [hasProcessingDocuments, loadDocuments, pollIntervalMs]);

  const handleDocumentRegistered = (newDoc: PublicDocumentItem) => {
    setActionError(null);
    setDocuments((prev) => {
      const exists = prev.some((d) => d.id === newDoc.id);
      const updated = exists
        ? prev.map((d) => (d.id === newDoc.id ? newDoc : d))
        : [newDoc, ...prev];
      onDocumentsChange?.(updated);
      return updated;
    });
  };

  const handleDeleteDocument = async (documentId: string) => {
    setActionError(null);
    try {
      const requestFetch = fetchFn ?? globalThis.fetch;
      const response = await requestFetch(`/api/documents/${documentId}`, {
        method: 'DELETE',
      });

      if (response.status === 204 || response.ok) {
        setDocuments((prev) => {
          const updated = prev.filter((doc) => doc.id !== documentId);
          onDocumentsChange?.(updated);
          return updated;
        });
        onDocumentDeleted?.(documentId);
        return;
      }

      let message = 'No se pudo eliminar el documento. No se borró nada; inténtalo de nuevo.';
      try {
        const body = await response.json();
        if (body?.error) {
          message = body.error;
        }
      } catch {
        // Keep default Spanish error message
      }
      setActionError(message);
    } catch {
      setActionError(serverUnreachableMessage('al intentar eliminar el documento'));
    }
  };

  const handleReprocessDocument = async (documentId: string) => {
    setActionError(null);
    try {
      const requestFetch = fetchFn ?? globalThis.fetch;
      const response = await requestFetch(`/api/documents/${documentId}/reprocess`, {
        method: 'POST',
      });

      if (response.status === 202 || response.ok) {
        setDocuments((prev) => {
          const updated = prev.map((doc) =>
            doc.id === documentId
              ? { ...doc, status: 'processing' as const, error: null }
              : doc,
          );
          onDocumentsChange?.(updated);
          return updated;
        });
        onDocumentReprocessing?.(documentId);
        return;
      }

      let message = 'No se pudo iniciar el reprocesamiento del documento.';
      try {
        const body = await response.json();
        if (body?.error) {
          message = body.error;
        }
      } catch {
        // Keep default Spanish error message
      }
      setActionError(message);
    } catch {
      setActionError(serverUnreachableMessage('al intentar reprocesar el documento'));
    }
  };

  return (
    <div>
      <PdfUploader fetchFn={fetchFn} onDocumentRegistered={handleDocumentRegistered} />
      {actionError ? <p role="alert">{actionError}</p> : null}
      <DocumentList
        documents={documents}
        emptyMessage={emptyMessage}
        onDeleteDocument={handleDeleteDocument}
        onReprocessDocument={handleReprocessDocument}
      />
    </div>
  );
}
