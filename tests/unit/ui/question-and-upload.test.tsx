// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { AppShell } from '../../../components/app-shell';
import { documentItem, mockApi, setWindowWidth, twoSourceAnswer } from './support/mock-api';

// Spec 004, RF-004-7, RF-004-8 and RF-004-10: question bar, uploads and drag and drop.
beforeEach(() => setWindowWidth(1280));
afterEach(() => {
  cleanup();
  setWindowWidth(1024);
});

const chatCalls = (api: ReturnType<typeof mockApi>) => api.calls.filter((call) => call.url === '/api/chat/answers');

test('an empty question shows the design message and never reaches the server', async () => {
  const api = mockApi({ documents: [documentItem()] });
  render(<AppShell fetchFn={api.fetchFn} />);
  await screen.findByRole('article', { name: 'becas.pdf' });

  fireEvent.change(screen.getByLabelText('Escribe tu pregunta'), { target: { value: '   ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar pregunta' }));

  expect(screen.getByRole('alert').textContent).toBe('Escribe una pregunta para consultar tus documentos.');
  expect(chatCalls(api)).toHaveLength(0);
});

test('without available documents the question is not sent', async () => {
  const api = mockApi({ documents: [documentItem({ status: 'processing' })] });
  render(<AppShell fetchFn={api.fetchFn} />);
  await screen.findByRole('article', { name: 'becas.pdf' });

  fireEvent.change(screen.getByLabelText('Escribe tu pregunta'), { target: { value: '¿Qué dice?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar pregunta' }));

  expect(screen.getByRole('alert').textContent).toBe('Todavía no hay documentos listos. Sube uno para empezar.');
  expect(chatCalls(api)).toHaveLength(0);
});

test('the counter follows the draft, Enter sends and Shift+Enter does not', async () => {
  const api = mockApi({ documents: [documentItem()], chatEvents: twoSourceAnswer });
  render(<AppShell fetchFn={api.fetchFn} />);
  await screen.findByRole('article', { name: 'becas.pdf' });
  const box = screen.getByLabelText('Escribe tu pregunta');

  fireEvent.change(box, { target: { value: 'Hola' } });
  expect(screen.getByText('4/1000')).toBeTruthy();
  expect(box.getAttribute('maxlength')).toBe('1000');

  fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
  expect(chatCalls(api)).toHaveLength(0);

  fireEvent.keyDown(box, { key: 'Enter' });
  await screen.findByText('La solicitud se presenta en septiembre.');
  expect(chatCalls(api)).toHaveLength(1);
  // The question appears in its bubble and, as the first question, in the conversation title.
  expect(screen.getAllByText('Hola').map((element) => element.className).sort()).toEqual([
    'bubble-user',
    'conversation-title',
  ]);
});

test('several files are uploaded one by one, and each rejection names its file', async () => {
  const api = mockApi({
    uploadResult: (file) =>
      file.name === 'foto.png'
        ? { status: 400, body: { error: 'El archivo no es un PDF. Solo se admiten documentos PDF.' } }
        : {
            status: 201,
            body: { document: documentItem({ id: `doc-${file.name}`, name: file.name, status: 'processing' }) },
          },
  });
  render(<AppShell fetchFn={api.fetchFn} pollIntervalMs={0} />);

  fireEvent.change(screen.getByLabelText('Subir documentos'), {
    target: {
      files: [
        new File(['%PDF-1.4'], 'notas.pdf', { type: 'application/pdf' }),
        new File(['x'], 'foto.png', { type: 'image/png' }),
      ],
    },
  });

  expect(await screen.findByRole('article', { name: 'notas.pdf' })).toBeTruthy();
  expect((await screen.findByRole('alert')).textContent).toBe(
    'foto.png: El archivo no es un PDF. Solo se admiten documentos PDF.',
  );
  expect(api.calls.filter((call) => call.method === 'POST' && call.url === '/api/documents')).toHaveLength(2);
  expect(screen.getByLabelText('Estado de notas.pdf').textContent).toBe('En procesamiento');
});

test('dragging files over the window shows the drop notice and dropping uploads them', async () => {
  const api = mockApi();
  const { container } = render(<AppShell fetchFn={api.fetchFn} pollIntervalMs={0} />);
  const shell = container.querySelector('.shell') as HTMLElement;
  const file = new File(['%PDF-1.4'], 'arrastrado.pdf', { type: 'application/pdf' });

  fireEvent.dragOver(shell, { dataTransfer: { types: ['Files'], files: [file] } });
  expect(screen.getByText('Suelta para agregar a tus documentos')).toBeTruthy();

  fireEvent.drop(shell, { dataTransfer: { types: ['Files'], files: [file] } });
  expect(screen.queryByText('Suelta para agregar a tus documentos')).toBeNull();
  expect(await screen.findByRole('article', { name: 'arrastrado.pdf' })).toBeTruthy();
});

test('with no documents the empty state offers the "Elegir archivos" drop zone', () => {
  render(<AppShell fetchFn={mockApi().fetchFn} />);
  expect(screen.getByText('Arrastra tus documentos aquí')).toBeTruthy();
  expect(screen.getByLabelText('Elegir archivos')).toBeTruthy();
});

test('a failed document shows its error chip and a Reintentar button that reprocesses it', async () => {
  const api = mockApi({ documents: [documentItem({ status: 'failed', error: 'El PDF está dañado.' })] });
  render(<AppShell fetchFn={api.fetchFn} pollIntervalMs={0} />);

  expect((await screen.findByRole('note')).textContent).toBe('El PDF está dañado.');
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar becas.pdf' }));
  await waitFor(() => expect(api.calls.some((call) => call.url === '/api/documents/doc-1/reprocess')).toBe(true));
  await waitFor(() => expect(screen.getByLabelText('Estado de becas.pdf').textContent).toBe('En procesamiento'));
});
