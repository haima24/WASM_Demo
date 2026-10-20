//! Read an XLSX workbook and validate every row of its first worksheet.

use super::report::Report;
use calamine::{open_workbook_from_rs, Data, Reader, Xlsx};
use std::io::Cursor;

/// Validate XLSX bytes (first worksheet, first row is the header) and return the report as JSON.
/// The error is a message that `lib.rs` turns into a JS exception.
pub fn validate(bytes: &[u8]) -> Result<String, String> {
    let mut workbook: Xlsx<Cursor<&[u8]>> =
        open_workbook_from_rs(Cursor::new(bytes)).map_err(|e: calamine::XlsxError| e.to_string())?;
    let sheet = workbook
        .worksheet_range_at(0)
        .ok_or("Workbook has no sheets")?
        .map_err(|e| e.to_string())?;

    let mut report = Report::new();
    for (index, row) in sheet.rows().enumerate().skip(1) {
        // `rules` works on text, so convert every cell to a string first.
        let cells: Vec<String> = row.iter().map(cell_to_string).collect();
        let fields: Vec<&str> = cells.iter().map(String::as_str).collect();
        report.add_row(index + 1, &fields); // index 0 is the header = row 1
    }
    Ok(report.to_json())
}

/// Excel stores numbers as floats; print whole numbers without ".0" so `42.0` becomes `42` and passes the id rule.
fn cell_to_string(cell: &Data) -> String {
    match cell {
        Data::Empty => String::new(),
        Data::String(s) => s.clone(),
        Data::Float(f) if f.fract() == 0.0 && f.abs() < 1e15 => format!("{}", *f as i64),
        Data::Float(f) => f.to_string(),
        Data::Int(i) => i.to_string(),
        other => other.to_string(),
    }
}
