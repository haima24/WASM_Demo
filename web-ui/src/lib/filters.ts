// Same integer math as rust-core/src/lib.rs and dotnet-api/Filters.cs.
interface Kernel { k: number; kernel: Int32Array; div: number }

const BLUR: Kernel = { k: 9, kernel: new Int32Array(81).fill(1), div: 81 };
const SHARPEN: Kernel = { k: 3, kernel: Int32Array.from([0, -1, 0, -1, 5, -1, 0, -1, 0]), div: 1 };
const EDGE: Kernel = { k: 3, kernel: Int32Array.from([-1, -1, -1, -1, 8, -1, -1, -1, -1]), div: 1 };

export function applyFilter(src: Uint8Array, w: number, h: number, filter: string): Uint8Array {
  switch (filter) {
    case 'grayscale': return grayscale(src);
    case 'blur': return convolve(src, w, h, BLUR);
    case 'sharpen': return convolve(src, w, h, SHARPEN);
    case 'edge': return convolve(src, w, h, EDGE);
    default: return src.slice();
  }
}

function grayscale(src: Uint8Array): Uint8Array {
  const out = src.slice();
  for (let i = 0; i < out.length; i += 4) {
    const g = ((299 * out[i] + 587 * out[i + 1] + 114 * out[i + 2]) / 1000) | 0;
    out[i] = out[i + 1] = out[i + 2] = g;
  }
  return out;
}

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

function convolve(src: Uint8Array, w: number, h: number, { k, kernel, div }: Kernel): Uint8Array {
  const out = new Uint8Array(src.length);
  const r = k >> 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sr = 0, sg = 0, sb = 0;
      for (let ky = 0; ky < k; ky++) {
        let yy = y + ky - r;
        yy = yy < 0 ? 0 : yy >= h ? h - 1 : yy;
        for (let kx = 0; kx < k; kx++) {
          let xx = x + kx - r;
          xx = xx < 0 ? 0 : xx >= w ? w - 1 : xx;
          const kv = kernel[ky * k + kx];
          const i = (yy * w + xx) * 4;
          sr += src[i] * kv;
          sg += src[i + 1] * kv;
          sb += src[i + 2] * kv;
        }
      }
      const o = (y * w + x) * 4;
      out[o] = clamp(Math.trunc(sr / div));
      out[o + 1] = clamp(Math.trunc(sg / div));
      out[o + 2] = clamp(Math.trunc(sb / div));
      out[o + 3] = src[o + 3];
    }
  }
  return out;
}
