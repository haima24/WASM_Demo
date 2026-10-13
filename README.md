# Rust → WebAssembly vs traditional (JavaScript / .NET)

A split-screen demo that does the **same work** two ways and measures both:

- **Left, traditional:** JavaScript in the browser, or a C# (.NET) server (upload → process → download).
- **Right, new:** Rust compiled to WebAssembly (WASM), running in the browser. Nothing is uploaded.

Workloads: **image filters** on a 12 MP photo and **CSV / XLSX validation** of 100,000 rows.
Slides and a recorded demo are in [`docs/`](docs/).

## Project layout

| Path | What it is |
|---|---|
| [`rust-core/`](rust-core/) | Rust crate built to WASM: `apply_filter`, `validate_csv`, `validate_xlsx` |
| [`web-ui/`](web-ui/) | React + Vite split-screen UI; JS and WASM engines run in Web Workers |
| [`dotnet-api/`](dotnet-api/) | ASP.NET Core API (.NET 10): the server path and a sample-data generator |
| [`benchmarks/`](benchmarks/) | Sample inputs: 4000×3000 PNG, 100k-row CSV and XLSX |
| [`docs/`](docs/) | Presentation, demo video, screenshots |

## Run it

Prerequisites: Node.js, .NET SDK 10, Rust ([rustup](https://rustup.rs)) with `rustup target add wasm32-unknown-unknown`.

```powershell
.\run.ps1              # installs deps, builds WASM, starts API (:5080) and UI (:5173)
.\run.ps1 -SkipWasm    # reuse the existing WASM build
.\run.ps1 -SkipApi     # UI only (JS vs WASM)
```

Or manually:

```powershell
cd dotnet-api; dotnet run                                  # terminal 1
cd web-ui; npm install; npm run build:wasm; npm run dev    # terminal 2
```

`web-ui/src/wasm/` is generated and git-ignored, so build the WASM at least once before `npm run dev`.

Then open <http://localhost:5173>, pick a file from `benchmarks/`, choose what "Traditional" means (JavaScript or C# server)
and press **Run both**. The banner shows the speed-up and an *output match* check.

## How the comparison stays fair

- All three engines use the **same integer algorithms and validation rules**; the UI verifies the outputs match.
- JS and WASM run in **Web Workers**; WASM load + compile (~30 ms, 539 KB) is reported separately.
- 1 warm-up + N timed runs, **median** reported.
- The server's `Server-Timing` header separates compute from network, so *Total* is what the user waits.
- WASM timing **includes** the JS ↔ WASM data copy.

## Known limits

- The JS engine has no xlsx parser: XLSX compares WASM (`calamine`) with the server (`ClosedXML`).
- Browser image-decode time is not counted; `performance.memory` is Chrome-only; server memory is not reported.
- JS and C# CSV splitting does not support newlines inside quoted fields (the Rust `csv` crate does).
- Results come from a single machine with the API on `localhost`.
- The WASM build skips `wasm-opt`; enabling it should shrink the module (not measured).
