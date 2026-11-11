'use client';

import React, { useState } from 'react';
import { ChatPanel } from '../components/chat-panel';
import { DocumentsPanel } from '../components/documents-panel';

export default function HomePage() {
  const [deletedDocumentIds, setDeletedDocumentIds] = useState<string[]>([]);

  const handleDocumentDeleted = (documentId: string) => {
    setDeletedDocumentIds((prev) =>
      prev.includes(documentId) ? prev : [...prev, documentId],
    );
  };

  return (
    <main>
      <h1>MeAI</h1>
      <p>Consulta tus documentos PDF.</p>
      <DocumentsPanel onDocumentDeleted={handleDocumentDeleted} />
      <ChatPanel deletedDocumentIds={deletedDocumentIds} />
    </main>
  );
}
