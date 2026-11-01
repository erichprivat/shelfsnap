import { BarcodeDetector as Ponyfill, prepareZXingModule } from "barcode-detector/ponyfill";

export type IsbnDetector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };

const wasmUrl = new URL("zxing-wasm/reader/zxing_reader.wasm", import.meta.url).href;

/** The browser's own detector where it reads EAN-13 (Chrome, Android); a WebAssembly one elsewhere (Safari, Firefox). */
export async function isbnDetector(): Promise<IsbnDetector> {
  const native = (globalThis as { BarcodeDetector?: typeof Ponyfill }).BarcodeDetector;
  const formats = await native?.getSupportedFormats().catch((): string[] => []);
  if (native && formats?.includes("ean_13")) return new native({ formats: ["ean_13"] });
  prepareZXingModule({
    overrides: { locateFile: (path, prefix) => (path.endsWith(".wasm") ? wasmUrl : prefix + path) },
  });
  return new Ponyfill({ formats: ["ean_13"] });
}

export const isIsbnBarcode = (value: string) => /^97[89]\d{10}$/.test(value);
