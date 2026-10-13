export type Engine = 'js' | 'server' | 'wasm';

export interface RowError { row: number; column: string; message: string }
export interface Report {
  totalRows: number;
  invalidRows: number;
  sumAmount: number;
  avgAmount: number;
  errors: RowError[];
}

export interface RunMetrics {
  engine: Engine;
  processingMs: number;      // the actual filter / parse+validate work
  serverOverheadMs: number;  // server only: decode/encode or request handling
  networkMs: number;         // server only: upload + download (round trip minus server time)
  totalMs: number;           // what the user waits for
  bytesSent: number;
  bytesReceived: number;
  memoryBytes?: number;      // engine-reported, best effort
}

export interface SourceImage { pixels: ArrayBuffer; width: number; height: number }
export interface ImageRun extends RunMetrics { image: ImageData }
export interface ExcelRun extends RunMetrics { report: Report }

export const ENGINE_LABEL: Record<Engine, string> = {
  js: 'JavaScript (browser)',
  server: 'C# / .NET API (server)',
  wasm: 'Rust → WASM (browser)',
};
