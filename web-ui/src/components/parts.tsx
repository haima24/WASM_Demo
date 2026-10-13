import { useEffect, useRef, type ReactNode } from 'react';
import { fmtBytes, fmtMs } from '../lib/format';
import { ENGINE_LABEL, type Engine, type RunMetrics } from '../lib/types';

export function Panel(props: { title: string; subtitle: string; accent: 'left' | 'right'; children: ReactNode }) {
  return (
    <section className={`panel ${props.accent}`}>
      <header>
        <h2>{props.title}</h2>
        <small>{props.subtitle}</small>
      </header>
      {props.children}
    </section>
  );
}

export function MetricsTable({ m, serverLabels }: { m: RunMetrics | null; serverLabels: [string, string] }) {
  if (!m) return <p className="muted">No result yet.</p>;
  const isServer = m.engine === 'server';
  const rows: [string, string, boolean?][] = [
    ['Upload + download', isServer ? fmtMs(m.networkMs) : '0 ms (no network)'],
    [serverLabels[0], isServer ? fmtMs(m.serverOverheadMs) : '-'],
    [serverLabels[1], fmtMs(m.processingMs)],
    ['TOTAL (what the user waits)', fmtMs(m.totalMs), true],
    ['Data sent', fmtBytes(m.bytesSent)],
    ['Data received', fmtBytes(m.bytesReceived)],
    ['Memory (engine-reported)', fmtBytes(m.memoryBytes)],
  ];
  return (
    <table className="metrics">
      <tbody>
        {rows.map(([k, v, hl]) => (
          <tr key={k} className={hl ? 'total' : ''}><td>{k}</td><td>{v}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

export function ImageCanvas({ data }: { data: ImageData | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !data) return;
    c.width = data.width;
    c.height = data.height;
    c.getContext('2d')!.putImageData(data, 0, 0);
  }, [data]);
  return data ? <canvas ref={ref} className="preview" /> : <div className="preview empty">result appears here</div>;
}

export function Banner({ left, right, extra }: { left: RunMetrics | null; right: RunMetrics | null; extra?: ReactNode }) {
  if (!left || !right) return null;
  const total = left.totalMs / right.totalMs;
  const proc = left.processingMs / right.processingMs;
  const word = (r: number) => (r >= 1 ? `${r.toFixed(1)}× faster` : `${(1 / r).toFixed(1)}× slower`);
  return (
    <div className="banner">
      <strong>Rust/WASM vs {ENGINE_LABEL[left.engine]}:</strong>{' '}
      end-to-end {word(total)} · compute only {word(proc)}
      {extra && <div>{extra}</div>}
    </div>
  );
}

const COLORS: Record<Engine, string> = { js: '#d9a21b', server: '#d9534f', wasm: '#2f9e6f' };

export function BarChart({ results }: { results: Partial<Record<Engine, RunMetrics>> }) {
  const items = (Object.keys(results) as Engine[]).map((e) => ({ e, v: results[e]!.totalMs }));
  if (!items.length) return null;
  const max = Math.max(...items.map((i) => i.v));
  return (
    <div className="chart">
      <h3>Total time by engine (last run of each)</h3>
      {items.map(({ e, v }) => (
        <div className="bar-row" key={e}>
          <span className="bar-label">{ENGINE_LABEL[e]}</span>
          <div className="bar-track"><div className="bar" style={{ width: `${(v / max) * 100}%`, background: COLORS[e] }} /></div>
          <span className="bar-val">{fmtMs(v)}</span>
        </div>
      ))}
    </div>
  );
}
