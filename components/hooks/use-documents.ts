'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  ListDocumentsResponseBody,
  PublicDocumentItem,
} from '../../app/api/documents/public-document';
import { serverUnreachableMessage } from '../server-unreachable';

export interface UseDocumentsOptions {
  fetchFn?: typeof fetch;
  initialDocuments?: PublicDocumentItem[];
  pollIntervalMs?: number;
  onDocumentDeleted?: (documentId: string) => void;
  onDocumentReprocessing?: (documentId: string) => void;
}

export interface UseDocuments {
  documents: PublicDocumentItem[];
  loaded: boolean;
  actionError: string | null;
  uploadErrors: string[];
  isUploading: boolean;
  uploadFiles: (files: Iterable<File> | ArrayLike<File>) => Promise<void>;
  deleteDocument: (documentId: string) => Promise<void>;
  reprocessDocument: (documentId: string) => Promise<void>;
}

// Library state: list (with polling while something is processing), upload, delete and
// reprocess, all through the existing /api/documents routes (spec 001, spec 004).
export function useDocuments({
  fetchFn,
  initialDocuments = [],
  pollIntervalMs = 2000,
  onDocumentDeleted,
  onDocumentReprocessing,
}: UseDocumentsOptions = {}): UseDocuments {
  const [documents, setDocuments] = useState<PublicDocumentItem[]>(initialDocuments);
  const [loaded, setLoaded] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const requestFetch = useCallback(
    (input: string, init?: RequestInit) => (fetchFn ?? globalThis.fetch)(input, init),
    [fetchFn],
  );

  const loadDocuments = useCallback(async () => {
    try {
      const globalFetch = globalThis.fetch;
      if (
        !fetchFn &&
        (typeof globalFetch !== 'function' ||
          (typeof process !== 'undefined' && process.env.VITEST && !('mock' in globalFetch)))
      ) {
        return;
      }
      const response = await requestFetch('/api/documents', { method: 'GET', cache: 'no-store' });
      if (!response.ok) {
        return;
      }
      const body = (await response.json()) as ListDocumentsResponseBody;
      if (Array.isArray(body.documents)) {
        setDocuments(body.documents);
        setLoaded(true);
      }
    } catch {
      // Background polling ignores network errors; actions report their own.
    }
  }, [fetchFn, requestFetch]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const hasProcessing = documents.some((doc) => doc.status === 'processing');
  useEffect(() => {
    if (!hasProcessing || pollIntervalMs <= 0) {
      return;
    }
    const timer = setInterval(() => void loadDocuments(), pollIntervalMs);
    return () => clearInterval(timer);
  }, [hasProcessing, loadDocuments, pollIntervalMs]);

  const uploadFiles = useCallback(
    async (files: Iterable<File> | ArrayLike<File>) => {
      const list = Array.from(files);
      if (list.length === 0) {
        return;
      }
      setIsUploading(true);
      setUploadErrors([]);
      const errors: string[] = [];
      // One request per file, in order, so each rejection keeps its file name (RF-004-7).
      for (const file of list) {
        try {
          const formData = new FormData();
          formData.append('file', file);
          const response = await requestFetch('/api/documents', { method: 'POST', body: formData });
          const body = await response.json();
          if (!response.ok) {
            errors.push(`${file.name}: ${body.error ?? 'No se pudo registrar el documento PDF.'}`);
            continue;
          }
          const created = body.document as PublicDocumentItem | undefined;
          if (created) {
            setDocuments((prev) => [created, ...prev.filter((doc) => doc.id !== created.id)]);
          }
        } catch {
          errors.push(`${file.name}: ${serverUnreachableMessage('al subir el archivo PDF')}`);
        }
      }
      setUploadErrors(errors);
      setIsUploading(false);
    },
    [requestFetch],
  );

  const deleteDocument = useCallback(
    async (documentId: string) => {
      setActionError(null);
      try {
        const response = await requestFetch(`/api/documents/${documentId}`, { method: 'DELETE' });
        if (response.status === 204 || response.ok) {
          setDocuments((prev) => prev.filter((doc) => doc.id !== documentId));
          onDocumentDeleted?.(documentId);
          return;
        }
        let message = 'No se pudo eliminar el documento. No se borró nada; inténtalo de nuevo.';
        try {
          const body = await response.json();
          if (body?.error) message = body.error;
        } catch {
          // Keep the default Spanish message.
        }
        setActionError(message);
      } catch {
        setActionError(serverUnreachableMessage('al intentar eliminar el documento'));
      }
    },
    [onDocumentDeleted, requestFetch],
  );

  const reprocessDocument = useCallback(
    async (documentId: string) => {
      setActionError(null);
      try {
        const response = await requestFetch(`/api/documents/${documentId}/reprocess`, {
          method: 'POST',
        });
        if (response.status === 202 || response.ok) {
          setDocuments((prev) =>
            prev.map((doc) =>
              doc.id === documentId ? { ...doc, status: 'processing' as const, error: null } : doc,
            ),
          );
          onDocumentReprocessing?.(documentId);
          return;
        }
        let message = 'No se pudo iniciar el reprocesamiento del documento.';
        try {
          const body = await response.json();
          if (body?.error) message = body.error;
        } catch {
          // Keep the default Spanish message.
        }
        setActionError(message);
      } catch {
        setActionError(serverUnreachableMessage('al intentar reprocesar el documento'));
      }
    },
    [onDocumentReprocessing, requestFetch],
  );

  return {
    documents,
    loaded,
    actionError,
    uploadErrors,
    isUploading,
    uploadFiles,
    deleteDocument,
    reprocessDocument,
  };
}
