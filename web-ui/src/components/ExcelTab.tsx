import { useState } from 'react';
import { fetchSample, medianRun, runExcelClient, runExcelServer } from '../lib/engines';
import type { Engine, ExcelRun, Report } from '../lib/types';
import { Banner, BarChart, MetricsTable, Panel } from './parts';

function ReportView({ r }: { r: Report | null }) {
  if (!r) return null;
  return (
    <div className="report">
      <div className="kpis">
        <span><b>{r.totalRows.toLocaleString()}</b> rows</span>
        <span className={r.invalidRows ? 'warn' : 'ok'}><b>{r.invalidRows.toLocaleString()}</b> invalid</span>
        <span>sum <b>{r.sumAmount.toFixed(2)}</b></span>
        <span>avg <b>{r.avgAmount.toFixed(2)}</b></span>
      </div>
      <table className="errors">
        <thead><tr><th>Row</th><th>Column</th><th>Problem</th></tr></thead>
        <tbody>{r.errors.slice(0, 6).map((e) => <tr key={e.row}><td>{e.row}</td><td>{e.column}</td><td>{e.message}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

export function ExcelTab() {
  const [file, setFile] = useState<File | null>(null);
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [runs, setRuns] = useState(3);
  const [leftEngine, setLeftEngine] = useState<'js' | 'server'>('js');
  const [sampleRows, setSampleRows] = useState(100000);
  const [sampleFmt, setSampleFmt] = useState<'csv' | 'xlsx'>('csv');
  const [left, setLeft] = useState<ExcelRun | null>(null);
  const [right, setRight] = useState<ExcelRun | null>(null);
  const [history, setHistory] = useState<Partial<Record<Engine, ExcelRun>>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function load(f: File) {
    setFile(f); setLeft(null); setRight(null); setHistory({}); setError('');
    setBytes(await f.arrayBuffer());
  }
  async function makeSample() {
    setError(''); setBusy('Generating sample on the server…');
    try { await load(await fetchSample(sampleRows, sampleFmt)); } catch (e) { setError(String(e)); } finally { setBusy(''); }
  }

  const record = (r: ExcelRun) => setHistory((h) => ({ ...h, [r.engine]: r }));

  async function go(which: 'left' | 'right' | 'both') {
    if (!file || !bytes) return;
    setError('');
    try {
      if (which !== 'right') {
        setBusy(`Running ${leftEngine === 'js' ? 'JavaScript' : 'C# server'}…`);
        const r = await medianRun(() => (leftEngine === 'js' ? runExcelClient('js', file, bytes) : runExcelServer(file)), runs);
        setLeft(r); record(r);
      }
      if (which !== 'left') {
        setBusy('Running Rust/WASM…');
        const r = await medianRun(() => runExcelClient('wasm', file, bytes), runs);
        setRight(r); record(r);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy('');
    }
  }

  const same = left && right
    ? left.report.totalRows === right.report.totalRows &&
      left.report.invalidRows === right.report.invalidRows &&
      Math.abs(left.report.sumAmount - right.report.sumAmount) < 0.01
    : null;
  const rowsPerSec = (r: ExcelRun | null) => (r ? Math.round(r.report.totalRows / (r.totalMs / 1000)).toLocaleString() : '-');

  return (
    <>
      <div className="controls">
        <label>File <input type="file" accept=".csv,.xlsx" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} /></label>
        <label>…or sample
          <select value={sampleRows} onChange={(e) => setSampleRows(+e.target.value)}>
            {[10000, 100000, 500000].map((n) => <option key={n} value={n}>{n.toLocaleString()} rows</option>)}
          </select>
          <select value={sampleFmt} onChange={(e) => setSampleFmt(e.target.value as 'csv' | 'xlsx')}><option>csv</option><option>xlsx</option></select>
          <button className="ghost" disabled={!!busy} onClick={makeSample}>Generate</button>
        </label>
        <label>Timed runs <input type="number" min={1} max={10} value={runs} onChange={(e) => setRuns(+e.target.value || 1)} /></label>
        <label>Traditional =
          <select value={leftEngine} onChange={(e) => setLeftEngine(e.target.value as 'js' | 'server')}>
            <option value="js">JavaScript (CSV only)</option>
            <option value="server">C# .NET API (server)</option>
          </select>
        </label>
        <button disabled={!bytes || !!busy} onClick={() => go('both')}>▶ Run both</button>
        <button className="ghost" disabled={!bytes || !!busy} onClick={() => go('left')}>Left only</button>
        <button className="ghost" disabled={!bytes || !!busy} onClick={() => go('right')}>Right only</button>
      </div>
      {file && <p className="muted">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB · 1 warm-up + {runs} timed runs, median shown</p>}
      {busy && <p className="busy">{busy}</p>}
      {error && <p className="error">{error}</p>}

      <div className="split">
        <Panel title="TRADITIONAL" subtitle={leftEngine === 'js' ? 'JavaScript in the browser' : 'Upload file → C# validates → JSON back'} accent="left">
          <ReportView r={left?.report ?? null} />
          <MetricsTable m={left} serverLabels={['Server overhead', 'Parse + validate']} />
          {left && <p className="muted">Throughput: {rowsPerSec(left)} rows/s (end-to-end)</p>}
        </Panel>
        <Panel title="NEW: Rust → WASM" subtitle="Validated locally; invalid data never needs uploading" accent="right">
          <ReportView r={right?.report ?? null} />
          <MetricsTable m={right} serverLabels={['Server overhead', 'Parse + validate (incl. JS↔WASM copy)']} />
          {right && <p className="muted">Throughput: {rowsPerSec(right)} rows/s (end-to-end)</p>}
        </Panel>
      </div>

      <Banner left={left} right={right}
        extra={same !== null && <span className={same ? 'ok' : 'warn'}>{same ? '✔ Both engines produced identical totals' : '✖ Results differ - check the rules'}</span>} />
      <BarChart results={history} />
    </>
  );
}
