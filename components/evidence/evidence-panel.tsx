'use client';

import React from 'react';
import type { ResolvedCitation } from '../../src/rag/answering/citation-validation';
import { EvidenceCard } from './evidence-card';
import { PdfViewer, type ViewerTarget } from './pdf-viewer';

export const EMPTY_EVIDENCE_MESSAGE =
  'Aquí verás los fragmentos de tus documentos en los que se apoya cada respuesta.';

export interface EvidencePanelProps {
  citations: readonly ResolvedCitation[];
  activeIndex: number | null;
  viewer: ViewerTarget | null;
  onOpen: (target: ViewerTarget) => void;
  onCloseViewer: () => void;
  onClose: () => void;
}

// Right panel (spec 004, RF-004-3 and RF-004-4).
export function EvidencePanel({ citations, activeIndex, viewer, onOpen, onCloseViewer, onClose }: EvidencePanelProps) {
  return (
    <aside className="evidence" aria-label="Evidencia">
      {viewer ? (
        <PdfViewer target={viewer} onBack={onCloseViewer} />
      ) : (
        <>
          <div className="evidence-header">
            <span className="evidence-title">Evidencia de esta respuesta</span>
            {citations.length > 0 ? (
              <span className="evidence-count">
                {citations.length === 1 ? '1 fragmento' : `${citations.length} fragmentos`}
              </span>
            ) : null}
            <button type="button" className="icon-btn evidence-close" aria-label="Cerrar evidencia" onClick={onClose}>
              ×
            </button>
          </div>
          <div className="evidence-list">
            {citations.length === 0 ? (
              <p className="evidence-empty">{EMPTY_EVIDENCE_MESSAGE}</p>
            ) : (
              citations.map((citation, index) => (
                <EvidenceCard
                  key={citation.chunkId}
                  citation={citation}
                  index={index}
                  active={activeIndex === index}
                  onOpen={(c) =>
                    onOpen({ documentId: c.documentId, name: c.documentName ?? c.documentId, page: c.page })
                  }
                />
              ))
            )}
          </div>
        </>
      )}
    </aside>
  );
}
