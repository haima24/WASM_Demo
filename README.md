# Rust → WASM vs traditional (JS / .NET)

Split-screen demo: the **same work** (image filters, CSV/XLSX validation) done the traditional way (left) and
with Rust compiled to WebAssembly in the browser (right), with metrics for each side.

```
rust-core/    Rust crate -> wasm-pack -> web-ui/src/wasm   (apply_filter, validate_csv, validate_xlsx)
web-ui/       React + Vite: split-screen UI, JS + WASM Web Workers, charts
dotnet-api/   ASP.NET Core minimal API (server path) + sample-data generator
benchmarks/   put your recorded results / screenshots here
```

## One-time setup
1. Rust: https://rustup.rs  then `rustup target add wasm32-unknown-unknown`
2. `cargo install wasm-pack`
3. `cd web-ui && npm install`

## Run
```powershell
# terminal 1 - server path (http://localhost:5080)
cd dotnet-api; dotnet run

# terminal 2 - build WASM once (re-run after editing Rust), then the UI (http://localhost:5173)
cd web-ui; npm run build:wasm; npm run dev
```

## How the comparison stays fair
- All three engines use the **same integer algorithms / validation rules**; the UI shows an *output match* check.
- JS and WASM run in **Web Workers**; WASM load+compile is shown separately (one-time cost).
- Each side: 1 warm-up + N timed runs, **median** reported.
- Server path: `Server-Timing` header splits compute from network, so *Total* = what the user actually waits.
- WASM "compute" includes the JS↔WASM copy of input/output (the real boundary cost).

## Known limits (good material for the "cons" slide)
- JS engine has no xlsx parser (CSV only); xlsx = WASM (`calamine`) vs server (`ClosedXML`).
- Browser decode time of the image is not included in any engine's timing.
- `performance.memory` is Chrome-only; server memory is not reported.
- Hand-rolled CSV splitting in JS/C# does not support newlines inside quoted fields.
- ImageSharp is under the Six Labors Split License (fine for demos / OSS).
