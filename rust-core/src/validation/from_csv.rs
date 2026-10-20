//! Read a CSV file and validate every row.

use super::report::Report;

/// Validate CSV bytes (the first line is the header) and return the report as JSON.
pub fn validate(bytes: &[u8]) -> String {
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(true)
        .flexible(true) // let rows with the wrong number of fields through, so validation can report them
        .from_reader(bytes);

    let mut report = Report::new();
    for (index, record) in reader.records().enumerate() {
        let row_number = index + 2; // the header is line 1
        match record {
            Ok(record) => {
                let fields: Vec<&str> = record.iter().collect();
                report.add_row(row_number, &fields);
            }
            // An unreadable line counts as an invalid row (it has no usable fields).
            Err(_) => report.add_row(row_number, &[]),
        }
    }
    report.to_json()
}
