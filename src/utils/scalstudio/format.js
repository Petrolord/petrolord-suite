/**
 * Number formats of SCAL Studio's cards (SCAL-U1, PL12): a missing value
 * prints EMPTY_VALUE ('n/a'), never a dash. Pure.
 */
import { EMPTY_VALUE } from '@/lib/emptyValue';

const fixed = (d) => (v) => (v == null || !Number.isFinite(Number(v)) ? EMPTY_VALUE : Number(v).toFixed(d));

export const sfmt = Object.freeze({ f0: fixed(0), f1: fixed(1), f2: fixed(2), f3: fixed(3), f4: fixed(4) });
