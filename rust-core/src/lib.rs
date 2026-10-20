//! `rust-core`: the "heavy lifting" that the browser runs as WebAssembly.
//!
//! The JS version (`web-ui/src/lib`) and the C# version (`dotnet-api`) implement the SAME
//! integer math and the SAME validation rules, so the three engines can be compared fairly.
//!
//! # Where to look
//!
//! | File                         | What it does                                              |
//! |------------------------------|-----------------------------------------------------------|
//! | `lib.rs` (this file)         | The ONLY functions JavaScript can call (the WASM API)     |
//! | `image.rs`                   | Pixel filters: grayscale, blur, sharpen, edge             |
//! | `validation/rules.rs`        | Per-field rules and the 5-column schema                   |
//! | `validation/report.rs`       | Counts rows and builds the JSON report                    |
//! | `validation/from_csv.rs`     | Reads a CSV file and feeds rows to the report             |
//! | `validation/from_xlsx.rs`    | Reads an XLSX file and feeds rows to the report           |
//!
//! # How JavaScript calls it
//!
//! `#[wasm_bindgen]` marks a function as callable from JS. `wasm-pack` compiles this crate to
//! `rust_core_bg.wasm` and generates `rust_core.js`, which copies the `Uint8Array` arguments
//! into WASM memory, calls the function and copies the result back out.
//! See `web-ui/src/workers/wasmWorker.ts` for the JS side.

mod image;
mod validation;

use wasm_bindgen::prelude::*;

// ---------------------------------------------------------------- WASM API (called from JS)

/// Apply an image filter.
///
/// * `data`   - RGBA pixels, 4 bytes per pixel, row by row (the format of a canvas `ImageData`).
/// * `filter` - `"grayscale"`, `"blur"`, `"sharpen"` or `"edge"`. Anything else returns the image unchanged.
///
/// Returns a new RGBA buffer of the same size.
#[wasm_bindgen]
pub fn apply_filter(data: &[u8], width: u32, height: u32, filter: &str) -> Vec<u8> {
    image::apply(data, width as usize, height as usize, filter)
}

/// Validate a CSV file (first line is the header).
///
/// Returns the report as a JSON string; see `validation::report::Report` for its shape.
#[wasm_bindgen]
pub fn validate_csv(bytes: &[u8]) -> String {
    validation::from_csv::validate(bytes)
}

/// Validate an XLSX file (first worksheet, first row is the header).
///
/// Returns the report as a JSON string, or throws a JS error if the file cannot be read.
#[wasm_bindgen]
pub fn validate_xlsx(bytes: &[u8]) -> Result<String, JsError> {
    validation::from_xlsx::validate(bytes).map_err(|message| JsError::new(&message))
}
