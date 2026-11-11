import { defineConfig } from 'vitest/config';

export default defineConfig({
  // React 19 components compile with the automatic JSX runtime, as in Next.js.
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['tests/unit/**/*.test.{ts,tsx,mjs}'],
    // RAG logic runs in plain Node. UI tests opt into a browser-like DOM per file with
    // `// @vitest-environment happy-dom` (spec 003).
    environment: 'node',
  },
});
