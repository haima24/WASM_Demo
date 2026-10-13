using System.Globalization;

// Same rules as rust-core (validate_fields) and web-ui/src/lib/csv.ts.
public record RowError(int Row, string Column, string Message);
public record Report(int TotalRows, int InvalidRows, double SumAmount, double AvgAmount, List<RowError> Errors);

public class Acc
{
    int total, invalid, valid;
    double sum;
    readonly List<RowError> errors = new();

    public void Add(int row, string[] f)
    {
        total++;
        var err = Validate(f, out var amount);
        if (err is null) { sum += amount; valid++; }
        else
        {
            invalid++;
            if (errors.Count < 100) errors.Add(new RowError(row, err.Value.col, err.Value.msg));
        }
    }

    public Report Finish() => new(total, invalid, sum, valid > 0 ? sum / valid : 0, errors);

    static bool IsDigit(char c) => c >= '0' && c <= '9';
    static bool IsDigits(string s) => s.Length > 0 && s.All(IsDigit);
    static bool IsAmount(string s)
    {
        int dot = s.IndexOf('.');
        return dot < 0 ? IsDigits(s) : IsDigits(s[..dot]) && IsDigits(s[(dot + 1)..]);
    }
    static bool IsEmail(string s)
    {
        int at = s.IndexOf('@');
        if (at <= 0 || s.LastIndexOf('@') != at || s.Contains(' ')) return false;
        int d = s.IndexOf('.', at + 1);
        return d > at + 1 && d < s.Length - 1;
    }
    static bool IsDate(string s)
    {
        if (s.Length != 10 || s[4] != '-' || s[7] != '-') return false;
        foreach (int i in new[] { 0, 1, 2, 3, 5, 6, 8, 9 }) if (!IsDigit(s[i])) return false;
        int m = (s[5] - '0') * 10 + (s[6] - '0'), d = (s[8] - '0') * 10 + (s[9] - '0');
        return m is >= 1 and <= 12 && d is >= 1 and <= 31;
    }

    static (string col, string msg)? Validate(string[] f, out double amount)
    {
        amount = 0;
        if (f.Length != 5) return ("row", "Expected 5 columns");
        if (!IsDigits(f[0])) return ("id", "Must be digits");
        if (f[1].Trim().Length == 0) return ("name", "Required");
        if (!IsEmail(f[2])) return ("email", "Invalid email");
        if (!IsAmount(f[3])) return ("amount", "Must be a non-negative number");
        if (!IsDate(f[4])) return ("date", "Must be yyyy-mm-dd");
        amount = double.Parse(f[3], CultureInfo.InvariantCulture);
        return null;
    }
}

public static class Csv
{
    public static string[] SplitLine(string line)
    {
        if (!line.Contains('"')) return line.Split(',');
        var res = new List<string>();
        var sb = new System.Text.StringBuilder();
        bool q = false;
        for (int i = 0; i < line.Length; i++)
        {
            char c = line[i];
            if (q)
            {
                if (c == '"') { if (i + 1 < line.Length && line[i + 1] == '"') { sb.Append('"'); i++; } else q = false; }
                else sb.Append(c);
            }
            else if (c == '"') q = true;
            else if (c == ',') { res.Add(sb.ToString()); sb.Clear(); }
            else sb.Append(c);
        }
        res.Add(sb.ToString());
        return res.ToArray();
    }
}
