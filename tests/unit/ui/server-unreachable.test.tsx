// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { AppShell } from '../../../components/app-shell';

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
  render(<AppShell fetchFn={unreachable} pollIntervalMs={0} />);
  const input = screen.getByLabelText('Subir documentos');
  fireEvent.change(input, {
    target: { files: [new File(['%PDF-1.4'], 'notas.pdf', { type: 'application/pdf' })] },
  });

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('notas.pdf');
  expect(alert.textContent).toContain('No se pudo conectar con MeAI');
  expect(alert.textContent).toContain('docker compose up -d');
});

test('asking while the server is unreachable explains how to start MeAI', async () => {
  render(<AppShell fetchFn={unreachable} pollIntervalMs={0} />);
  fireEvent.change(screen.getByLabelText('Escribe tu pregunta'), {
    target: { value: '¿Qué dice el documento?' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar pregunta' }));

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('No se pudo conectar con MeAI');
  expect(alert.textContent).toContain('docker compose up -d');
});
