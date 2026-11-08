import { resolve } from 'node:path';
import { createWorker } from 'tesseract.js';
import type { OcrLanguage, OcrProvider } from './ocr';

const LANGUAGE_CODE_MAP: Record<OcrLanguage, string> = {
  es: 'spa',
  en: 'eng',
};

// Tesseract downloads its language data on first use; keep it out of the project root.
export const TESSERACT_CACHE_DIR = resolve('.cache/tesseract');

// Local OCR provider using Tesseract.js (WebAssembly): images never leave this machine.
// Maps Spanish ('es') to 'spa' and English ('en') to 'eng'.
export class TesseractOcrProvider implements OcrProvider {
  async recognize(image: Uint8Array, languages: readonly OcrLanguage[] = ['es', 'en']): Promise<string> {
    if (image.byteLength === 0) {
      return '';
    }
    const tessLangs = languages.map((lang) => LANGUAGE_CODE_MAP[lang] ?? lang).join('+');
    const worker = await createWorker(tessLangs || 'spa+eng', 1, { cachePath: TESSERACT_CACHE_DIR });
    try {
      const ret = await worker.recognize(Buffer.from(image));
      return ret.data.text.trim();
    } finally {
      await worker.terminate();
    }
  }
}
