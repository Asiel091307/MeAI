'use client';

import React from 'react';
import type { ChatTurn } from '../../src/rag/answering/conversation-context';
import { MenuIcon } from '../icons';
import { type CitationSelection, MessageItem } from './message-item';
import { QuestionBar } from './question-bar';

export interface ConversationPanelProps {
  messages: readonly ChatTurn[];
  isBusy: boolean;
  statusMessage: string | null;
  provisionalText: string;
  errorMessage: string | null;
  lastFailedQuestion: string | null;
  note: string | null;
  hasDocuments: boolean;
  activeCitation: CitationSelection | null;
  onAsk: (question: string) => boolean;
  onRetry: (question: string) => void;
  onDraftChange: () => void;
  onSelectCitation: (selection: CitationSelection) => void;
  onShowEvidence: (turnId: string) => void;
  onToggleLibrary: () => void;
  onToggleEvidence: () => void;
  onUpload: (files: FileList) => void;
}

// Center panel (spec 004, RF-004-8). Ask/Remember modes wait for spec 007.
export function ConversationPanel(props: ConversationPanelProps) {
  const { messages } = props;
  const title = messages.find((turn) => turn.role === 'user')?.content ?? 'Nueva conversación';

  return (
    <main className="conversation" aria-label="Conversación">
      <header className="conversation-header">
        <button type="button" className="icon-btn" aria-label="Biblioteca" onClick={props.onToggleLibrary}>
          <MenuIcon />
        </button>
        <span className="conversation-title" title={title}>
          {title}
        </span>
        <button type="button" className="btn-outline" onClick={props.onToggleEvidence}>
          Evidencia
        </button>
      </header>

      <div className="conversation-scroll">
        <div className="conversation-column" aria-label="Historial de conversación">
          {messages.length === 0 && !props.isBusy ? (
            <div className="empty-state">
              <div>
                <h1>¿Qué necesitas recordar?</h1>
                <p>Respondo solo con lo que dicen tus documentos, y te muestro dónde lo dice.</p>
              </div>
              {!props.hasDocuments ? (
                <label className="drop-zone">
                  <span className="drop-zone-title">Arrastra tus documentos aquí</span>
                  <span className="drop-zone-hint">PDF, hasta 10 MB y 100 páginas.</span>
                  <span className="drop-zone-button">Elegir archivos</span>
                  <input
                    className="file-input"
                    type="file"
                    multiple
                    accept="application/pdf,.pdf"
                    aria-label="Elegir archivos"
                    onChange={(event) => {
                      if (event.target.files) props.onUpload(event.target.files);
                      event.target.value = '';
                    }}
                  />
                </label>
              ) : null}
            </div>
          ) : null}

          {messages.map((turn) => (
            <MessageItem
              key={turn.id}
              turn={turn}
              activeCitation={props.activeCitation}
              onSelectCitation={props.onSelectCitation}
              onShowEvidence={props.onShowEvidence}
              onUpload={props.onUpload}
            />
          ))}

          {props.isBusy && props.statusMessage && !props.provisionalText ? (
            <div className="stage-line" role="status">
              <span>{props.statusMessage}</span>
              <span className="cursor" aria-hidden="true" />
            </div>
          ) : null}

          {props.isBusy && props.provisionalText ? (
            <div className="turn" aria-label="Respuesta provisional en curso">
              <div className="answer">
                {props.provisionalText}
                <span className="cursor" aria-hidden="true" style={{ marginLeft: 2 }} />
              </div>
            </div>
          ) : null}

          {props.errorMessage ? (
            <div className="chat-error" role="alert">
              <p>{props.errorMessage}</p>
              {props.lastFailedQuestion ? (
                <button
                  type="button"
                  className="btn-outline"
                  disabled={props.isBusy}
                  onClick={() => props.lastFailedQuestion && props.onRetry(props.lastFailedQuestion)}
                >
                  Reintentar pregunta
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <QuestionBar
        isBusy={props.isBusy}
        note={props.note}
        onAsk={props.onAsk}
        onDraftChange={props.onDraftChange}
        onUpload={props.onUpload}
      />
    </main>
  );
}
