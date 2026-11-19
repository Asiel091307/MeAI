import { expect, test } from 'vitest';
import type { AnswerSource } from '../../src/rag/providers/generation';
import {
  buildGroundedUserPrompt,
  CitationFilter,
  GROUNDED_SYSTEM_INSTRUCTION,
  isNoEvidenceText,
  NO_EVIDENCE_MESSAGE,
} from '../../src/rag/providers/grounded-prompt';

const sources: AnswerSource[] = [
  { id: 'a', documentId: 'doc-1', page: 2, text: 'Texto A.', score: 0.9 },
  { id: 'b', documentId: 'doc-2', page: 5, text: 'Texto B.', score: 0.8 },
];

test('builds the user prompt with question and numbered sources', () => {
  const prompt = buildGroundedUserPrompt('¿Qué?', sources);
  expect(prompt).toContain('Pregunta del usuario:\n¿Qué?');
  expect(prompt).toContain('[Fragmento 1 (id: a, doc: doc-1, pág: 2)]:\nTexto A.');
  expect(prompt).toContain('[Fragmento 2 (id: b, doc: doc-2, pág: 5)]:\nTexto B.');
});

test('system instruction embeds the no-evidence message and the citation format', () => {
  expect(GROUNDED_SYSTEM_INSTRUCTION).toContain(NO_EVIDENCE_MESSAGE);
  expect(GROUNDED_SYSTEM_INSTRUCTION).toContain('[FUENTES: id1, id2]');
});

test('detects no-evidence text', () => {
  expect(isNoEvidenceText(NO_EVIDENCE_MESSAGE)).toBe(true);
  expect(isNoEvidenceText('Aquí NO HAY INFORMACIÓN SUFICIENTE')).toBe(true);
  expect(isNoEvidenceText('El plazo vence el viernes.')).toBe(false);
});

test('CitationFilter hides markers split across deltas and validates ids', () => {
  const filter = new CitationFilter(sources);
  expect(filter.push('Respuesta.')).toBe('Respuesta.');
  expect(filter.push('\n[CI')).toBe('');
  expect(filter.push('TAS: a, x')).toBe('');
  expect(filter.push(', b]')).toBe('');
  expect(filter.finish()).toMatchObject({ text: '', citations: ['a', 'b'], noEvidence: false });
});

test('CitationFilter keeps a bracket that is not a marker', () => {
  const filter = new CitationFilter(sources);
  expect(filter.push('Ver [1')).toBe('Ver [1');
  expect(filter.finish().citations).toEqual([]);
});

test('CitationFilter reads an unclosed marker at the end and drops citations on no evidence', () => {
  const unclosed = new CitationFilter(sources);
  unclosed.push('Hecho. [FUENTES: a');
  expect(unclosed.finish()).toMatchObject({ citations: ['a'] });

  const none = new CitationFilter(sources);
  none.push(NO_EVIDENCE_MESSAGE);
  expect(none.finish()).toMatchObject({ citations: [], noEvidence: true, emittedAnyText: true });
});
