//! CSV / XLSX validation.
//!
//! Both file types are checked against the same 5-column schema:
//!
//! | Column | Rule                                  |
//! |--------|---------------------------------------|
//! | id     | digits only                           |
//! | name   | not blank                             |
//! | email  | `x@y.z`                               |
//! | amount | non-negative number                   |
//! | date   | `yyyy-mm-dd`                          |
//!
//! Data flow: `from_csv` / `from_xlsx` read the file and call `Report::add_row` for every row;
//! `add_row` uses `rules::validate_row`; `Report::to_json` produces the final JSON.

pub mod from_csv;
pub mod from_xlsx;
mod report;
mod rules;
