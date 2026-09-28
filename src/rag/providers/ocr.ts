export type OcrLanguage = 'es' | 'en';

export interface OcrProvider {
  recognize(image: Uint8Array, languages: readonly OcrLanguage[]): Promise<string>;
}
