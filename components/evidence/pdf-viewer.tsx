'use client';

import React from 'react';

export interface ViewerTarget {
  documentId: string;
  name: string;
  page: number;
}

export function documentFileUrl(target: ViewerTarget): string {
  return `/api/documents/${encodeURIComponent(target.documentId)}/file#page=${target.page}`;
}

export interface PdfViewerProps {
  target: ViewerTarget;
  onBack: () => void;
}

// The original PDF at the cited page, with the browser's built-in viewer (spec 004, RF-004-4).
// Highlighting the fragment inside the page comes with spec 004b (pdf.js).
export function PdfViewer({ target, onBack }: PdfViewerProps) {
  const url = documentFileUrl(target);
  return (
    <div className="viewer">
      <button type="button" className="btn-outline" style={{ alignSelf: 'flex-start' }} onClick={onBack}>
        ← Volver a la evidencia
      </button>
      <div className="viewer-ref">
        <span>{target.name}</span>
        <span style={{ color: 'var(--muted)' }}>{`p. ${target.page}`}</span>
      </div>
      <div className="viewer-page">
        <iframe key={url} title={`Documento ${target.name}, página ${target.page}`} src={url} />
      </div>
      <a className="viewer-link" href={url} target="_blank" rel="noreferrer">
        Abrir el PDF en una pestaña nueva
      </a>
    </div>
  );
}
