// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { ChatPanel } from '../../../components/chat-panel';
import { PdfUploader } from '../../../components/pdf-uploader';

// When the server is down (Docker stopped, PC restarted, app still starting) fetch rejects.
// The user must learn what is wrong and how to fix it, not only "connection error".
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const unreachable = vi.fn<typeof fetch>(async () => {
  throw new TypeError('Failed to fetch');
});

test('uploading while the server is unreachable explains how to start MeAI', async () => {
  render(<PdfUploader fetchFn={unreachable} />);
  const input = screen.getByLabelText('Seleccionar archivo PDF');
  fireEvent.change(input, {
    target: { files: [new File(['%PDF-1.4'], 'notas.pdf', { type: 'application/pdf' })] },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Subir PDF' }));

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('No se pudo conectar con MeAI');
  expect(alert.textContent).toContain('docker compose up -d');
});

test('asking while the server is unreachable explains how to start MeAI', async () => {
  render(<ChatPanel fetchFn={unreachable} />);
  fireEvent.change(screen.getByLabelText(/pregunta/i), { target: { value: '¿Qué dice el documento?' } });
  fireEvent.click(screen.getByRole('button', { name: /enviar pregunta/i }));

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('No se pudo conectar con MeAI');
  expect(alert.textContent).toContain('docker compose up -d');
});
