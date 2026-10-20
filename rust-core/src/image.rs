//! Image filters. Input and output are RGBA buffers: 4 bytes per pixel (R, G, B, A), row by row.
//! Integer math only, so the JS and C# versions produce identical pixels.

/// Bytes per pixel in an RGBA buffer.
const CHANNELS: usize = 4;

/// A square convolution kernel: each output pixel is the weighted sum of its `size` x `size`
/// neighbours, divided by `divisor`.
struct Kernel {
    weights: &'static [i32],
    size: usize,
    divisor: i32,
}

/// 9x9 box blur: all 81 neighbours count equally, so divide by 81 to get the average.
const BLUR: Kernel = Kernel { weights: &[1; 81], size: 9, divisor: 81 };

/// Boosts the centre pixel and subtracts its 4 direct neighbours.
const SHARPEN: Kernel = Kernel { weights: &[0, -1, 0, -1, 5, -1, 0, -1, 0], size: 3, divisor: 1 };

/// Highlights outlines: the centre pixel minus the average of its 8 neighbours.
const EDGE: Kernel = Kernel { weights: &[-1, -1, -1, -1, 8, -1, -1, -1, -1], size: 3, divisor: 1 };

/// Entry point used by `apply_filter` in `lib.rs`. Unknown filter names return a copy of the input.
pub fn apply(data: &[u8], width: usize, height: usize, filter: &str) -> Vec<u8> {
    match filter {
        "grayscale" => grayscale(data),
        "blur" => convolve(data, width, height, &BLUR),
        "sharpen" => convolve(data, width, height, &SHARPEN),
        "edge" => convolve(data, width, height, &EDGE),
        _ => data.to_vec(),
    }
}

/// Replace R, G and B with their weighted brightness (the standard luma weights, scaled by 1000).
fn grayscale(src: &[u8]) -> Vec<u8> {
    let mut out = src.to_vec();
    for pixel in out.chunks_exact_mut(CHANNELS) {
        let (r, g, b) = (pixel[0] as u32, pixel[1] as u32, pixel[2] as u32);
        let gray = ((299 * r + 587 * g + 114 * b) / 1000) as u8;
        pixel[0] = gray;
        pixel[1] = gray;
        pixel[2] = gray;
        // pixel[3] (alpha) is left as is
    }
    out
}

/// Slide the kernel over every pixel. Neighbours past the image edge reuse the nearest edge pixel
/// ("clamping"). This is the simple O(width * height * size^2) version, on purpose: it makes the
/// comparison with JS and C# a pure speed test of the same algorithm.
fn convolve(src: &[u8], width: usize, height: usize, kernel: &Kernel) -> Vec<u8> {
    let mut out = vec![0u8; src.len()];
    let radius = (kernel.size / 2) as i32;
    let (max_x, max_y) = (width as i32 - 1, height as i32 - 1);

    for y in 0..=max_y {
        for x in 0..=max_x {
            // Weighted sums for the red, green and blue channels of this pixel.
            let (mut sum_r, mut sum_g, mut sum_b) = (0i32, 0i32, 0i32);

            for ky in 0..kernel.size {
                let neighbour_y = (y + ky as i32 - radius).clamp(0, max_y) as usize;
                for kx in 0..kernel.size {
                    let neighbour_x = (x + kx as i32 - radius).clamp(0, max_x) as usize;
                    let weight = kernel.weights[ky * kernel.size + kx];
                    let i = (neighbour_y * width + neighbour_x) * CHANNELS;
                    sum_r += src[i] as i32 * weight;
                    sum_g += src[i + 1] as i32 * weight;
                    sum_b += src[i + 2] as i32 * weight;
                }
            }

            let o = (y as usize * width + x as usize) * CHANNELS;
            out[o] = to_byte(sum_r / kernel.divisor);
            out[o + 1] = to_byte(sum_g / kernel.divisor);
            out[o + 2] = to_byte(sum_b / kernel.divisor);
            out[o + 3] = src[o + 3]; // keep alpha
        }
    }
    out
}

/// Limit a channel value to the valid 0..=255 range.
fn to_byte(value: i32) -> u8 {
    value.clamp(0, 255) as u8
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn grayscale_makes_channels_equal_and_keeps_alpha() {
        let out = apply(&[200, 100, 50, 77], 1, 1, "grayscale");
        assert_eq!(out[0], out[1]);
        assert_eq!(out[1], out[2]);
        assert_eq!(out[3], 77);
    }

    #[test]
    fn blur_leaves_a_flat_image_unchanged() {
        let flat = [10u8, 20, 30, 255].repeat(4 * 4);
        assert_eq!(apply(&flat, 4, 4, "blur"), flat);
    }

    #[test]
    fn unknown_filter_returns_the_input() {
        let px = [1u8, 2, 3, 4];
        assert_eq!(apply(&px, 1, 1, "nope"), px);
    }
}
