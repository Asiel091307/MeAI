'use client';

import React, { useState } from 'react';
import type { PublicDocumentItem } from '../../app/api/documents/public-document';
import type { DocumentStatus } from '../../src/db/contracts';

export const STATUS_LABELS: Record<DocumentStatus, string> = {
  processing: 'En procesamiento',
  available: 'Disponible',
  failed: 'Fallido',
};

const DATE_FORMAT = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

export function formatDocumentDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : DATE_FORMAT.format(date).replace('.', '');
}

export interface DocumentCardProps {
  document: PublicDocumentItem;
  onView: (document: PublicDocumentItem) => void;
  onReprocess: (documentId: string) => Promise<void> | void;
  onDelete: (documentId: string) => Promise<void> | void;
}

// One document of the Library (spec 004, RF-004-7).
export function DocumentCard({ document, onView, onReprocess, onDelete }: DocumentCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const { id, name, status, error } = document;

  const run = async (action: () => Promise<void> | void) => {
    setBusy(true);
    setMenuOpen(false);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="doc-card" aria-label={name} data-document-id={id} data-document-status={status}>
      <div className="doc-card-top">
        <span className="doc-type">PDF</span>
        <span className="doc-name" title={name}>
          {name}
        </span>
        <span className="sr-only" aria-label={`Estado de ${name}`}>
          {STATUS_LABELS[status]}
        </span>
        <button
          type="button"
          className="icon-btn doc-more"
          aria-label={`Más acciones de ${name}`}
          aria-expanded={menuOpen}
          onClick={() => {
            setMenuOpen((open) => !open);
            setConfirming(false);
          }}
        >
          ⋯
        </button>
      </div>

      {status === 'processing' ? (
        <div className="doc-row" aria-hidden="true">
          <div className="doc-stages">
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} className="doc-stage" data-on={i === 0} />
            ))}
          </div>
          <span className="doc-stage-label">Procesando…</span>
        </div>
      ) : null}

      {error ? (
        <div className="doc-row">
          <span className="doc-error" role="note">
            {error}
          </span>
          {status === 'failed' ? (
            <button
              type="button"
              className="btn-outline"
              aria-label={`Reintentar ${name}`}
              disabled={busy}
              onClick={() => void run(() => onReprocess(id))}
            >
              Reintentar
            </button>
          ) : null}
        </div>
      ) : null}

      {status !== 'processing' ? (
        <div className="doc-row">
          <span className="doc-meta">{formatDocumentDate(document.createdAt)}</span>
        </div>
      ) : null}

      {menuOpen ? (
        <div className="doc-menu" role="menu" aria-label={`Acciones de ${name}`}>
          <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onView(document); }}>
            Ver
          </button>
          {status !== 'processing' ? (
            <button
              type="button"
              role="menuitem"
              aria-label={`Reprocesar ${name}`}
              disabled={busy}
              onClick={() => void run(() => onReprocess(id))}
            >
              Reprocesar
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className="danger"
            aria-label={`Eliminar ${name}`}
            onClick={() => {
              setMenuOpen(false);
              setConfirming(true);
            }}
          >
            Eliminar
          </button>
        </div>
      ) : null}

      {confirming ? (
        <div className="doc-confirm" role="group" aria-label={`Confirmar eliminación de ${name}`}>
          <span>¿Eliminar este documento? Se borran el PDF, sus fragmentos y sus embeddings. No se puede deshacer.</span>
          <div className="doc-confirm-actions">
            <button
              type="button"
              className="btn-outline btn-danger"
              aria-label={`Confirmar: eliminar ${name}`}
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await onDelete(id);
                  setConfirming(false);
                })
              }
            >
              Eliminar
            </button>
            <button type="button" className="btn-outline" disabled={busy} onClick={() => setConfirming(false)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
