using System.Diagnostics;
using System.Globalization;
using System.Text;
using ClosedXML.Excel;
using Microsoft.AspNetCore.Http.Features;
using SkiaSharp;

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = 300_000_000);
builder.Services.Configure<FormOptions>(o => o.MultipartBodyLengthLimit = 300_000_000);
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
var app = builder.Build();

app.UseSwagger();
app.UseSwaggerUI();
app.MapGet("/", () => Results.Redirect("/swagger")).ExcludeFromDescription();

static string Ms(Stopwatch sw) => sw.Elapsed.TotalMilliseconds.ToString("F1", CultureInfo.InvariantCulture);

// ---- Image: decode -> filter -> encode. Server-Timing lets the UI split compute from network time.
app.MapPost("/api/image/filter", async (HttpRequest req, HttpResponse res) =>
{
    var form = await req.ReadFormAsync();               // upload finished here
    var file = form.Files["file"];
    var filter = form["filter"].ToString();
    if (file is null) return Results.BadRequest("file missing");

    var total = Stopwatch.StartNew();
    var sw = Stopwatch.StartNew();
    using var decoded = SKBitmap.Decode(file.OpenReadStream());
    if (decoded is null) return Results.BadRequest("unsupported image");
    using var rgba = decoded.Copy(SKColorType.Rgba8888);
    int w = rgba.Width, h = rgba.Height;
    var px = rgba.GetPixelSpan().ToArray();
    var decode = Ms(sw);

    sw.Restart();
    var outPx = Filters.Apply(px, w, h, filter);
    var process = Ms(sw);

    sw.Restart();
    using var result = new SKBitmap(new SKImageInfo(w, h, SKColorType.Rgba8888, rgba.AlphaType));
    System.Runtime.InteropServices.Marshal.Copy(outPx, 0, result.GetPixels(), outPx.Length);
    using var data = result.Encode(SKEncodedImageFormat.Png, 100);
    var encode = Ms(sw);

    res.Headers["Server-Timing"] = $"decode;dur={decode}, process;dur={process}, encode;dur={encode}, total;dur={Ms(total)}";
    return Results.Bytes(data.ToArray(), "image/png");
});

// ---- CSV / XLSX validation (same rules as the Rust and JS versions)
app.MapPost("/api/excel/validate", async (HttpRequest req, HttpResponse res) =>
{
    var form = await req.ReadFormAsync();
    var file = form.Files["file"];
    if (file is null) return Results.BadRequest("file missing");

    var total = Stopwatch.StartNew();
    var acc = new Acc();
    if (file.FileName.EndsWith(".xlsx", StringComparison.OrdinalIgnoreCase))
    {
        using var wb = new XLWorkbook(file.OpenReadStream());
        var ws = wb.Worksheet(1);
        foreach (var row in ws.RowsUsed().Skip(1))
        {
            var f = new string[5];
            for (int c = 1; c <= 5; c++) f[c - 1] = row.Cell(c).GetString();
            acc.Add(row.RowNumber(), f);
        }
    }
    else
    {
        using var reader = new StreamReader(file.OpenReadStream(), Encoding.UTF8);
        reader.ReadLine(); // header
        int rowNo = 2;
        string? line;
        while ((line = reader.ReadLine()) != null)
        {
            if (line.Length == 0) continue;
            acc.Add(rowNo++, Csv.SplitLine(line));
        }
    }
    var t = Ms(total);
    res.Headers["Server-Timing"] = $"process;dur={t}, total;dur={t}";
    return Results.Json(acc.Finish());
});

// ---- Sample data generator: ~2% of rows are deliberately invalid.
app.MapGet("/api/sample", (int rows, string format) =>
{
    var rnd = new Random(42);
    rows = Math.Clamp(rows, 1, format == "xlsx" ? 200_000 : 1_000_000);
    string[] Make(int i)
    {
        var f = new[]
        {
            i.ToString(), $"User {i}", $"user{i}@example.com",
            (rnd.Next(0, 100000) / 100.0).ToString("F2", CultureInfo.InvariantCulture),
            $"{2020 + rnd.Next(5)}-{rnd.Next(1, 13):00}-{rnd.Next(1, 29):00}",
        };
        if (rnd.Next(50) == 0)
        {
            int k = rnd.Next(5);
            f[k] = new[] { "abc", "", "bad-email", "-5", "2024-13-40" }[k];
        }
        return f;
    }

    if (format == "xlsx")
    {
        using var wb = new XLWorkbook();
        var ws = wb.AddWorksheet("data");
        string[] head = { "id", "name", "email", "amount", "date" };
        for (int c = 0; c < 5; c++) ws.Cell(1, c + 1).Value = head[c];
        for (int i = 1; i <= rows; i++)
        {
            var f = Make(i);
            for (int c = 0; c < 5; c++)
            {
                var cell = ws.Cell(i + 1, c + 1);
                if ((c == 0 || c == 3) && double.TryParse(f[c], NumberStyles.Float, CultureInfo.InvariantCulture, out var n) && n >= 0)
                    cell.Value = n;
                else cell.Value = f[c];
            }
        }
        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return Results.File(ms.ToArray(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "sample.xlsx");
    }

    var sb = new StringBuilder("id,name,email,amount,date\n");
    for (int i = 1; i <= rows; i++) sb.AppendJoin(',', Make(i)).Append('\n');
    return Results.File(Encoding.UTF8.GetBytes(sb.ToString()), "text/csv", "sample.csv");
});

app.Run("http://localhost:5080");
