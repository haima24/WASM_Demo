import type { Engine, ExcelRun, ImageRun, Report, SourceImage } from './types';

// ---- tiny promise wrapper around a worker
let seq = 0;
class Remote {
  private pending = new Map<number, { res: (v: any) => void; rej: (e: Error) => void }>();
  constructor(private w: Worker) {
    w.onmessage = (e) => {
      const p = this.pending.get(e.data.id);
      if (!p) return;
      this.pending.delete(e.data.id);
      e.data.error ? p.rej(new Error(e.data.error)) : p.res(e.data);
    };
  }
  call(msg: object, transfer: Transferable[] = []): Promise<any> {
    const id = ++seq;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.w.postMessage({ ...msg, id }, transfer);
    });
  }
}

const jsRemote = new Remote(new Worker(new URL('../workers/jsWorker.ts', import.meta.url), { type: 'module' }));
const wasmRemote = new Remote(new Worker(new URL('../workers/wasmWorker.ts', import.meta.url), { type: 'module' }));

/** One-time WASM download + compile + instantiate (reported separately, not in per-run timings). */
export async function warmWasm(): Promise<number> {
  return (await wasmRemote.call({ kind: 'ping' })).initMs;
}

const clientMetrics = (engine: Engine, r: any) => ({
  engine,
  processingMs: r.processingMs as number,
  serverOverheadMs: 0,
  networkMs: 0,
  totalMs: r.processingMs as number,
  bytesSent: 0,
  bytesReceived: 0,
  memoryBytes: r.memoryBytes as number | undefined,
});

// ---- image
export async function runImageClient(engine: 'js' | 'wasm', src: SourceImage, filter: string): Promise<ImageRun> {
  const copy = src.pixels.slice(0); // keep the original reusable for the next run
  const r = await (engine === 'js' ? jsRemote : wasmRemote).call(
    { kind: 'image', pixels: copy, width: src.width, height: src.height, filter }, [copy]);
  return { ...clientMetrics(engine, r), image: new ImageData(new Uint8ClampedArray(r.pixels), src.width, src.height) };
}

export async function runImageServer(file: File, filter: string): Promise<ImageRun> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('filter', filter);
  const t0 = performance.now();
  const res = await fetch('/api/image/filter', { method: 'POST', body: fd });
  const blob = await res.blob();
  const totalMs = performance.now() - t0;
  if (!res.ok) throw new Error(`Server: ${res.status} ${await blob.text()}`);
  const st = parseServerTiming(res.headers.get('Server-Timing'));
  const image = await blobToImageData(blob); // not timed: only needed to display/compare
  return {
    engine: 'server',
    processingMs: st.process,
    serverOverheadMs: st.total - st.process,
    networkMs: totalMs - st.total,
    totalMs,
    bytesSent: file.size,
    bytesReceived: blob.size,
    image,
  };
}

// ---- excel / csv
export async function runExcelClient(engine: 'js' | 'wasm', file: File, bytes: ArrayBuffer): Promise<ExcelRun> {
  const copy = bytes.slice(0);
  const kind = file.name.toLowerCase().endsWith('.xlsx') ? 'xlsx' : 'csv';
  const r = await (engine === 'js' ? jsRemote : wasmRemote).call({ kind, bytes: copy }, [copy]);
  return { ...clientMetrics(engine, r), report: r.report as Report };
}

export async function runExcelServer(file: File): Promise<ExcelRun> {
  const fd = new FormData();
  fd.append('file', file);
  const t0 = performance.now();
  const res = await fetch('/api/excel/validate', { method: 'POST', body: fd });
  const text = await res.text();
  const totalMs = performance.now() - t0;
  if (!res.ok) throw new Error(`Server: ${res.status} ${text}`);
  const st = parseServerTiming(res.headers.get('Server-Timing'));
  return {
    engine: 'server',
    processingMs: st.process,
    serverOverheadMs: st.total - st.process,
    networkMs: totalMs - st.total,
    totalMs,
    bytesSent: file.size,
    bytesReceived: new Blob([text]).size,
    report: JSON.parse(text) as Report,
  };
}

export async function fetchSample(rows: number, format: 'csv' | 'xlsx'): Promise<File> {
  const res = await fetch(`/api/sample?rows=${rows}&format=${format}`);
  if (!res.ok) throw new Error(`Sample: ${res.status}`);
  return new File([await res.blob()], `sample_${rows}.${format}`);
}

// ---- helpers
function parseServerTiming(h: string | null): { process: number; total: number } {
  const get = (name: string) => {
    const m = h?.match(new RegExp(`${name};dur=([\\d.]+)`));
    return m ? parseFloat(m[1]) : 0;
  };
  return { process: get('process'), total: get('total') };
}

function bitmapToImageData(bmp: ImageBitmap): ImageData {
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  return ctx.getImageData(0, 0, bmp.width, bmp.height);
}

export async function blobToImageData(blob: Blob): Promise<ImageData> {
  // 'none' = ignore EXIF rotation so browser and server see the same pixel grid
  return bitmapToImageData(await createImageBitmap(blob, { imageOrientation: 'none' }));
}

/** % of pixels whose RGB channels all match within `tol`. */
export function imageMatchPercent(a: ImageData, b: ImageData, tol = 2): number {
  if (a.width !== b.width || a.height !== b.height) return 0;
  let same = 0;
  const n = a.width * a.height;
  for (let i = 0; i < n * 4; i += 4) {
    if (Math.abs(a.data[i] - b.data[i]) <= tol && Math.abs(a.data[i + 1] - b.data[i + 1]) <= tol &&
        Math.abs(a.data[i + 2] - b.data[i + 2]) <= tol) same++;
  }
  return (same / n) * 100;
}

/** 1 warm-up run (JIT / WASM tier-up / server JIT) + `runs` timed runs; returns the median by total time. */
export async function medianRun<T extends { totalMs: number }>(fn: () => Promise<T>, runs: number): Promise<T> {
  await fn();
  const rs: T[] = [];
  for (let i = 0; i < runs; i++) rs.push(await fn());
  rs.sort((a, b) => a.totalMs - b.totalMs);
  return rs[Math.floor(rs.length / 2)];
}
