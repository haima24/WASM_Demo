import { useState } from 'react';
import { blobToImageData, imageMatchPercent, medianRun, runImageClient, runImageServer } from '../lib/engines';
import type { Engine, ImageRun, SourceImage } from '../lib/types';
import { Banner, BarChart, ImageCanvas, MetricsTable, Panel } from './parts';

const FILTERS = ['grayscale', 'blur', 'sharpen', 'edge'];

export function ImageTab() {
  const [file, setFile] = useState<File | null>(null);
  const [src, setSrc] = useState<SourceImage | null>(null);
  const [filter, setFilter] = useState('blur');
  const [runs, setRuns] = useState(3);
  const [leftEngine, setLeftEngine] = useState<'js' | 'server'>('js');
  const [left, setLeft] = useState<ImageRun | null>(null);
  const [right, setRight] = useState<ImageRun | null>(null);
  const [history, setHistory] = useState<Partial<Record<Engine, ImageRun>>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function onFile(f: File) {
    setFile(f); setLeft(null); setRight(null); setHistory({}); setError('');
    const img = await blobToImageData(f);
    setSrc({ pixels: img.data.buffer.slice(0) as ArrayBuffer, width: img.width, height: img.height });
  }

  const record = (r: ImageRun) => setHistory((h) => ({ ...h, [r.engine]: r }));

  async function runLeft() {
    if (!file || !src) return;
    setBusy(`Running ${leftEngine === 'js' ? 'JavaScript' : 'C# server'}…`);
    const r = await medianRun(() => (leftEngine === 'js' ? runImageClient('js', src, filter) : runImageServer(file, filter)), runs);
    setLeft(r); record(r);
  }
  async function runRight() {
    if (!src) return;
    setBusy('Running Rust/WASM…');
    const r = await medianRun(() => runImageClient('wasm', src, filter), runs);
    setRight(r); record(r);
  }
  async function go(which: 'left' | 'right' | 'both') {
    setError('');
    try {
      if (which !== 'right') await runLeft();
      if (which !== 'left') await runRight();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy('');
    }
  }

  const match = left && right ? imageMatchPercent(left.image, right.image) : null;

  return (
    <>
      <div className="controls">
        <label>Image <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} /></label>
        <label>Filter <select value={filter} onChange={(e) => setFilter(e.target.value)}>{FILTERS.map((f) => <option key={f}>{f}</option>)}</select></label>
        <label>Timed runs <input type="number" min={1} max={10} value={runs} onChange={(e) => setRuns(+e.target.value || 1)} /></label>
        <label>Traditional =
          <select value={leftEngine} onChange={(e) => setLeftEngine(e.target.value as 'js' | 'server')}>
            <option value="js">JavaScript (browser)</option>
            <option value="server">C# .NET API (server)</option>
          </select>
        </label>
        <button disabled={!src || !!busy} onClick={() => go('both')}>▶ Run both</button>
        <button className="ghost" disabled={!src || !!busy} onClick={() => go('left')}>Left only</button>
        <button className="ghost" disabled={!src || !!busy} onClick={() => go('right')}>Right only</button>
      </div>
      {src && <p className="muted">{src.width}×{src.height} px ({((src.width * src.height) / 1e6).toFixed(1)} MP) · file {(file!.size / 1024 / 1024).toFixed(1)} MB · 1 warm-up + {runs} timed runs, median shown</p>}
      {busy && <p className="busy">{busy}</p>}
      {error && <p className="error">{error}</p>}

      <div className="split">
        <Panel title="TRADITIONAL" subtitle={leftEngine === 'js' ? 'JavaScript in the browser' : 'Upload → C# (.NET) → download'} accent="left">
          <ImageCanvas data={left?.image ?? null} />
          <MetricsTable m={left} serverLabels={['Server overhead (decode + encode)', 'Filter compute']} />
        </Panel>
        <Panel title="NEW: Rust → WASM" subtitle="Runs 100% in the browser, nothing uploaded" accent="right">
          <ImageCanvas data={right?.image ?? null} />
          <MetricsTable m={right} serverLabels={['Server overhead', 'Filter compute (incl. JS↔WASM copy)']} />
        </Panel>
      </div>

      <Banner left={left} right={right}
        extra={match !== null && <span className={match > 99.9 ? 'ok' : 'warn'}>Output match: {match.toFixed(2)}% of pixels within ±2 per channel</span>} />
      <BarChart results={history} />
    </>
  );
}
