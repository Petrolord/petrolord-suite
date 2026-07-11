// Shared GLSL + LUT helpers for the 2D slice renderer and the 3D cube
// renderer. Both shaders MUST shade amplitudes identically (domain rule:
// display math never touches stored data), so the sampling and colormap
// code lives here once.

import { COLOR_MAPS } from '@/utils/colorMaps';

/**
 * Amplitude sampling chunk. Declares u_data / u_traceRms / u_traceBalance
 * / u_interp and provides:
 *   float sampleBalanced(vec2 t, out bool isNull)
 * t is a normalized texture coordinate (x = data width axis, y = trace
 * axis). Returns the per-trace-rms-balanced amplitude. u_interp == 1 runs
 * null-aware bicubic Catmull-Rom via texelFetch (no float-linear
 * extension needed): a pixel is null iff its NEAREST texel is null, and
 * null neighbours contribute the centre value so null regions keep hard
 * edges. u_interp == 0 is the exact-NEAREST path the CPU-reference
 * self-test models.
 */
export const SAMPLING_GLSL = `
uniform sampler2D u_data;      // R32F amplitudes
uniform sampler2D u_traceRms;  // R32F per-trace rms, x = trace
uniform int   u_traceBalance;  // 1 = divide by per-trace rms
uniform int   u_interp;        // 1 = smooth (bicubic Catmull-Rom), 0 = nearest

// Catmull-Rom weights for taps at offsets -1, 0, +1, +2 around the cell.
vec4 cubicWeights(float f) {
  float f2 = f * f;
  float f3 = f2 * f;
  return vec4(
    0.5 * (-f3 + 2.0 * f2 - f),
    0.5 * (3.0 * f3 - 5.0 * f2 + 2.0),
    0.5 * (-3.0 * f3 + 4.0 * f2 + f),
    0.5 * (f3 - f2));
}

float rmsScaleAt(int trace) {
  float r = texelFetch(u_traceRms, ivec2(trace, 0), 0).r;
  return r > 0.0 ? 1.0 / r : 0.0;
}

float sampleBalanced(vec2 t, out bool isNull) {
  isNull = false;
  if (u_interp == 1) {
    ivec2 sz = textureSize(u_data, 0);
    vec2 pos = t * vec2(sz) - 0.5;
    ivec2 base = ivec2(floor(pos));
    vec2 f = pos - vec2(base);
    ivec2 nearestT = clamp(ivec2(t * vec2(sz)), ivec2(0), sz - 1);
    float centre = texelFetch(u_data, nearestT, 0).r;
    if (abs(centre) > 1.0e29) { isNull = true; return 0.0; }
    float bC = centre * (u_traceBalance == 1 ? rmsScaleAt(nearestT.y) : 1.0);
    vec4 wx = cubicWeights(f.x);
    vec4 wy = cubicWeights(f.y);
    float acc = 0.0;
    for (int j = 0; j < 4; j++) {
      int py = clamp(base.y - 1 + j, 0, sz.y - 1);
      float rScale = u_traceBalance == 1 ? rmsScaleAt(py) : 1.0;
      float row = 0.0;
      for (int i = 0; i < 4; i++) {
        int px = clamp(base.x - 1 + i, 0, sz.x - 1);
        float raw = texelFetch(u_data, ivec2(px, py), 0).r;
        row += wx[i] * (abs(raw) > 1.0e29 ? bC : raw * rScale);
      }
      acc += wy[j] * row;
    }
    return acc;
  }
  float amp = texture(u_data, t).r;
  if (abs(amp) > 1.0e29) { isNull = true; return 0.0; }
  float scale = 1.0;
  if (u_traceBalance == 1) {
    float rms = texture(u_traceRms, vec2(t.y, 0.5)).r;
    scale = rms > 0.0 ? 1.0 / rms : 0.0;
  }
  return amp * scale;
}
`;

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

/** Build the 256x1 RGBA LUT bytes for a suite colormap key. */
export function buildLut(key) {
  const map = COLOR_MAPS[key];
  if (!map) throw new Error(`Unknown colormap: ${key}`);
  const lut = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = map.fn(i / 255);
    lut[i * 4] = r;
    lut[i * 4 + 1] = g;
    lut[i * 4 + 2] = b;
    lut[i * 4 + 3] = 255;
  }
  return lut;
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
