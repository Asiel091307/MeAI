'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PublicDocumentItem } from '../app/api/documents/public-document';
import type { ChatTurn } from '../src/rag/answering/conversation-context';
import { CommandPalette, type PaletteCommand } from './command-palette';
import { ConversationPanel } from './conversation/conversation-panel';
import type { CitationSelection } from './conversation/message-item';
import { EvidencePanel } from './evidence/evidence-panel';
import type { ViewerTarget } from './evidence/pdf-viewer';
import { useChat } from './hooks/use-chat';
import { useDocuments } from './hooks/use-documents';
import { LibraryPanel } from './library/library-panel';

export type Layout = 'desk' | 'tablet' | 'mobile';

export const DEFAULT_LIBRARY_WIDTH = 280;
const LIBRARY_WIDTH_KEY = 'meai-libw';
const clampWidth = (width: number) => Math.max(220, Math.min(640, width));

export function layoutForWidth(width: number): Layout {
  return width < 760 ? 'mobile' : width < 1180 ? 'tablet' : 'desk';
}

export interface AppShellProps {
  fetchFn?: typeof fetch;
  initialDocuments?: PublicDocumentItem[];
  pollIntervalMs?: number;
}

// The three-panel workspace of the design handoff (spec 004).
export function AppShell({ fetchFn, initialDocuments, pollIntervalMs }: AppShellProps) {
  const [layout, setLayout] = useState<Layout>('desk');
  const [libOpen, setLibOpen] = useState(true);
  const [evOpen, setEvOpen] = useState(true);
  const [libWidth, setLibWidth] = useState(DEFAULT_LIBRARY_WIDTH);
  const [resizing, setResizing] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [deletedDocumentIds, setDeletedDocumentIds] = useState<string[]>([]);
  const [selectedTurnId, setSelectedTurnId] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [viewer, setViewer] = useState<ViewerTarget | null>(null);
  const libWidthRef = useRef(libWidth);
  libWidthRef.current = libWidth;

  const docs = useDocuments({
    fetchFn,
    initialDocuments,
    pollIntervalMs,
    onDocumentDeleted: (documentId) => {
      setDeletedDocumentIds((prev) => (prev.includes(documentId) ? prev : [...prev, documentId]));
      setViewer((current) => (current?.documentId === documentId ? null : current));
    },
  });

  const onAnswer = useCallback((turn: ChatTurn) => {
    if ((turn.citations?.length ?? 0) > 0) {
      setSelectedTurnId(turn.id);
      setActiveIndex(null);
      setViewer(null);
    }
  }, []);
  const chat = useChat({ fetchFn, deletedDocumentIds, onAnswer });

  // Layout follows the window width; on every breakpoint change the panels reset (RF-004-1).
  useEffect(() => {
    const apply = () => {
      const next = layoutForWidth(window.innerWidth);
      setLayout((current) => {
        if (current !== next) {
          setLibOpen(next !== 'mobile');
          setEvOpen(next === 'desk');
        }
        return next;
      });
    };
    const initial = layoutForWidth(window.innerWidth);
    setLayout(initial);
    setLibOpen(initial !== 'mobile');
    setEvOpen(initial === 'desk');
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, []);

  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem(LIBRARY_WIDTH_KEY));
      if (saved) setLibWidth(clampWidth(saved));
    } catch {
      // Storage unavailable: keep the default width.
    }
  }, []);

  const closeOverlays = useCallback(() => {
    setPaletteOpen(false);
    if (layout === 'mobile') setLibOpen(false);
    if (layout !== 'desk') setEvOpen(false);
  }, [layout]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      } else if (event.key === 'Escape') {
        closeOverlays();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeOverlays]);

  const saveWidth = (width: number) => {
    try {
      window.localStorage.setItem(LIBRARY_WIDTH_KEY, String(width));
    } catch {
      // Storage unavailable: the width only lasts for this tab.
    }
  };

  const startResize = (event: React.PointerEvent) => {
    event.preventDefault();
    const x0 = event.clientX;
    const w0 = libWidthRef.current;
    let lastWidth = w0;
    const move = (e: PointerEvent) => {
      lastWidth = clampWidth(w0 + e.clientX - x0);
      setLibWidth(lastWidth);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setResizing(false);
      saveWidth(lastWidth);
    };
    setResizing(true);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const hasAvailable = docs.documents.some((doc) => doc.status === 'available');

  const ask = (question: string): boolean => {
    if (!question.trim()) {
      setNote('Escribe una pregunta para consultar tus documentos.');
      return false;
    }
    if (docs.loaded && !hasAvailable) {
      setNote('Todavía no hay documentos listos. Sube uno para empezar.');
      return false;
    }
    setNote(null);
    void chat.sendQuestion(question);
    return true;
  };

  const upload = (files: FileList | File[]) => void docs.uploadFiles(files);

  const selectedTurn =
    chat.messages.find((turn) => turn.id === selectedTurnId) ??
    [...chat.messages].reverse().find((turn) => turn.role === 'assistant' && (turn.citations?.length ?? 0) > 0);
  const citations = selectedTurn?.citations ?? [];
  const activeCitation: CitationSelection | null =
    selectedTurn && activeIndex !== null ? { turnId: selectedTurn.id, index: activeIndex } : null;

  const openViewer = (target: ViewerTarget) => {
    setViewer(target);
    setEvOpen(true);
    if (layout === 'mobile') setLibOpen(false);
  };

  const commands: PaletteCommand[] = useMemo(
    () => [
      {
        label: 'Nueva conversación',
        group: 'Acción',
        run: () => {
          chat.reset();
          setSelectedTurnId(null);
          setActiveIndex(null);
          setViewer(null);
        },
      },
      ...docs.documents.map((doc) => ({
        label: doc.name,
        group: 'Documento',
        run: () => openViewer({ documentId: doc.id, name: doc.name, page: 1 }),
      })),
    ],
    // openViewer only uses state setters and layout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chat.reset, docs.documents, layout],
  );

  const scrim = (layout === 'mobile' && libOpen) || (layout !== 'desk' && evOpen);

  return (
    <div
      className="shell"
      data-layout={layout}
      onDragOver={(event) => {
        if (!event.dataTransfer?.types?.includes('Files')) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.relatedTarget) setDragging(false);
      }}
      onDrop={(event) => {
        if (!event.dataTransfer?.files?.length) return;
        event.preventDefault();
        setDragging(false);
        upload(event.dataTransfer.files);
      }}
    >
      {libOpen ? (
        <LibraryPanel
          documents={docs.documents}
          width={libWidth}
          resizable={layout !== 'mobile'}
          resizing={resizing}
          actionError={docs.actionError}
          uploadErrors={docs.uploadErrors}
          isUploading={docs.isUploading}
          onUpload={upload}
          onOpenPalette={() => setPaletteOpen(true)}
          onView={(doc) => openViewer({ documentId: doc.id, name: doc.name, page: 1 })}
          onReprocess={docs.reprocessDocument}
          onDelete={docs.deleteDocument}
          onResizeStart={startResize}
          onResizeReset={() => {
            setLibWidth(DEFAULT_LIBRARY_WIDTH);
            saveWidth(DEFAULT_LIBRARY_WIDTH);
          }}
        />
      ) : null}

      <ConversationPanel
        messages={chat.messages}
        isBusy={chat.isBusy}
        statusMessage={chat.statusMessage}
        provisionalText={chat.provisionalText}
        errorMessage={chat.errorMessage}
        lastFailedQuestion={chat.lastFailedQuestion}
        note={note}
        hasDocuments={docs.documents.length > 0}
        activeCitation={activeCitation}
        onAsk={ask}
        onRetry={(question) => void chat.sendQuestion(question)}
        onDraftChange={() => setNote(null)}
        onSelectCitation={(selection) => {
          setSelectedTurnId(selection.turnId);
          setActiveIndex(selection.index);
          setViewer(null);
          setEvOpen(true);
        }}
        onShowEvidence={(turnId) => {
          setSelectedTurnId(turnId);
          setActiveIndex(null);
          setViewer(null);
          setEvOpen(true);
        }}
        onToggleLibrary={() => setLibOpen((open) => !open)}
        onToggleEvidence={() => setEvOpen((open) => !open)}
        onUpload={upload}
      />

      {scrim ? <div className="scrim" onClick={closeOverlays} /> : null}

      {evOpen ? (
        <EvidencePanel
          citations={citations}
          activeIndex={activeIndex}
          viewer={viewer}
          onOpen={openViewer}
          onCloseViewer={() => setViewer(null)}
          onClose={() => setEvOpen(false)}
        />
      ) : null}

      {paletteOpen ? <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} /> : null}

      {dragging ? (
        <div className="drop-overlay" aria-hidden="true">
          <div>Suelta para agregar a tus documentos</div>
        </div>
      ) : null}
    </div>
  );
}
