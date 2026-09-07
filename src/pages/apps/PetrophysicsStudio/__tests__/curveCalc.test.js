// PT9f: the curve calculator's expression language — precedence,
// functions, comparisons and logic as 1/0, NaN propagation, readable
// errors, and the worked examples all parse.

import { parseExpression, identifiers, evalCurve, curveStats, normalizeMnemonic, CALC_EXAMPLES } from '../services/curveCalc';

const curves = {
  PHIE: Float64Array.from([0.2, 0.1, NaN, 0.3]),
  SW: Float64Array.from([0.5, 1.0, 0.2, 0.0]),
  VSH: Float64Array.from([0.1, 0.6, 0.2, 0.0]),
  RT: Float64Array.from([10, 1, 100, 0]),
};

test('precedence and associativity', () => {
  const one = (expr) => evalCurve(expr, {}, 1).data[0];
  expect(one('1 + 2 * 3')).toBe(7);
  expect(one('(1 + 2) * 3')).toBe(9);
  expect(one('2 ^ 3 ^ 2')).toBe(512);      // right-associative
  expect(one('-2 ^ 2')).toBe(-4);          // unary minus binds looser than ^
  expect(one('10 / 4')).toBe(2.5);
  expect(one('2 * pi')).toBeCloseTo(6.283185307, 9);
});

test('curves, functions, comparisons and logic', () => {
  const r = evalCurve('PHIE * (1 - SW)', curves, 4);
  expect(Array.from(r.data).map((v) => (Number.isNaN(v) ? null : Number(v.toFixed(6))))).toEqual([0.1, 0, null, 0.3]);
  expect(r.ids).toEqual(['PHIE', 'SW']);
  const flag = evalCurve('if(PHIE >= 0.08 && VSH <= 0.5, 1, 0)', curves, 4).data;
  expect(Array.from(flag).map((v) => (Number.isNaN(v) ? null : v))).toEqual([1, 0, null, 1]);
  expect(Array.from(evalCurve('clip(VSH * 2, 0, 1)', curves, 4).data)).toEqual([0.2, 1, 0.4, 0]);
  const lg = evalCurve('log10(RT)', curves, 4).data;
  expect(lg[0]).toBe(1);
  expect(Number.isNaN(lg[3])).toBe(true);  // log10(0) = -Infinity -> NaN
  expect(Array.from(evalCurve('nvl(PHIE, 0) + isnan(PHIE)', curves, 4).data)).toEqual([0.2, 0.1, 1, 0.3]);
  expect(Array.from(evalCurve('!(SW > 0.4) || VSH > 0.5', curves, 4).data)).toEqual([0, 1, 1, 1]);
});

test('errors are readable: syntax, unknown function, arity, unknown curve', () => {
  expect(() => parseExpression('1 +')).toThrow(/Unexpected end/);
  expect(() => parseExpression('foo(1)')).toThrow(/Unknown function "foo"/);
  expect(() => parseExpression('min(1)')).toThrow(/takes 2 arguments/);
  expect(() => parseExpression('1 2')).toThrow(/after the expression/);
  expect(() => parseExpression('PHIE $ 2')).toThrow(/Unexpected character/);
  expect(() => evalCurve('PHIE * NOPE', curves, 4)).toThrow(/Unknown curve: NOPE/);
  expect(identifiers(parseExpression('a + b * a'))).toEqual(['a', 'b']);
});

test('stats, mnemonic rule, and the examples all parse', () => {
  const s = curveStats(Float64Array.from([1, NaN, 3]));
  expect(s).toEqual({ valid: 2, total: 3, min: 1, max: 3, mean: 2 });
  expect(normalizeMnemonic(' hc pv-1 ')).toBe('HC_PV_1');
  expect(normalizeMnemonic('a'.repeat(30)).length).toBe(16);
  for (const ex of CALC_EXAMPLES) expect(() => parseExpression(ex.expr)).not.toThrow();
});
