'use client';

import React, { useState } from 'react';
import type { ChatTurn } from '../../src/rag/answering/conversation-context';

export interface CitationSelection {
  turnId: string;
  index: number;
}

export function isNoEvidenceAnswer(turn: ChatTurn): boolean {
  return (
    turn.role === 'assistant' &&
    (turn.citations?.length ?? 0) === 0 &&
    /información suficiente/i.test(turn.content)
  );
}

export function citationLabel(index: number, documentName: string, page: number, available: boolean): string {
  return available
    ? `Fuente ${index + 1}: ${documentName}, página ${page}`
    : `Fuente ${index + 1} no disponible (documento eliminado): ${documentName}, página ${page}`;
}

export interface MessageItemProps {
  turn: ChatTurn;
  activeCitation: CitationSelection | null;
  onSelectCitation: (selection: CitationSelection) => void;
  onShowEvidence: (turnId: string) => void;
  onUpload: (files: FileList) => void;
}

// One turn of the conversation (spec 004, RF-004-2 and RF-004-8).
export function MessageItem({ turn, activeCitation, onSelectCitation, onShowEvidence, onUpload }: MessageItemProps) {
  const [copied, setCopied] = useState(false);

  if (turn.role === 'user') {
    return (
      <div className="turn" data-role="user">
        <div className="bubble-user">{turn.content}</div>
      </div>
    );
  }

  if (isNoEvidenceAnswer(turn)) {
    return (
      <div className="turn" data-role="assistant">
        <div className="unknown-card">
          <div>
            <div className="unknown-title">No encontré esto con seguridad en tus documentos.</div>
            <div className="unknown-subtitle">Prefiero decírtelo antes que inventar una respuesta.</div>
          </div>
          <div>
            <label className="link-upload">
              Subir un documento que lo contenga
              <input
                className="file-input"
                type="file"
                multiple
                accept="application/pdf,.pdf"
                onChange={(event) => {
                  if (event.target.files) onUpload(event.target.files);
                  event.target.value = '';
                }}
              />
            </label>
          </div>
        </div>
      </div>
    );
  }

  const citations = turn.citations ?? [];
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(turn.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (insecure context): nothing to do.
    }
  };

  return (
    <div className="turn" data-role="assistant">
      <div className="answer">
        {turn.content}
        {citations.map((citation, index) => {
          const name = citation.documentName ?? citation.documentId;
          const available = citation.available !== false;
          const active = activeCitation?.turnId === turn.id && activeCitation.index === index;
          return (
            <button
              key={citation.chunkId}
              type="button"
              className="cite-chip"
              data-available={available}
              aria-pressed={active}
              aria-label={citationLabel(index, name, citation.page, available)}
              title={`${name} · p. ${citation.page}`}
              onClick={() => onSelectCitation({ turnId: turn.id, index })}
            >
              {index + 1}
            </button>
          );
        })}
      </div>
      <div className="answer-actions">
        <button type="button" className="btn-ghost" onClick={() => void copy()}>
          {copied ? 'Copiado' : 'Copiar'}
        </button>
        {citations.length > 0 ? (
          <button type="button" className="btn-ghost evidence-link" onClick={() => onShowEvidence(turn.id)}>
            Ver evidencia
          </button>
        ) : null}
      </div>
    </div>
  );
}
