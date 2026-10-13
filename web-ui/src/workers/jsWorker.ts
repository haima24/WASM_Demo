import { applyFilter } from '../lib/filters';
import { validateCsv } from '../lib/csv';

// Plain JavaScript engine, run in a worker so it is timed under the same conditions as the WASM worker.
const ctx = self as any;

ctx.onmessage = (e: MessageEvent) => {
  const m = e.data;
  try {
    const t0 = performance.now();
    if (m.kind === 'image') {
      const out = applyFilter(new Uint8Array(m.pixels), m.width, m.height, m.filter);
      const processingMs = performance.now() - t0;
      ctx.postMessage({ id: m.id, processingMs, memoryBytes: (performance as any).memory?.usedJSHeapSize, pixels: out.buffer }, [out.buffer]);
    } else if (m.kind === 'csv') {
      const report = validateCsv(new Uint8Array(m.bytes));
      ctx.postMessage({ id: m.id, processingMs: performance.now() - t0, memoryBytes: (performance as any).memory?.usedJSHeapSize, report });
    } else {
      throw new Error('JS engine has no xlsx parser in this demo (CSV only)');
    }
  } catch (err) {
    ctx.postMessage({ id: m.id, error: String(err) });
  }
};
