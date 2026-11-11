'use client';

import React, { useEffect, useState } from 'react';
import {
  type ChatTurn,
  invalidateDeletedDocumentCitations,
} from '../src/rag/answering/conversation-context';
import type { ChatAnswerStreamEvent } from '../src/rag/answering/dependent-query-cancellation';

export interface ChatPanelProps {
  fetchFn?: typeof fetch;
  deletedDocumentIds?: readonly string[];
}

export function ChatPanel({ fetchFn, deletedDocumentIds = [] }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [questionInput, setQuestionInput] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [provisionalText, setProvisionalText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastFailedQuestion, setLastFailedQuestion] = useState<string | null>(null);

  useEffect(() => {
    if (deletedDocumentIds.length === 0) {
      return;
    }

    setMessages((prev) => {
      let updated = prev;
      for (const docId of deletedDocumentIds) {
        updated = invalidateDeletedDocumentCitations(updated, docId);
      }
      return updated;
    });
  }, [deletedDocumentIds]);

  const sendQuestion = async (rawQuestion: string) => {
    if (isBusy) {
      return;
    }

    const trimmed = rawQuestion.trim();
    if (!trimmed) {
      setErrorMessage('La pregunta no puede estar vacía. Escribe una pregunta para consultar tus documentos.');
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);
    setLastFailedQuestion(null);
    setProvisionalText('');
    setStatusMessage('Buscando evidencia en tus documentos disponibles...');

    const userTurn: ChatTurn = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role: 'user',
      content: trimmed,
    };

    const historySnapshot = messages;
    setMessages((prev) => [...prev, userTurn]);
    setQuestionInput('');

    try {
      const requestFetch = fetchFn ?? globalThis.fetch;
      const response = await requestFetch('/api/chat/answers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: trimmed,
          history: historySnapshot,
          deletedDocumentIds,
        }),
      });

      if (!response.ok || !response.body) {
        let errText = 'No se pudo procesar la consulta en este momento.';
        try {
          const body = await response.json();
          if (body?.error) {
            errText = body.error;
          }
        } catch {
          // Keep default message
        }
        setProvisionalText('');
        setErrorMessage(errText);
        setLastFailedQuestion(trimmed);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let receivedFinal = false;
      let streamFailed = false;

      const processLine = (line: string) => {
        const clean = line.trim();
        if (!clean.startsWith('data:')) return;
        const jsonStr = clean.slice(5).trim();
        if (!jsonStr) return;

        let event: ChatAnswerStreamEvent;
        try {
          event = JSON.parse(jsonStr) as ChatAnswerStreamEvent;
        } catch {
          return;
        }

        if (event.type === 'status') {
          setStatusMessage(event.message);
        } else if (event.type === 'text') {
          setProvisionalText((prev) => prev + event.text);
        } else if (event.type === 'final') {
          receivedFinal = true;
          setProvisionalText('');
          setStatusMessage(null);
          const assistantTurn: ChatTurn = {
            id: `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            role: 'assistant',
            content: event.text,
            citations: event.citations,
          };
          setMessages((prev) => [...prev, assistantTurn]);
        } else if (event.type === 'error') {
          streamFailed = true;
          setProvisionalText('');
          setStatusMessage(null);
          setErrorMessage(event.error);
          if (event.retryable) {
            setLastFailedQuestion(trimmed);
          }
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            processLine(line);
          }
        }

        if (buffer.trim()) {
          processLine(buffer);
        }
      } finally {
        reader.releaseLock();
      }

      if (!receivedFinal && !streamFailed) {
        setProvisionalText('');
        setErrorMessage('La generación de la respuesta se interrumpió antes de completarse.');
        setLastFailedQuestion(trimmed);
      }
    } catch {
      setProvisionalText('');
      setErrorMessage('Error de conexión durante la consulta. Inténtalo de nuevo.');
      setLastFailedQuestion(trimmed);
    } finally {
      setStatusMessage(null);
      setIsBusy(false);
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendQuestion(questionInput);
  };

  return (
    <section aria-label="Chat de consultas documentales">
      <div aria-label="Historial de conversación">
        {messages.map((turn) => (
          <article key={turn.id} data-role={turn.role}>
            <p>{turn.content}</p>
            {turn.role === 'assistant' && turn.citations && turn.citations.length > 0 ? (
              <ul aria-label="Fuentes documentales">
                {turn.citations.map((citation) => (
                  <li key={citation.chunkId}>
                    {citation.available !== false ? (
                      <span>
                        {`Fuente: ${citation.documentName ?? citation.documentId} — Página ${citation.page} (Fragmento ${citation.chunkId})`}
                      </span>
                    ) : (
                      <span>
                        {`Fuente no disponible (documento eliminado): ${citation.documentName ?? citation.documentId} — Página ${citation.page}`}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}

        {isBusy && provisionalText ? (
          <div aria-label="Respuesta provisional en curso">
            <p>{provisionalText}</p>
          </div>
        ) : null}
      </div>

      {isBusy && statusMessage ? <p role="status">{statusMessage}</p> : null}

      {errorMessage ? (
        <div role="alert">
          <p>{errorMessage}</p>
          {lastFailedQuestion ? (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void sendQuestion(lastFailedQuestion)}
            >
              Reintentar pregunta
            </button>
          ) : null}
        </div>
      ) : null}

      <form onSubmit={handleSubmit}>
        <label htmlFor="chat-question-input">Escribe tu pregunta</label>
        <input
          id="chat-question-input"
          name="question"
          type="text"
          value={questionInput}
          onChange={(e) => setQuestionInput(e.target.value)}
          disabled={isBusy}
        />
        <button type="submit" disabled={isBusy}>
          {isBusy ? 'Respondiendo...' : 'Enviar pregunta'}
        </button>
      </form>
    </section>
  );
}
