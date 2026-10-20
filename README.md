Continuously update, research, and master at least one new technology (beyond skill standard) each year, clearly understand its advantages and disadvantages, and develop personal skills.

(Expected output: slides, demo, code sample, blog post)

- Slides: [Rust_WASM_KPI_2026.pptx](docs/Rust_WASM_KPI_2026.pptx)
- Demo video: [demo.mp4](docs/demo.mp4)
- Code sample: this repository
- Blog post: [Rust + WebAssembly vs JavaScript and .NET: what I measured](https://blog.nashtechglobal.com/?p=142816)

---

## How to run the code

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
