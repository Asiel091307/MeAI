'use client';

import React from 'react';
import type { ResolvedCitation } from '../../src/rag/answering/citation-validation';

export function similarityPercent(score: number): number {
  // A citation without a valid score shows 0% instead of "NaN%".
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score * 100)));
}

export interface EvidenceCardProps {
  citation: ResolvedCitation;
  index: number;
  active: boolean;
  onOpen: (citation: ResolvedCitation) => void;
}

// One cited fragment (spec 004, RF-004-3).
export function EvidenceCard({ citation, index, active, onOpen }: EvidenceCardProps) {
  const name = citation.documentName ?? citation.documentId;
  const available = citation.available !== false;
  const percent = similarityPercent(citation.score);

  return (
    <article className="evidence-card" aria-current={active ? 'true' : undefined} aria-label={`Fragmento ${index + 1}`}>
      <div className="evidence-card-head">
        <span className="evidence-n">{index + 1}</span>
        <span className="evidence-ref">{`${name} · p. ${citation.page}`}</span>
      </div>
      <div className="evidence-sim">
        <div className="evidence-bar" aria-hidden="true">
          <span style={{ width: `${percent}%` }} />
        </div>
        <span className="evidence-sim-label" aria-label={`Similitud ${percent}%`}>
          {percent}%
        </span>
      </div>
      <div className="evidence-text">{citation.text}</div>
      {available ? (
        <button type="button" className="btn-outline" style={{ alignSelf: 'flex-start' }} onClick={() => onOpen(citation)}>
          Abrir en el documento
        </button>
      ) : (
        <span className="evidence-unavailable">Fuente no disponible (documento eliminado)</span>
      )}
    </article>
  );
}
