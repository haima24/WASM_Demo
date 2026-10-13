//! Shared "heavy lifting" module: image filters + CSV/XLSX validation.
//! The JS (web-ui/src/lib) and C# (dotnet-api) versions implement the SAME integer math
//! and the SAME validation rules, so the three engines can be compared fairly.

use calamine::{open_workbook_from_rs, Data, Reader, Xlsx};
use serde::Serialize;
use std::io::Cursor;
use wasm_bindgen::prelude::*;

// ---------------------------------------------------------------- image filters

/// `data` is RGBA (4 bytes/pixel), row-major. Returns a new RGBA buffer.
#[wasm_bindgen]
pub fn apply_filter(data: &[u8], width: u32, height: u32, filter: &str) -> Vec<u8> {
    let (w, h) = (width as usize, height as usize);
    match filter {
        "grayscale" => grayscale(data),
        "blur" => convolve(data, w, h, &[1; 81], 9, 81),
        "sharpen" => convolve(data, w, h, &[0, -1, 0, -1, 5, -1, 0, -1, 0], 3, 1),
        "edge" => convolve(data, w, h, &[-1, -1, -1, -1, 8, -1, -1, -1, -1], 3, 1),
        _ => data.to_vec(),
    }
}

fn grayscale(src: &[u8]) -> Vec<u8> {
    let mut out = src.to_vec();
    for px in out.chunks_exact_mut(4) {
        let g = ((299 * px[0] as u32 + 587 * px[1] as u32 + 114 * px[2] as u32) / 1000) as u8;
        px[0] = g;
        px[1] = g;
        px[2] = g;
    }
    out
}

/// Naive (non-separable) k*k convolution with edge clamping; integer math only.
fn convolve(src: &[u8], w: usize, h: usize, kernel: &[i32], k: usize, div: i32) -> Vec<u8> {
    let mut out = vec![0u8; src.len()];
    let r = (k / 2) as i32;
    let (wi, hi) = (w as i32, h as i32);
    for y in 0..hi {
        for x in 0..wi {
            let (mut sr, mut sg, mut sb) = (0i32, 0i32, 0i32);
            for ky in 0..k as i32 {
                let yy = (y + ky - r).clamp(0, hi - 1) as usize;
                for kx in 0..k as i32 {
                    let xx = (x + kx - r).clamp(0, wi - 1) as usize;
                    let kv = kernel[ky as usize * k + kx as usize];
                    let i = (yy * w + xx) * 4;
                    sr += src[i] as i32 * kv;
                    sg += src[i + 1] as i32 * kv;
                    sb += src[i + 2] as i32 * kv;
                }
            }
            let o = (y as usize * w + x as usize) * 4;
            out[o] = (sr / div).clamp(0, 255) as u8;
            out[o + 1] = (sg / div).clamp(0, 255) as u8;
            out[o + 2] = (sb / div).clamp(0, 255) as u8;
            out[o + 3] = src[o + 3];
        }
    }
    out
}

// ---------------------------------------------------------------- CSV / XLSX validation
// Schema (5 columns): id, name, email, amount, date
//   id: digits | name: not blank | email: x@y.z | amount: non-negative number | date: yyyy-mm-dd

#[derive(Serialize)]
struct RowError {
    row: usize,
    column: &'static str,
    message: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Report {
    total_rows: usize,
    invalid_rows: usize,
    sum_amount: f64,
    avg_amount: f64,
    errors: Vec<RowError>,
}

struct Acc {
    total: usize,
    invalid: usize,
    sum: f64,
    valid: usize,
    errors: Vec<RowError>,
}

impl Acc {
    fn new() -> Self {
        Acc { total: 0, invalid: 0, sum: 0.0, valid: 0, errors: Vec::new() }
    }

    fn add(&mut self, row: usize, f: &[&str]) {
        self.total += 1;
        match validate_fields(f) {
            Ok(amount) => {
                self.sum += amount;
                self.valid += 1;
            }
            Err((column, message)) => {
                self.invalid += 1;
                if self.errors.len() < 100 {
                    self.errors.push(RowError { row, column, message });
                }
            }
        }
    }

    fn finish(self) -> String {
        let avg = if self.valid > 0 { self.sum / self.valid as f64 } else { 0.0 };
        let report = Report {
            total_rows: self.total,
            invalid_rows: self.invalid,
            sum_amount: self.sum,
            avg_amount: avg,
            errors: self.errors,
        };
        serde_json::to_string(&report).unwrap()
    }
}

fn is_digits(s: &str) -> bool {
    !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit())
}

fn is_amount(s: &str) -> bool {
    match s.split_once('.') {
        None => is_digits(s),
        Some((a, b)) => is_digits(a) && is_digits(b),
    }
}

fn is_email(s: &str) -> bool {
    let at = match s.find('@') {
        Some(i) => i,
        None => return false,
    };
    if at == 0 || s.rfind('@') != Some(at) || s.contains(' ') {
        return false;
    }
    match s[at + 1..].find('.') {
        Some(d) => d > 0 && at + 1 + d < s.len() - 1,
        None => false,
    }
}

fn is_date(s: &str) -> bool {
    let b = s.as_bytes();
    if b.len() != 10 || b[4] != b'-' || b[7] != b'-' {
        return false;
    }
    for i in [0, 1, 2, 3, 5, 6, 8, 9] {
        if !b[i].is_ascii_digit() {
            return false;
        }
    }
    let month = (b[5] - b'0') * 10 + (b[6] - b'0');
    let day = (b[8] - b'0') * 10 + (b[9] - b'0');
    (1..=12).contains(&month) && (1..=31).contains(&day)
}

fn validate_fields(f: &[&str]) -> Result<f64, (&'static str, &'static str)> {
    if f.len() != 5 {
        return Err(("row", "Expected 5 columns"));
    }
    if !is_digits(f[0]) {
        return Err(("id", "Must be digits"));
    }
    if f[1].trim().is_empty() {
        return Err(("name", "Required"));
    }
    if !is_email(f[2]) {
        return Err(("email", "Invalid email"));
    }
    if !is_amount(f[3]) {
        return Err(("amount", "Must be a non-negative number"));
    }
    if !is_date(f[4]) {
        return Err(("date", "Must be yyyy-mm-dd"));
    }
    Ok(f[3].parse::<f64>().unwrap_or(0.0))
}

/// Returns the report as a JSON string.
#[wasm_bindgen]
pub fn validate_csv(bytes: &[u8]) -> String {
    let mut rdr = csv::ReaderBuilder::new().has_headers(true).flexible(true).from_reader(bytes);
    let mut acc = Acc::new();
    for (idx, rec) in rdr.records().enumerate() {
        let row = idx + 2; // header is line 1
        match rec {
            Ok(r) => {
                let fields: Vec<&str> = r.iter().collect();
                acc.add(row, &fields);
            }
            Err(_) => acc.add(row, &[]),
        }
    }
    acc.finish()
}

fn cell_to_string(c: &Data) -> String {
    match c {
        Data::Empty => String::new(),
        Data::String(s) => s.clone(),
        Data::Float(f) if f.fract() == 0.0 && f.abs() < 1e15 => format!("{}", *f as i64),
        Data::Float(f) => f.to_string(),
        Data::Int(i) => i.to_string(),
        other => other.to_string(),
    }
}

/// First worksheet, first row = header. Returns the report as a JSON string.
#[wasm_bindgen]
pub fn validate_xlsx(bytes: &[u8]) -> Result<String, JsError> {
    let mut wb: Xlsx<Cursor<&[u8]>> =
        open_workbook_from_rs(Cursor::new(bytes)).map_err(|e: calamine::XlsxError| JsError::new(&e.to_string()))?;
    let range = wb
        .worksheet_range_at(0)
        .ok_or_else(|| JsError::new("Workbook has no sheets"))?
        .map_err(|e| JsError::new(&e.to_string()))?;
    let mut acc = Acc::new();
    for (i, row) in range.rows().enumerate().skip(1) {
        let owned: Vec<String> = row.iter().map(cell_to_string).collect();
        let fields: Vec<&str> = owned.iter().map(|s| s.as_str()).collect();
        acc.add(i + 1, &fields);
    }
    Ok(acc.finish())
}
