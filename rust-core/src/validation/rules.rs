//! The validation rules. Pure functions on text: no file reading and no JSON here.

/// Why a row was rejected: which column, and a human-readable message.
pub struct RowProblem {
    pub column: &'static str,
    pub message: &'static str,
}

/// Number of columns every row must have: id, name, email, amount, date.
const EXPECTED_COLUMNS: usize = 5;

/// Check one row (its text fields, in column order).
///
/// Returns the row's `amount` if the row is valid, or the FIRST problem found.
pub fn validate_row(fields: &[&str]) -> Result<f64, RowProblem> {
    if fields.len() != EXPECTED_COLUMNS {
        return Err(RowProblem { column: "row", message: "Expected 5 columns" });
    }
    let [id, name, email, amount, date] = [fields[0], fields[1], fields[2], fields[3], fields[4]];

    if !is_digits(id) {
        return Err(RowProblem { column: "id", message: "Must be digits" });
    }
    if name.trim().is_empty() {
        return Err(RowProblem { column: "name", message: "Required" });
    }
    if !is_email(email) {
        return Err(RowProblem { column: "email", message: "Invalid email" });
    }
    if !is_amount(amount) {
        return Err(RowProblem { column: "amount", message: "Must be a non-negative number" });
    }
    if !is_date(date) {
        return Err(RowProblem { column: "date", message: "Must be yyyy-mm-dd" });
    }
    // `is_amount` already proved the text is a number, so parsing cannot fail in practice.
    Ok(amount.parse::<f64>().unwrap_or(0.0))
}

/// Non-empty and only the characters 0-9.
fn is_digits(s: &str) -> bool {
    !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit())
}

/// A non-negative number: digits, or digits `.` digits (so `12`, `12.5`; not `-1`, `.5` or `1e3`).
fn is_amount(s: &str) -> bool {
    match s.split_once('.') {
        None => is_digits(s),
        Some((whole, fraction)) => is_digits(whole) && is_digits(fraction),
    }
}

/// Simple shape check, not a full RFC check: no spaces, exactly one `@` that is not first,
/// and a `.` somewhere after it that is neither right after the `@` nor the last character.
fn is_email(s: &str) -> bool {
    let Some(at) = s.find('@') else { return false };
    if at == 0 || s.rfind('@') != Some(at) || s.contains(' ') {
        return false;
    }
    match s[at + 1..].find('.') {
        Some(dot) => dot > 0 && at + 1 + dot < s.len() - 1,
        None => false,
    }
}

/// `yyyy-mm-dd` with month 01-12 and day 01-31. It does not check the day against the month
/// (so `2024-02-31` passes).
fn is_date(s: &str) -> bool {
    let b = s.as_bytes();
    if b.len() != 10 || b[4] != b'-' || b[7] != b'-' {
        return false;
    }
    let digit_positions = [0, 1, 2, 3, 5, 6, 8, 9];
    if !digit_positions.iter().all(|&i| b[i].is_ascii_digit()) {
        return false;
    }
    let month = (b[5] - b'0') * 10 + (b[6] - b'0');
    let day = (b[8] - b'0') * 10 + (b[9] - b'0');
    (1..=12).contains(&month) && (1..=31).contains(&day)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn problem(fields: &[&str]) -> Option<(&'static str, &'static str)> {
        validate_row(fields).err().map(|p| (p.column, p.message))
    }

    #[test]
    fn valid_row_returns_the_amount() {
        assert_eq!(validate_row(&["1", "Ann", "a@b.com", "12.5", "2024-01-31"]).ok(), Some(12.5));
    }

    #[test]
    fn wrong_column_count() {
        assert_eq!(problem(&["1", "Ann"]), Some(("row", "Expected 5 columns")));
    }

    #[test]
    fn reports_the_first_bad_column() {
        assert_eq!(problem(&["x", "", "bad", "-1", "nope"]), Some(("id", "Must be digits")));
        assert_eq!(problem(&["1", " ", "a@b.com", "1", "2024-01-01"]), Some(("name", "Required")));
        assert_eq!(problem(&["1", "A", "a@b", "1", "2024-01-01"]), Some(("email", "Invalid email")));
        assert_eq!(problem(&["1", "A", "a@b.com", "-1", "2024-01-01"]), Some(("amount", "Must be a non-negative number")));
        assert_eq!(problem(&["1", "A", "a@b.com", "1", "2024-13-01"]), Some(("date", "Must be yyyy-mm-dd")));
    }

    #[test]
    fn amount_formats() {
        assert!(is_amount("12") && is_amount("12.5"));
        assert!(!is_amount(".5") && !is_amount("5.") && !is_amount("-1") && !is_amount("1e3"));
    }

    #[test]
    fn email_formats() {
        assert!(is_email("a@b.co"));
        assert!(!is_email("a@b.") && !is_email("@b.co") && !is_email("a@@b.co") && !is_email("a b@c.de"));
    }
}
