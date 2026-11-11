import { DocumentsPanel } from '../components/documents-panel';

export default function HomePage() {
  return (
    <main>
      <h1>MeAI</h1>
      <p>Consulta tus documentos PDF.</p>
      <DocumentsPanel />
    </main>
  );
}
