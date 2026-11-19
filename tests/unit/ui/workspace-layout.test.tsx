// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { AppShell, layoutForWidth } from '../../../components/app-shell';
import { mockApi, setWindowWidth } from './support/mock-api';

// Spec 004, RF-004-1: three panels and the desk / tablet / mobile layouts of the design.
beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  setWindowWidth(1024);
});

test('the breakpoints are 1180 px (desk) and 760 px (mobile)', () => {
  expect(layoutForWidth(1180)).toBe('desk');
  expect(layoutForWidth(1179)).toBe('tablet');
  expect(layoutForWidth(760)).toBe('tablet');
  expect(layoutForWidth(759)).toBe('mobile');
});

test('on a desk screen the three regions are visible and the evidence starts empty', () => {
  setWindowWidth(1280);
  render(<AppShell fetchFn={mockApi().fetchFn} />);

  expect(screen.getByRole('complementary', { name: 'Biblioteca' })).toBeTruthy();
  expect(screen.getByRole('main', { name: 'Conversación' })).toBeTruthy();
  expect(screen.getByRole('complementary', { name: 'Evidencia' })).toBeTruthy();
  expect(screen.getByText('Aquí verás los fragmentos de tus documentos en los que se apoya cada respuesta.')).toBeTruthy();
  expect(screen.getByRole('heading', { name: '¿Qué necesitas recordar?' })).toBeTruthy();
});

test('on a tablet the evidence is a closed drawer that opens with its button and closes with Escape', () => {
  setWindowWidth(900);
  render(<AppShell fetchFn={mockApi().fetchFn} />);
  expect(screen.queryByRole('complementary', { name: 'Evidencia' })).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Evidencia' }));
  expect(screen.getByRole('complementary', { name: 'Evidencia' })).toBeTruthy();

  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByRole('complementary', { name: 'Evidencia' })).toBeNull();
});

test('on a phone the library is a drawer opened by the Biblioteca button, with 44 px touch targets', () => {
  setWindowWidth(500);
  const { container } = render(<AppShell fetchFn={mockApi().fetchFn} />);
  expect(container.querySelector('.shell')?.getAttribute('data-layout')).toBe('mobile');
  expect(screen.queryByRole('complementary', { name: 'Biblioteca' })).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Biblioteca' }));
  expect(screen.getByRole('complementary', { name: 'Biblioteca' })).toBeTruthy();
  expect(screen.queryByRole('separator', { name: 'Cambiar ancho de la Biblioteca' })).toBeNull();
});

test('dragging the library edge changes its width between 220 and 640, saves it and double click resets it', () => {
  setWindowWidth(1280);
  render(<AppShell fetchFn={mockApi().fetchFn} />);
  const library = screen.getByRole('complementary', { name: 'Biblioteca' });
  const handle = screen.getByRole('separator', { name: 'Cambiar ancho de la Biblioteca' });
  expect(library.style.width).toBe('280px');

  fireEvent.pointerDown(handle, { clientX: 280 });
  act(() => {
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 400 }));
    window.dispatchEvent(new PointerEvent('pointerup', {}));
  });
  expect(library.style.width).toBe('400px');
  expect(window.localStorage.getItem('meai-libw')).toBe('400');

  fireEvent.pointerDown(handle, { clientX: 400 });
  act(() => {
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 2000 }));
    window.dispatchEvent(new PointerEvent('pointerup', {}));
  });
  expect(library.style.width).toBe('640px');

  fireEvent.doubleClick(handle);
  expect(library.style.width).toBe('280px');
  expect(window.localStorage.getItem('meai-libw')).toBe('280');
});

test('a saved library width is restored', () => {
  window.localStorage.setItem('meai-libw', '350');
  setWindowWidth(1280);
  render(<AppShell fetchFn={mockApi().fetchFn} />);
  expect(screen.getByRole('complementary', { name: 'Biblioteca' }).style.width).toBe('350px');
});

test('the footer shows the configured provider with its privacy note (spec 012)', async () => {
  setWindowWidth(1280);
  render(<AppShell fetchFn={mockApi().fetchFn} />);
  const footer = (await screen.findByText('Gemini · gemini-3.5-flash-lite')).parentElement;
  expect(footer?.getAttribute('title')).toContain('Google puede usar el texto enviado');
  expect(footer?.querySelector('.plan-dot')?.getAttribute('data-tone')).toBe('warn');
});

test('missing variables and documents indexed with another model are announced (spec 012)', async () => {
  setWindowWidth(1280);
  const settings = {
    embedding: { provider: 'openai-compatible', model: 'nomic-embed-text', dimensions: 768, privacy: 'local' },
    generation: { provider: 'openai-compatible', model: 'gpt-4o-mini', privacy: 'external' },
    missing: ['OPENAI_API_KEY'],
    documentsWithOtherModel: 3,
  };
  render(<AppShell fetchFn={mockApi({ settings }).fetchFn} />);
  expect(await screen.findByText('Falta configurar OPENAI_API_KEY en .env.')).toBeTruthy();
  expect(
    screen.getByText('3 documentos se indexaron con otro modelo de embeddings. Reprocésalos para poder consultarlos.'),
  ).toBeTruthy();
  const footer = screen.getByText('Compatible OpenAI · gpt-4o-mini').parentElement;
  expect(footer?.querySelector('.plan-dot')?.getAttribute('data-tone')).toBe('error');
});
