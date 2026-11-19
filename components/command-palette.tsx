'use client';

import React, { useState } from 'react';

export interface PaletteCommand {
  label: string;
  group: string;
  run: () => void;
}

export interface CommandPaletteProps {
  commands: readonly PaletteCommand[];
  onClose: () => void;
}

// Ctrl/⌘+K palette (spec 004, RF-004-9). Notes, modes and spaces wait for their specs.
export function CommandPalette({ commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const visible = commands.filter((command) => !q || command.label.toLowerCase().includes(q));

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div
        className="palette"
        role="dialog"
        aria-label="Paleta de comandos"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          autoFocus
          aria-label="Buscar comandos"
          placeholder="Buscar documentos, espacios o acciones…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="palette-list">
          {visible.map((command) => (
            <button
              key={`${command.group}-${command.label}`}
              type="button"
              className="palette-item"
              onClick={() => {
                onClose();
                command.run();
              }}
            >
              <span>{command.label}</span>
              <span className="palette-group">{command.group}</span>
            </button>
          ))}
          {visible.length === 0 ? <span className="palette-empty">Nada coincide con esa búsqueda.</span> : null}
        </div>
      </div>
    </div>
  );
}
