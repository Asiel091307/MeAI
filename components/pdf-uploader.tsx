'use client';

import React, { useRef, useState } from 'react';
import type { PublicDocumentItem } from '../app/api/documents/list-documents-handler';

export interface PdfUploaderProps {
  fetchFn?: typeof fetch;
  onDocumentRegistered?: (document: PublicDocumentItem) => void;
}

export function PdfUploader({ fetchFn, onDocumentRegistered }: PdfUploaderProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setErrorMessage(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedFile) {
      setErrorMessage('Selecciona un archivo PDF antes de subirlo.');
      return;
    }

    setIsUploading(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const requestFetch = fetchFn ?? globalThis.fetch;
      const response = await requestFetch('/api/documents', {
        method: 'POST',
        body: formData,
      });

      const body = await response.json();

      if (!response.ok) {
        setErrorMessage(body.error ?? 'No se pudo registrar el documento PDF.');
        return;
      }

      if (body.document) {
        onDocumentRegistered?.(body.document as PublicDocumentItem);
      }

      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch {
      setErrorMessage('Error de conexión al subir el archivo PDF.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <section aria-label="Incorporar documento PDF">
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="pdf-upload-input">Seleccionar archivo PDF</label>
          <input
            ref={fileInputRef}
            id="pdf-upload-input"
            name="file"
            type="file"
            accept="application/pdf,.pdf"
            onChange={handleFileChange}
            disabled={isUploading}
          />
        </div>
        <button type="submit" disabled={isUploading}>
          {isUploading ? 'Subiendo PDF...' : 'Subir PDF'}
        </button>
      </form>
      {errorMessage ? <p role="alert">{errorMessage}</p> : null}
    </section>
  );
}
