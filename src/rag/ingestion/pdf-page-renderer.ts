import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

interface NodeCanvas {
  toBuffer(mimeType: 'image/png'): Uint8Array;
}

interface CanvasAndContext {
  canvas: NodeCanvas;
  context: CanvasRenderingContext2D;
}

interface CanvasFactory {
  create(width: number, height: number): CanvasAndContext;
  destroy(canvasAndContext: CanvasAndContext): void;
}

// Renders one PDF page (1-indexed) to a PNG image.
// The canvas comes from pdf.js's own Node canvas factory: pdf.js loads its own copy of
// @napi-rs/canvas, and mixing canvases from two native copies corrupts memory.
export async function renderPdfPageToImage(
  bytes: Uint8Array,
  pageNumber: number,
  scale = 2,
): Promise<Uint8Array> {
  const loadingTask = getDocument({ data: bytes.slice(), isEvalSupported: false });
  try {
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvasFactory = (pdf as unknown as { canvasFactory: CanvasFactory }).canvasFactory;
    const target = canvasFactory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
    try {
      await page.render({
        canvas: null,
        canvasContext: target.context,
        viewport,
      }).promise;
      return Uint8Array.from(target.canvas.toBuffer('image/png'));
    } finally {
      canvasFactory.destroy(target);
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
}
