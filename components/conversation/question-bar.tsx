'use client';

import React, { useState } from 'react';

export const MAX_QUESTION_CHARS = 1000;

export interface QuestionBarProps {
  isBusy: boolean;
  note: string | null;
  onAsk: (question: string) => boolean;
  onDraftChange: () => void;
  onUpload: (files: FileList) => void;
}

// Input bar fixed at the bottom of the conversation (spec 004, RF-004-8).
export function QuestionBar({ isBusy, note, onAsk, onDraftChange, onUpload }: QuestionBarProps) {
  const [draft, setDraft] = useState('');

  const submit = () => {
    if (isBusy) return;
    if (onAsk(draft)) setDraft('');
  };

  return (
    <div className="question-bar">
      <form
        className="question-form"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {note ? (
          <span className="question-note" role="alert">
            {note}
          </span>
        ) : null}
        <div className="question-box">
          <textarea
            aria-label="Escribe tu pregunta"
            rows={1}
            maxLength={MAX_QUESTION_CHARS}
            placeholder="Pregunta a tu memoria…"
            value={draft}
            disabled={isBusy}
            onChange={(event) => {
              setDraft(event.target.value);
              onDraftChange();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
          />
          <div className="question-row">
            <label className="attach" title="PDF hasta 10 MB">
              Adjuntar
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
            <span className="counter">
              {draft.length}/{MAX_QUESTION_CHARS}
            </span>
            <button type="submit" className="send" aria-label="Enviar pregunta" disabled={isBusy}>
              {isBusy ? 'Respondiendo…' : 'Enviar'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
