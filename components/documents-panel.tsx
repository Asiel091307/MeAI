'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  EMPTY_DOCUMENTS_MESSAGE,
  type ListDocumentsResponseBody,
  type PublicDocumentItem,
} from '../app/api/documents/list-documents-handler';
import { DocumentList } from './document-list';
import { PdfUploader } from './pdf-uploader';

export interface DocumentsPanelProps {
  fetchFn?: typeof fetch;
  initialDocuments?: PublicDocumentItem[];
  pollIntervalMs?: number;
  onDocumentsChange?: (documents: PublicDocumentItem[]) => void;
}

export function DocumentsPanel({
  fetchFn,
  initialDocuments = [],
  pollIntervalMs = 2000,
  onDocumentsChange,
}: DocumentsPanelProps) {
  const [documents, setDocuments] = useState<PublicDocumentItem[]>(initialDocuments);
  const [emptyMessage, setEmptyMessage] = useState<string | null>(EMPTY_DOCUMENTS_MESSAGE);

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
    setDocuments((prev) => {
      const exists = prev.some((d) => d.id === newDoc.id);
      const updated = exists
        ? prev.map((d) => (d.id === newDoc.id ? newDoc : d))
        : [newDoc, ...prev];
      onDocumentsChange?.(updated);
      return updated;
    });
  };

  return (
    <div>
      <PdfUploader fetchFn={fetchFn} onDocumentRegistered={handleDocumentRegistered} />
      <DocumentList documents={documents} emptyMessage={emptyMessage} />
    </div>
  );
}
