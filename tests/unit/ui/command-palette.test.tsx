// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { AppShell } from '../../../components/app-shell';
import { documentItem, mockApi, setWindowWidth, twoSourceAnswer } from './support/mock-api';

// Spec 004, RF-004-9: the Ctrl/⌘+K command palette.
beforeEach(() => setWindowWidth(1280));
afterEach(() => {
  cleanup();
  setWindowWidth(1024);
});

test('Ctrl+K and the Buscar button open the palette; Ctrl+K again and Escape close it', async () => {
  render(<AppShell fetchFn={mockApi({ documents: [documentItem()] }).fetchFn} />);
  await screen.findByRole('article', { name: 'becas.pdf' });

  fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
  expect(screen.getByRole('dialog', { name: 'Paleta de comandos' })).toBeTruthy();
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
  expect(screen.queryByRole('dialog', { name: 'Paleta de comandos' })).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: /Buscar…/ }));
  expect(screen.getByPlaceholderText('Buscar documentos, espacios o acciones…')).toBeTruthy();
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByRole('dialog', { name: 'Paleta de comandos' })).toBeNull();
});

test('the palette filters commands and says when nothing matches', async () => {
  render(<AppShell fetchFn={mockApi({ documents: [documentItem()] }).fetchFn} />);
  await screen.findByRole('article', { name: 'becas.pdf' });
  fireEvent.keyDown(window, { key: 'k', metaKey: true });

  expect(screen.getByRole('button', { name: /Nueva conversación/ })).toBeTruthy();
  const input = screen.getByLabelText('Buscar comandos');
  fireEvent.change(input, { target: { value: 'becas' } });
  expect(screen.queryByRole('button', { name: /Nueva conversación/ })).toBeNull();
  expect(screen.getByRole('button', { name: /becas\.pdf\s*Documento/ })).toBeTruthy();

  fireEvent.change(input, { target: { value: 'zzz' } });
  expect(screen.getByText('Nada coincide con esa búsqueda.')).toBeTruthy();
});

test('choosing a document opens its PDF, and "Nueva conversación" clears the chat', async () => {
  const api = mockApi({ documents: [documentItem()], chatEvents: twoSourceAnswer });
  render(<AppShell fetchFn={api.fetchFn} />);
  await screen.findByRole('article', { name: 'becas.pdf' });

  fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
  fireEvent.click(screen.getByRole('button', { name: /becas\.pdf\s*Documento/ }));
  expect(screen.getByTitle('Documento becas.pdf, página 1')).toBeTruthy();
  expect(screen.queryByRole('dialog', { name: 'Paleta de comandos' })).toBeNull();

  fireEvent.change(screen.getByLabelText('Escribe tu pregunta'), { target: { value: '¿Cuándo?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar pregunta' }));
  await screen.findByText('La solicitud se presenta en septiembre.');

  fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
  fireEvent.click(screen.getByRole('button', { name: /Nueva conversación/ }));
  expect(screen.queryByText('La solicitud se presenta en septiembre.')).toBeNull();
  expect(screen.getByRole('heading', { name: '¿Qué necesitas recordar?' })).toBeTruthy();
});
