'use client';

import React, { useRef } from 'react';
import type { PublicDocumentItem } from '../../app/api/documents/public-document';
import { UploadIcon } from '../icons';
import { DocumentCard } from './document-card';
import type { ProviderStatus } from './provider-status';

export interface LibraryPanelProps {
  documents: readonly PublicDocumentItem[];
  width: number;
  resizable: boolean;
  resizing: boolean;
  actionError: string | null;
  uploadErrors: readonly string[];
  isUploading: boolean;
  // null until GET /api/settings answers (spec 012).
  providerStatus: ProviderStatus | null;
  onUpload: (files: FileList) => void;
  onOpenPalette: () => void;
  onView: (document: PublicDocumentItem) => void;
  onReprocess: (documentId: string) => Promise<void> | void;
  onDelete: (documentId: string) => Promise<void> | void;
  onResizeStart: (event: React.PointerEvent) => void;
  onResizeReset: () => void;
}

// Left panel (spec 004, RF-004-7). Spaces, History and Timeline wait for specs 008 and 005.
export function LibraryPanel(props: LibraryPanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { documents } = props;

  return (
    <aside className="library" aria-label="Biblioteca" style={{ width: props.width }}>
      <div className="library-logo">
        <span className="library-logo-mark" aria-hidden="true" />
        <span className="library-logo-name">MeAI</span>
      </div>
      <div style={{ padding: '0 12px 12px' }}>
        <button type="button" className="library-search" onClick={props.onOpenPalette}>
          <span>Buscar…</span>
          <span className="kbd">Ctrl+K</span>
        </button>
      </div>

      {props.resizable ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Cambiar ancho de la Biblioteca"
          title="Arrastra para cambiar el ancho · doble clic para restablecer"
          className="library-resize"
          data-active={props.resizing}
          onPointerDown={props.onResizeStart}
          onDoubleClick={props.onResizeReset}
        >
          <span />
        </div>
      ) : null}

      <span className="library-section-label" style={{ margin: '0 12px' }}>
        Documentos
      </span>
      <div className="library-list">
        <label className="upload-card">
          <span className="upload-card-icon">
            <UploadIcon />
          </span>
          <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <span className="upload-card-title">{props.isUploading ? 'Subiendo…' : 'Subir documentos'}</span>
            <span className="upload-card-hint">PDF hasta 10 MB · o arrástralos aquí</span>
          </span>
          <input
            ref={inputRef}
            className="file-input"
            type="file"
            multiple
            accept="application/pdf,.pdf"
            aria-label="Subir documentos"
            disabled={props.isUploading}
            onChange={(event) => {
              if (event.target.files) props.onUpload(event.target.files);
              event.target.value = '';
            }}
          />
        </label>

        {props.uploadErrors.map((message) => (
          <p key={message} className="library-note" role="alert">
            {message}
          </p>
        ))}
        {props.providerStatus?.notices.map((message) => (
          <p key={message} className="library-note" role="status">
            {message}
          </p>
        ))}
        {props.actionError ? (
          <p className="library-note" role="alert">
            {props.actionError}
          </p>
        ) : null}

        {documents.length === 0 ? (
          <p className="library-empty">
            Aún no hay documentos. Arrastra un archivo a cualquier parte de la ventana.
          </p>
        ) : (
          documents.map((document) => (
            <DocumentCard
              key={document.id}
              document={document}
              onView={props.onView}
              onReprocess={props.onReprocess}
              onDelete={props.onDelete}
            />
          ))
        )}
      </div>

      {props.providerStatus ? (
        <div className="library-footer" title={props.providerStatus.tooltip}>
          <span className="plan-dot" data-tone={props.providerStatus.tone} aria-hidden="true" />
          <span className="mono">{props.providerStatus.label}</span>
        </div>
      ) : null}
    </aside>
  );
}
