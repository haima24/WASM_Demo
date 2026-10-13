import { useEffect, useState } from 'react';
import { ExcelTab } from './components/ExcelTab';
import { ImageTab } from './components/ImageTab';
import { warmWasm } from './lib/engines';

export default function App() {
  const [tab, setTab] = useState<'image' | 'excel'>('image');
  const [initMs, setInitMs] = useState<number | null>(null);
  const [wasmError, setWasmError] = useState('');

  useEffect(() => {
    warmWasm().then(setInitMs).catch((e) => setWasmError(String(e)));
  }, []);

  return (
    <div className="app">
      <h1>Rust → WebAssembly vs traditional (JS / .NET)</h1>
      <p className="muted">
        {initMs !== null && `WASM module loaded + compiled once in ${initMs.toFixed(0)} ms (not included in the per-run timings). `}
        {wasmError && <span className="error">WASM failed to load: {wasmError} - did you run `npm run build:wasm`?</span>}
      </p>
      <nav className="tabs">
        <button className={tab === 'image' ? 'active' : ''} onClick={() => setTab('image')}>Image</button>
        <button className={tab === 'excel' ? 'active' : ''} onClick={() => setTab('excel')}>Excel / CSV</button>
      </nav>
      {tab === 'image' ? <ImageTab /> : <ExcelTab />}
    </div>
  );
}
