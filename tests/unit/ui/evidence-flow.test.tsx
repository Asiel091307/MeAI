// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { AppShell } from '../../../components/app-shell';
import { similarityPercent } from '../../../components/evidence/evidence-card';
import { documentItem, mockApi, setWindowWidth, twoSourceAnswer } from './support/mock-api';

// Spec 004, RF-004-2/3/4: citation chips → evidence cards → PDF viewer.
beforeEach(() => setWindowWidth(1280));
afterEach(() => {
  cleanup();
  setWindowWidth(1024);
});

async function askWithTwoSources() {
  const api = mockApi({
    documents: [documentItem(), documentItem({ id: 'doc-2', name: 'reglas.pdf' })],
    chatEvents: twoSourceAnswer,
  });
  render(<AppShell fetchFn={api.fetchFn} />);
  await screen.findByRole('article', { name: 'becas.pdf' });
  fireEvent.change(screen.getByLabelText('Escribe tu pregunta'), { target: { value: '¿Cuándo se presenta?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar pregunta' }));
  await screen.findByText('La solicitud se presenta en septiembre.');
  return api;
}

test('an answer with sources ends with numbered chips and fills the evidence panel', async () => {
  await askWithTwoSources();

  const chip1 = screen.getByRole('button', { name: 'Fuente 1: becas.pdf, página 3' });
  const chip2 = screen.getByRole('button', { name: 'Fuente 2: reglas.pdf, página 7' });
  expect(chip1.textContent).toBe('1');
  expect(chip2.getAttribute('title')).toBe('reglas.pdf · p. 7');

  const evidence = screen.getByRole('complementary', { name: 'Evidencia' });
  expect(within(evidence).getByText('Evidencia de esta respuesta')).toBeTruthy();
  expect(within(evidence).getByText('2 fragmentos')).toBeTruthy();
  expect(within(evidence).getByText('becas.pdf · p. 3')).toBeTruthy();
  expect(within(evidence).getByText('87%')).toBeTruthy();
  expect(within(evidence).getByText('61%')).toBeTruthy();
  expect(within(evidence).getByText('Del 1 al 30 de septiembre.')).toBeTruthy();
});

test('pressing a chip highlights it and its card', async () => {
  await askWithTwoSources();
  const chip2 = screen.getByRole('button', { name: 'Fuente 2: reglas.pdf, página 7' });
  fireEvent.click(chip2);

  expect(chip2.getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('article', { name: 'Fragmento 2' }).getAttribute('aria-current')).toBe('true');
  expect(screen.getByRole('article', { name: 'Fragmento 1' }).getAttribute('aria-current')).toBeNull();
});

test('"Abrir en el documento" shows the PDF at the cited page and "Volver" returns to the cards', async () => {
  await askWithTwoSources();
  const card2 = screen.getByRole('article', { name: 'Fragmento 2' });
  fireEvent.click(within(card2).getByRole('button', { name: 'Abrir en el documento' }));

  const frame = screen.getByTitle('Documento reglas.pdf, página 7');
  expect(frame.getAttribute('src')).toBe('/api/documents/doc-2/file#page=7');
  expect(screen.getByRole('link', { name: 'Abrir el PDF en una pestaña nueva' }).getAttribute('href')).toBe(
    '/api/documents/doc-2/file#page=7',
  );

  fireEvent.click(screen.getByRole('button', { name: '← Volver a la evidencia' }));
  expect(screen.getByText('Evidencia de esta respuesta')).toBeTruthy();
});

test('"Ver" in a document menu opens its PDF at page 1', async () => {
  render(<AppShell fetchFn={mockApi({ documents: [documentItem()] }).fetchFn} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Más acciones de becas.pdf' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Ver' }));

  expect(screen.getByTitle('Documento becas.pdf, página 1').getAttribute('src')).toBe('/api/documents/doc-1/file#page=1');
});

test('deleting a cited document marks its chip and card unavailable and closes its viewer', async () => {
  await askWithTwoSources();
  fireEvent.click(within(screen.getByRole('article', { name: 'Fragmento 1' })).getByRole('button', { name: 'Abrir en el documento' }));
  expect(screen.getByTitle('Documento becas.pdf, página 3')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Más acciones de becas.pdf' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Eliminar becas.pdf' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar: eliminar becas.pdf' }));

  expect(await screen.findByRole('button', { name: 'Fuente 1 no disponible (documento eliminado): becas.pdf, página 3' })).toBeTruthy();
  expect(screen.queryByTitle('Documento becas.pdf, página 3')).toBeNull();
  const card1 = screen.getByRole('article', { name: 'Fragmento 1' });
  expect(within(card1).getByText('Fuente no disponible (documento eliminado)')).toBeTruthy();
  expect(within(card1).queryByRole('button', { name: 'Abrir en el documento' })).toBeNull();
  expect(screen.getByText('La solicitud se presenta en septiembre.')).toBeTruthy();
});

test('an answer without evidence shows the "No recuerdo" card and no chips', async () => {
  const api = mockApi({
    documents: [documentItem()],
    chatEvents: [
      { type: 'text', text: 'El contexto recuperado no contiene información suficiente para responder a la pregunta.' },
      { type: 'final', text: 'El contexto recuperado no contiene información suficiente para responder a la pregunta.', citations: [] },
    ],
  });
  render(<AppShell fetchFn={api.fetchFn} />);
  await screen.findByRole('article', { name: 'becas.pdf' });
  fireEvent.change(screen.getByLabelText('Escribe tu pregunta'), { target: { value: '¿Capital de Francia?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar pregunta' }));

  expect(await screen.findByText('No encontré esto con seguridad en tus documentos.')).toBeTruthy();
  expect(screen.getByText('Prefiero decírtelo antes que inventar una respuesta.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /^Fuente / })).toBeNull();
});

test('the similarity is the score as a rounded percentage, and 0 when it is missing', () => {
  expect(similarityPercent(0.8734)).toBe(87);
  expect(similarityPercent(1.2)).toBe(100);
  expect(similarityPercent(-0.1)).toBe(0);
  expect(similarityPercent(Number.NaN)).toBe(0);
});
