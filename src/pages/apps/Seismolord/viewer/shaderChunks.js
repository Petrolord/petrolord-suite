// Shared GLSL + LUT helpers for the 2D slice renderer and the 3D cube
// renderer. Both shaders MUST shade amplitudes identically (domain rule:
// display math never touches stored data), so the sampling and colormap
// code lives here once.

import { COLOR_MAPS } from '@/utils/colorMaps';

/**
 * Amplitude sampling chunk, suffix-parameterized (W2.4 co-rendering):
 * `makeSamplingGlsl('')` is the primary volume's chunk (uniform names
 * and function bodies BYTE-IDENTICAL to the pre-W2.4 single-volume
 * chunk, so the overlay-off shader arithmetic is unchanged);
 * `makeSamplingGlsl('B')` declares the u_dataB / u_traceRmsB / … family
 * for the co-rendered overlay volume. Each instance declares
 * u_data<S> / u_traceRms<S> / u_traceBalance<S> / u_interp<S> and
 * provides:
 *   float sampleBalanced<S>(vec2 t, out bool isNull)
 * t is a normalized texture coordinate (x = data width axis, y = trace
 * axis). Returns the per-trace-rms-balanced amplitude. u_interp == 1 runs
 * null-aware bicubic Catmull-Rom via texelFetch (no float-linear
 * extension needed): a pixel is null iff its NEAREST texel is null, and
 * null neighbours contribute the centre value so null regions keep hard
 * edges. u_interp == 0 is the exact-NEAREST path the CPU-reference
 * self-test models.
 */
export const makeSamplingGlsl = (S = '') => `
uniform sampler2D u_data${S};      // R32F amplitudes
uniform sampler2D u_traceRms${S};  // R32F per-trace rms, x = trace
uniform sampler2D u_agc${S};       // R32F windowed-AGC gain, same dims as u_data${S}
uniform int   u_traceBalance${S};  // 1 = divide by per-trace rms
uniform int   u_useAgc${S};        // 1 = multiply the AGC gain map in
uniform int   u_interp${S};        // 1 = smooth (bicubic Catmull-Rom), 0 = nearest

// Catmull-Rom weights for taps at offsets -1, 0, +1, +2 around the cell.
vec4 cubicWeights${S}(float f) {
  float f2 = f * f;
  float f3 = f2 * f;
  return vec4(
    0.5 * (-f3 + 2.0 * f2 - f),
    0.5 * (3.0 * f3 - 5.0 * f2 + 2.0),
    0.5 * (-3.0 * f3 + 4.0 * f2 + f),
    0.5 * (f3 - f2));
}

float rmsScaleAt${S}(int trace) {
  float r = texelFetch(u_traceRms${S}, ivec2(trace, 0), 0).r;
  return r > 0.0 ? 1.0 / r : 0.0;
}

float sampleBalanced${S}(vec2 t, out bool isNull) {
  isNull = false;
  if (u_interp${S} == 1) {
    ivec2 sz = textureSize(u_data${S}, 0);
    vec2 pos = t * vec2(sz) - 0.5;
    ivec2 base = ivec2(floor(pos));
    vec2 f = pos - vec2(base);
    ivec2 nearestT = clamp(ivec2(t * vec2(sz)), ivec2(0), sz - 1);
    float centre = texelFetch(u_data${S}, nearestT, 0).r;
    if (abs(centre) > 1.0e29) { isNull = true; return 0.0; }
    float bC = centre * (u_traceBalance${S} == 1 ? rmsScaleAt${S}(nearestT.y) : 1.0)
      * (u_useAgc${S} == 1 ? texelFetch(u_agc${S}, nearestT, 0).r : 1.0);
    vec4 wx = cubicWeights${S}(f.x);
    vec4 wy = cubicWeights${S}(f.y);
    float acc = 0.0;
    for (int j = 0; j < 4; j++) {
      int py = clamp(base.y - 1 + j, 0, sz.y - 1);
      float rScale = u_traceBalance${S} == 1 ? rmsScaleAt${S}(py) : 1.0;
      float row = 0.0;
      for (int i = 0; i < 4; i++) {
        int px = clamp(base.x - 1 + i, 0, sz.x - 1);
        float raw = texelFetch(u_data${S}, ivec2(px, py), 0).r;
        float aG = u_useAgc${S} == 1 ? texelFetch(u_agc${S}, ivec2(px, py), 0).r : 1.0;
        row += wx[i] * (abs(raw) > 1.0e29 ? bC : raw * rScale * aG);
      }
      acc += wy[j] * row;
    }
    return acc;
  }
  float amp = texture(u_data${S}, t).r;
  if (abs(amp) > 1.0e29) { isNull = true; return 0.0; }
  float scale = 1.0;
  if (u_traceBalance${S} == 1) {
    float rms = texture(u_traceRms${S}, vec2(t.y, 0.5)).r;
    scale = rms > 0.0 ? 1.0 / rms : 0.0;
  }
  if (u_useAgc${S} == 1) scale *= texture(u_agc${S}, t).r;
  return amp * scale;
}
`;

export const SAMPLING_GLSL = makeSamplingGlsl('');

/**
 * Display chunk on top of SAMPLING_GLSL: symmetric clip around zero into
 * the 256x1 LUT (playbook display default).
 *   vec4 shadeAmp(vec2 t)
 */
export const DISPLAY_GLSL = `
uniform sampler2D u_lut;       // 256x1 RGBA colormap
uniform float u_gain;          // display gain multiplier
uniform float u_polarity;      // +1 SEG normal, -1 reversed
uniform float u_clip;          // symmetric clip amplitude (maps to LUT ends)
uniform vec4  u_nullColor;

vec4 shadeAmp(vec2 t) {
  bool isNull;
  float balanced = sampleBalanced(t, isNull);
  if (isNull) return u_nullColor;
  float a = balanced * u_gain * u_polarity;
  float x = clamp(0.5 + 0.5 * a / u_clip, 0.0, 1.0);
  return texture(u_lut, vec2(x, 0.5));
}
`;

/**
 * Co-render chunk (W2.4) on top of makeSamplingGlsl('B') + DISPLAY_GLSL:
 * shades the overlay volume through its own LUT/gain/clip and blends it
 * over the already-shaded primary pixel. Null policy: a null OVERLAY
 * sample leaves the primary untouched (nulls never tint data), and the
 * caller skips blending entirely where the PRIMARY is null (use
 * primaryIsNull) so null regions keep the null color.
 *   bool primaryIsNull(vec2 t)
 *   vec4 blendOverlay(vec2 t, vec4 base)
 */
export const OVERLAY_GLSL = `
uniform sampler2D u_lutB;      // overlay 256x1 RGBA colormap
uniform float u_gainB;
uniform float u_polarityB;
uniform float u_clipB;
uniform int   u_overlayOn;     // 1 = co-render the overlay volume
uniform int   u_blendMode;     // 0 = opacity mix, 1 = multiply
uniform float u_overlayOpacity;

bool primaryIsNull(vec2 t) {
  ivec2 sz = textureSize(u_data, 0);
  ivec2 nt = clamp(ivec2(t * vec2(sz)), ivec2(0), sz - 1);
  return abs(texelFetch(u_data, nt, 0).r) > 1.0e29;
}

vec4 blendOverlay(vec2 t, vec4 base) {
  bool isNullB;
  float balancedB = sampleBalancedB(t, isNullB);
  if (isNullB) return base;
  float aB = balancedB * u_gainB * u_polarityB;
  float xB = clamp(0.5 + 0.5 * aB / u_clipB, 0.0, 1.0);
  vec4 over = texture(u_lutB, vec2(xB, 0.5));
  if (u_blendMode == 1) {
    return vec4(base.rgb * mix(vec3(1.0), over.rgb, u_overlayOpacity), base.a);
  }
  return vec4(mix(base.rgb, over.rgb, u_overlayOpacity), base.a);
}
`;

/** Build the 256x1 RGBA LUT bytes for a suite colormap key; `reverse`
 *  flips the map end-for-end (LUT-level, so every consumer — shaders,
 *  colorbars, the map raster mirror — reverses identically). */
export function buildLut(key, reverse = false) {
  const map = COLOR_MAPS[key];
  if (!map) throw new Error(`Unknown colormap: ${key}`);
  const lut = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = map.fn((reverse ? 255 - i : i) / 255);
    lut[i * 4] = r;
    lut[i * 4 + 1] = g;
    lut[i * 4 + 2] = b;
    lut[i * 4 + 3] = 255;
  }
  return lut;
}

/**
 * CPU mirror of DISPLAY_GLSL's shadeAmp for canvas-2D consumers (the Map
 * window's time-slice raster): symmetric clip around zero into the LUT,
 * nulls transparent. Kept HERE so the amplitude→color math still lives in
 * one place; any change to shadeAmp must change this identically (the
 * shadeAmpPixels jest suite pins the mapping). This mirror models the
 * PRIMARY-only path — co-rendering (W2.4) is a section/cube feature and
 * the map raster stays single-volume; the overlay's CPU mirror lives in
 * SliceRenderer.referenceRender for the self-test.
 *
 * @param {Float32Array} data amplitudes (1e30 nulls), row-major
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array} lut 256x4 RGBA from buildLut()
 * @param {{gain: number, polarity: number, clip: number}} display
 * @returns {Uint8ClampedArray} width*height*4 RGBA, null cells alpha 0
 */
export function shadeAmpPixels(data, width, height, lut, { gain, polarity, clip }) {
  const out = new Uint8ClampedArray(width * height * 4);
  const safeClip = Math.max(clip, 1e-12);
  for (let c = 0; c < width * height; c++) {
    const amp = data[c];
    if (Math.abs(amp) > 1.0e29) continue;          // null: transparent
    const a = amp * gain * polarity;
    const x = Math.min(1, Math.max(0, 0.5 + (0.5 * a) / safeClip));
    // LUT texel pick matches SliceRenderer.referenceRender: floor(x*256)
    const li = Math.min(255, Math.floor(x * 256)) * 4;
    const o = c * 4;
    out[o] = lut[li];
    out[o + 1] = lut[li + 1];
    out[o + 2] = lut[li + 2];
    out[o + 3] = 255;
  }
  return out;
}

/** Compile a shader or throw with the info log. */
export function compileShader(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(`Shader compile failed: ${gl.getShaderInfoLog(s)}`);
  }
  return s;
}

/** Link a program from vertex/fragment sources or throw. */
export function linkProgram(gl, vertSrc, fragSrc) {
  const prog = gl.createProgram();
  gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, vertSrc));
  gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, fragSrc));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`Program link failed: ${gl.getProgramInfoLog(prog)}`);
  }
  return prog;
}
