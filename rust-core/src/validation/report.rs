//! Collects the result of validating many rows and turns it into the JSON the UI shows.

use super::rules::{validate_row, RowProblem};
use serde::Serialize;

/// Only the first N invalid rows are listed in the report; the rest are just counted.
const MAX_LISTED_ERRORS: usize = 100;

/// One invalid row, as shown in the JSON `errors` list.
#[derive(Serialize)]
struct RowError {
    /// Row number as in the spreadsheet (header is row 1).
    row: usize,
    column: &'static str,
    message: &'static str,
}

/// The JSON object sent back to JavaScript (field names become camelCase, e.g. `totalRows`).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Summary {
    total_rows: usize,
    invalid_rows: usize,
    sum_amount: f64,
    avg_amount: f64,
    errors: Vec<RowError>,
}

/// Running totals. Call `add_row` for each data row, then `to_json` once at the end.
#[derive(Default)]
pub struct Report {
    total_rows: usize,
    valid_rows: usize,
    invalid_rows: usize,
    sum_amount: f64,
    errors: Vec<RowError>,
}

impl Report {
    pub fn new() -> Self {
        Self::default()
    }

    /// Validate one row and update the totals. `row` is its number in the file (header = 1).
    pub fn add_row(&mut self, row: usize, fields: &[&str]) {
        self.total_rows += 1;
        match validate_row(fields) {
            Ok(amount) => {
                self.valid_rows += 1;
                self.sum_amount += amount;
            }
            Err(RowProblem { column, message }) => {
                self.invalid_rows += 1;
                if self.errors.len() < MAX_LISTED_ERRORS {
                    self.errors.push(RowError { row, column, message });
                }
            }
        }
    }

    /// Finish and serialize. The average only counts valid rows.
    pub fn to_json(self) -> String {
        let avg_amount = if self.valid_rows > 0 { self.sum_amount / self.valid_rows as f64 } else { 0.0 };
        let summary = Summary {
            total_rows: self.total_rows,
            invalid_rows: self.invalid_rows,
            sum_amount: self.sum_amount,
            avg_amount,
            errors: self.errors,
        };
        serde_json::to_string(&summary).expect("a Summary always serializes to JSON")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_rows_and_averages_valid_amounts() {
        let mut report = Report::new();
        report.add_row(2, &["1", "A", "a@b.com", "10", "2024-01-01"]);
        report.add_row(3, &["2", "B", "b@c.com", "20", "2024-01-02"]);
        report.add_row(4, &["x", "C", "c@d.com", "30", "2024-01-03"]);
        assert_eq!(
            report.to_json(),
            r#"{"totalRows":3,"invalidRows":1,"sumAmount":30.0,"avgAmount":15.0,"errors":[{"row":4,"column":"id","message":"Must be digits"}]}"#
        );
    }

    #[test]
    fn lists_at_most_100_errors_but_counts_all() {
        let mut report = Report::new();
        for row in 2..202 {
            report.add_row(row, &[]);
        }
        assert_eq!(report.invalid_rows, 200);
        assert_eq!(report.errors.len(), MAX_LISTED_ERRORS);
    }
}
