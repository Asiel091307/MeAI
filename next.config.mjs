import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export default {
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  // Tests that start their own `next dev` set NEXT_DIST_DIR so two servers never share `.next`.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Server-only packages loaded with plain Node require instead of being bundled:
  // pg has optional native bindings and the PDF/OCR packages load native or WASM code.
  serverExternalPackages: ['pg', 'pdfjs-dist', 'tesseract.js', '@napi-rs/canvas'],
};
