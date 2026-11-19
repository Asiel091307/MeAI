'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  type ChatTurn,
  invalidateDeletedDocumentCitations,
} from '../../src/rag/answering/conversation-context';
import type { ChatAnswerStreamEvent } from '../../src/rag/answering/dependent-query-cancellation';
import { serverUnreachableMessage } from '../server-unreachable';

export interface UseChatOptions {
  fetchFn?: typeof fetch;
  deletedDocumentIds?: readonly string[];
  onAnswer?: (turn: ChatTurn) => void;
}

export interface UseChat {
  messages: ChatTurn[];
  isBusy: boolean;
  statusMessage: string | null;
  provisionalText: string;
  errorMessage: string | null;
  lastFailedQuestion: string | null;
  sendQuestion: (question: string) => Promise<void>;
  reset: () => void;
}

const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// Conversation state and the SSE client of POST /api/chat/answers (spec 001 RF-5/RF-6).
// The history lives only in this tab: nothing is stored (until spec 005).
export function useChat({ fetchFn, deletedDocumentIds = [], onAnswer }: UseChatOptions = {}): UseChat {
  const [messages, setMessages] = useState<ChatTurn[]>([]);
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

  const sendQuestion = useCallback(
    async (rawQuestion: string) => {
      if (isBusy) {
        return;
      }
      const trimmed = rawQuestion.trim();
      if (!trimmed) {
        setErrorMessage('Escribe una pregunta para consultar tus documentos.');
        return;
      }

      setIsBusy(true);
      setErrorMessage(null);
      setLastFailedQuestion(null);
      setProvisionalText('');
      setStatusMessage('Buscando evidencia en tus documentos disponibles...');

      const historySnapshot = messages;
      setMessages((prev) => [...prev, { id: newId('user'), role: 'user', content: trimmed }]);

      try {
        const response = await (fetchFn ?? globalThis.fetch)('/api/chat/answers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: trimmed, history: historySnapshot, deletedDocumentIds }),
        });

        if (!response.ok || !response.body) {
          let errText = 'No se pudo procesar la consulta en este momento.';
          try {
            const body = await response.json();
            if (body?.error) errText = body.error;
          } catch {
            // Keep the default message.
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
            const answer: ChatTurn = {
              id: newId('assistant'),
              role: 'assistant',
              content: event.text,
              citations: event.citations,
            };
            setMessages((prev) => [...prev, answer]);
            onAnswer?.(answer);
          } else if (event.type === 'error') {
            streamFailed = true;
            setProvisionalText('');
            setStatusMessage(null);
            setErrorMessage(event.error);
            if (event.retryable) setLastFailedQuestion(trimmed);
          }
        };

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) processLine(line);
          }
          if (buffer.trim()) processLine(buffer);
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
        setErrorMessage(serverUnreachableMessage('durante la consulta'));
        setLastFailedQuestion(trimmed);
      } finally {
        setStatusMessage(null);
        setIsBusy(false);
      }
    },
    [deletedDocumentIds, fetchFn, isBusy, messages, onAnswer],
  );

  const reset = useCallback(() => {
    if (isBusy) return;
    setMessages([]);
    setErrorMessage(null);
    setLastFailedQuestion(null);
    setProvisionalText('');
  }, [isBusy]);

  return {
    messages,
    isBusy,
    statusMessage,
    provisionalText,
    errorMessage,
    lastFailedQuestion,
    sendQuestion,
    reset,
  };
}
