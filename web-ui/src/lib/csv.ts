import type { Report, RowError } from './types';

// Same rules as rust-core (validate_fields) and dotnet-api/Validation.cs.
const isDigits = (s: string) => /^\d+$/.test(s);
const isAmount = (s: string) => /^\d+(\.\d+)?$/.test(s);
const isDate = (s: string) => /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s);
function isEmail(s: string): boolean {
  const at = s.indexOf('@');
  if (at <= 0 || s.lastIndexOf('@') !== at || s.includes(' ')) return false;
  const d = s.indexOf('.', at + 1);
  return d > at + 1 && d < s.length - 1;
}

function validate(f: string[]): [string, string] | null {
  if (f.length !== 5) return ['row', 'Expected 5 columns'];
  if (!isDigits(f[0])) return ['id', 'Must be digits'];
  if (f[1].trim().length === 0) return ['name', 'Required'];
  if (!isEmail(f[2])) return ['email', 'Invalid email'];
  if (!isAmount(f[3])) return ['amount', 'Must be a non-negative number'];
  if (!isDate(f[4])) return ['date', 'Must be yyyy-mm-dd'];
  return null;
}

function splitLine(line: string): string[] {
  if (!line.includes('"')) return line.split(',');
  const res: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { res.push(cur); cur = ''; }
    else cur += c;
  }
  res.push(cur);
  return res;
}

export function validateCsv(bytes: Uint8Array): Report {
  const lines = new TextDecoder().decode(bytes).split('\n');
  let total = 0, invalid = 0, valid = 0, sum = 0;
  const errors: RowError[] = [];
  let row = 2;
  for (let i = 1; i < lines.length; i++) {
    let line = lines[i];
    if (line.endsWith('\r')) line = line.slice(0, -1);
    if (line.length === 0) continue;
    const f = splitLine(line);
    total++;
    const err = validate(f);
    if (err) {
      invalid++;
      if (errors.length < 100) errors.push({ row, column: err[0], message: err[1] });
    } else {
      sum += Number(f[3]);
      valid++;
    }
    row++;
  }
  return { totalRows: total, invalidRows: invalid, sumAmount: sum, avgAmount: valid ? sum / valid : 0, errors };
}
