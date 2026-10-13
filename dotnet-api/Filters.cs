// Same integer math as rust-core/src/lib.rs and web-ui/src/lib/filters.ts.
public static class Filters
{
    static readonly int[] Blur = Enumerable.Repeat(1, 81).ToArray();
    static readonly int[] Sharpen = { 0, -1, 0, -1, 5, -1, 0, -1, 0 };
    static readonly int[] Edge = { -1, -1, -1, -1, 8, -1, -1, -1, -1 };

    public static byte[] Apply(byte[] src, int w, int h, string filter) => filter switch
    {
        "grayscale" => Grayscale(src),
        "blur" => Convolve(src, w, h, Blur, 9, 81),
        "sharpen" => Convolve(src, w, h, Sharpen, 3, 1),
        "edge" => Convolve(src, w, h, Edge, 3, 1),
        _ => (byte[])src.Clone(),
    };

    static byte[] Grayscale(byte[] src)
    {
        var o = (byte[])src.Clone();
        for (int i = 0; i < o.Length; i += 4)
        {
            byte g = (byte)((299 * o[i] + 587 * o[i + 1] + 114 * o[i + 2]) / 1000);
            o[i] = o[i + 1] = o[i + 2] = g;
        }
        return o;
    }

    static byte[] Convolve(byte[] src, int w, int h, int[] kernel, int k, int div)
    {
        var o = new byte[src.Length];
        int r = k / 2;
        for (int y = 0; y < h; y++)
        for (int x = 0; x < w; x++)
        {
            int sr = 0, sg = 0, sb = 0;
            for (int ky = 0; ky < k; ky++)
            {
                int yy = Math.Clamp(y + ky - r, 0, h - 1);
                for (int kx = 0; kx < k; kx++)
                {
                    int xx = Math.Clamp(x + kx - r, 0, w - 1);
                    int kv = kernel[ky * k + kx];
                    int i = (yy * w + xx) * 4;
                    sr += src[i] * kv;
                    sg += src[i + 1] * kv;
                    sb += src[i + 2] * kv;
                }
            }
            int p = (y * w + x) * 4;
            o[p] = (byte)Math.Clamp(sr / div, 0, 255);
            o[p + 1] = (byte)Math.Clamp(sg / div, 0, 255);
            o[p + 2] = (byte)Math.Clamp(sb / div, 0, 255);
            o[p + 3] = src[p + 3];
        }
        return o;
    }
}
