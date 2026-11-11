import { defineConfig } from 'vitest/config';

// Node 22+ ships its own experimental `localStorage` global (undefined unless configured with
// --localstorage-file). It shadows happy-dom's working localStorage in UI tests, so it is
// turned off there. Node 20, used by the Docker image, does not know this flag.
const nodeMajor = Number(process.versions.node.split('.')[0]);
const execArgv = nodeMajor >= 22 ? ['--no-experimental-webstorage'] : [];

export default defineConfig({
  // React 19 components compile with the automatic JSX runtime, as in Next.js.
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['tests/unit/**/*.test.{ts,tsx,mjs}'],
    // RAG logic runs in plain Node. UI tests opt into a browser-like DOM per file with
    // `// @vitest-environment happy-dom` (spec 003).
    environment: 'node',
    poolOptions: {
      forks: { execArgv },
    },
  },
});
