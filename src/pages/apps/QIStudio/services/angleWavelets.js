// Angle-dependent wavelets (QI programme Q6b, 2026-10-07; SOW section 5):
// for each angle stack, a wavelet extracted at every well by least squares
// against the reflectivity of that well's logs at the stack's angle, then
// aligned and averaged across the wells (engines qi/wavelets.js). The
// reflectivity is the simultaneous inversion's own Fatti operator with a
// unit spike for a wavelet, so a wavelet extracted here carries the stack's
// amplitude scale for that operator. Beside each, the correlation of every
// well's synthetic (its reflectivity with the stack's wavelet) against the
// stack at the well: the synthetic-against-real check by angle. Pure.
//
// The maths lives in the engines (engines/qi/angleWavelets.js, QI course gate
// E2, 2026-10-11; goldens and an independent oracle there); this is a thin
// re-export so the panel and the course run the same code.

export { angleReflectivity, extractAngleWavelets } from '../engine/angleWavelets';
