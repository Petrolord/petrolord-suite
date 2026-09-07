// Curve calculator (Petrophysics Studio PT9f, 2026-09-07): a small,
// safe expression language over a well's curves. No eval: the text is
// tokenized, parsed to an AST with ordinary precedence, and evaluated
// per sample. Identifiers are curve mnemonics (inputs, pipeline outputs,
// any registry curve); NaN propagates; a non-finite result is NaN.
//
// Grammar (lowest to highest precedence):
//   or:      and ('||' and)*
//   and:     cmp ('&&' cmp)*
//   cmp:     sum (('<'|'<='|'>'|'>='|'=='|'!=') sum)?
//   sum:     term (('+'|'-') term)*
//   term:    unary (('*'|'/') unary)*
//   unary:   ('-'|'!') unary | power
//   power:   atom ('^' unary)?           (right-associative)
//   atom:    number | identifier | identifier '(' args ')' | '(' or ')'
// Comparisons and logic yield 1 or 0. Functions: abs, sqrt, exp, ln,
// log10, min, max, pow, clip(x, lo, hi), if(cond, a, b), isnan(x),
// nvl(x, alt). Constants: pi, e.

const FUNCS = {
  abs: [1, (a) => Math.abs(a)],
  sqrt: [1, (a) => Math.sqrt(a)],
  exp: [1, (a) => Math.exp(a)],
  ln: [1, (a) => Math.log(a)],
  log10: [1, (a) => Math.log10(a)],
  min: [2, (a, b) => Math.min(a, b)],
  max: [2, (a, b) => Math.max(a, b)],
  pow: [2, (a, b) => a ** b],
  clip: [3, (x, lo, hi) => Math.min(hi, Math.max(lo, x))],
  if: [3, (c, a, b) => (Number.isNaN(c) ? NaN : (c ? a : b))],
  isnan: [1, (a) => (Number.isNaN(a) ? 1 : 0)],
  nvl: [2, (a, b) => (Number.isNaN(a) ? b : a)],
};
const CONSTS = { pi: Math.PI, e: Math.E };

export const CALC_FUNCTIONS = Object.keys(FUNCS);

function tokenize(text) {
  const out = [];
  let i = 0;
  const s = String(text);
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (/[0-9.]/.test(ch)) {
      const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(s.slice(i));
      if (!m) throw new Error(`Bad number at position ${i + 1}.`);
      out.push({ t: 'num', v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      const m = /^[A-Za-z_][A-Za-z0-9_:.]*/.exec(s.slice(i));
      out.push({ t: 'id', v: m[0] });
      i += m[0].length;
      continue;
    }
    const two = s.slice(i, i + 2);
    if (['<=', '>=', '==', '!=', '&&', '||'].includes(two)) { out.push({ t: 'op', v: two }); i += 2; continue; }
    if ('+-*/^()<>!,'.includes(ch)) { out.push({ t: 'op', v: ch }); i += 1; continue; }
    throw new Error(`Unexpected character "${ch}" at position ${i + 1}.`);
  }
  return out;
}

/** Parse to an AST. Throws an Error with a readable message. */
export function parseExpression(text) {
  const toks = tokenize(text);
  if (!toks.length) throw new Error('The expression is empty.');
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v) => peek() && peek().t === 'op' && peek().v === v;
  const take = (v) => {
    if (!isOp(v)) throw new Error(`Expected "${v}" at token ${p + 1}${peek() ? ` (found "${peek().v}")` : ' (end of expression)'}.`);
    p += 1;
  };

  const or = () => { let n = and(); while (isOp('||')) { p += 1; n = { k: 'bin', op: '||', a: n, b: and() }; } return n; };
  const and = () => { let n = cmp(); while (isOp('&&')) { p += 1; n = { k: 'bin', op: '&&', a: n, b: cmp() }; } return n; };
  const cmp = () => {
    const n = sum();
    for (const op of ['<=', '>=', '==', '!=', '<', '>']) {
      if (isOp(op)) { p += 1; return { k: 'bin', op, a: n, b: sum() }; }
    }
    return n;
  };
  const sum = () => { let n = term(); while (isOp('+') || isOp('-')) { const op = peek().v; p += 1; n = { k: 'bin', op, a: n, b: term() }; } return n; };
  const term = () => { let n = unary(); while (isOp('*') || isOp('/')) { const op = peek().v; p += 1; n = { k: 'bin', op, a: n, b: unary() }; } return n; };
  const unary = () => {
    if (isOp('-')) { p += 1; return { k: 'neg', a: unary() }; }
    if (isOp('!')) { p += 1; return { k: 'not', a: unary() }; }
    return power();
  };
  const power = () => {
    const a = atom();
    if (isOp('^')) { p += 1; return { k: 'bin', op: '^', a, b: unary() }; }
    return a;
  };
  const atom = () => {
    const t = peek();
    if (!t) throw new Error('Unexpected end of expression.');
    if (t.t === 'num') { p += 1; return { k: 'num', v: t.v }; }
    if (t.t === 'id') {
      p += 1;
      if (isOp('(')) {
        p += 1;
        const name = t.v.toLowerCase();
        const spec = FUNCS[name];
        if (!spec) throw new Error(`Unknown function "${t.v}".`);
        const args = [];
        if (!isOp(')')) {
          args.push(or());
          while (isOp(',')) { p += 1; args.push(or()); }
        }
        take(')');
        if (args.length !== spec[0]) throw new Error(`${name}() takes ${spec[0]} argument${spec[0] === 1 ? '' : 's'}, got ${args.length}.`);
        return { k: 'fn', name, args };
      }
      if (Object.prototype.hasOwnProperty.call(CONSTS, t.v.toLowerCase()) && !/[A-Z]/.test(t.v)) return { k: 'num', v: CONSTS[t.v.toLowerCase()] };
      return { k: 'id', v: t.v };
    }
    if (isOp('(')) { p += 1; const n = or(); take(')'); return n; }
    throw new Error(`Unexpected "${t.v}" at token ${p + 1}.`);
  };

  const ast = or();
  if (p < toks.length) throw new Error(`Unexpected "${toks[p].v}" after the expression.`);
  return ast;
}

/** Curve mnemonics an AST references, in first-seen order. */
export function identifiers(ast) {
  const out = [];
  const walk = (n) => {
    if (!n) return;
    if (n.k === 'id') { if (!out.includes(n.v)) out.push(n.v); return; }
    if (n.k === 'fn') { n.args.forEach(walk); return; }
    walk(n.a); walk(n.b);
  };
  walk(ast);
  return out;
}

const BIN = {
  '+': (a, b) => a + b, '-': (a, b) => a - b, '*': (a, b) => a * b, '/': (a, b) => a / b, '^': (a, b) => a ** b,
  '<': (a, b) => (a < b ? 1 : 0), '<=': (a, b) => (a <= b ? 1 : 0), '>': (a, b) => (a > b ? 1 : 0), '>=': (a, b) => (a >= b ? 1 : 0),
  '==': (a, b) => (a === b ? 1 : 0), '!=': (a, b) => (a !== b ? 1 : 0),
  '&&': (a, b) => (a && b ? 1 : 0), '||': (a, b) => (a || b ? 1 : 0),
};

/** Evaluate one sample; `get(name)` returns the curve value at that sample. */
export function evalNode(n, get) {
  switch (n.k) {
    case 'num': return n.v;
    case 'id': return get(n.v);
    case 'neg': return -evalNode(n.a, get);
    case 'not': return evalNode(n.a, get) ? 0 : 1;
    case 'fn': return FUNCS[n.name][1](...n.args.map((a) => evalNode(a, get)));
    default: {
      const a = evalNode(n.a, get);
      const b = evalNode(n.b, get);
      // arithmetic, comparisons and logic on NaN are NaN: unknown stays
      // unknown (isnan / nvl / if are the explicit ways to handle it)
      if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
      return BIN[n.op](a, b);
    }
  }
}

/**
 * Evaluate an expression over a well.
 * @param {string} text
 * @param {Object<string, ArrayLike<number>>} curvesByKey
 * @param {number} n sample count
 * @returns {{data: Float64Array, ids: string[], missing: string[]}}
 * @throws on a syntax error or an unknown curve
 */
export function evalCurve(text, curvesByKey, n) {
  const ast = parseExpression(text);
  const ids = identifiers(ast);
  const missing = ids.filter((k) => !curvesByKey[k]);
  if (missing.length) throw new Error(`Unknown curve${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`);
  const data = new Float64Array(n);
  let i = 0;
  const get = (name) => curvesByKey[name][i];
  for (i = 0; i < n; i++) {
    const v = evalNode(ast, get);
    data[i] = Number.isFinite(v) ? v : NaN;
  }
  return { data, ids, missing };
}

/** Summary of a result curve for the preview line. */
export function curveStats(data) {
  let n = 0;
  let lo = Infinity;
  let hi = -Infinity;
  let s = 0;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (!Number.isFinite(v)) continue;
    n += 1; s += v;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return { valid: n, total: data.length, min: n ? lo : NaN, max: n ? hi : NaN, mean: n ? s / n : NaN };
}

/** Mnemonic rule for a new curve: letters, digits, underscore, 1 to 16 chars, upper-cased. */
export function normalizeMnemonic(text) {
  const m = String(text || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  return m.slice(0, 16);
}

/** Worked examples the dialog offers. */
export const CALC_EXAMPLES = [
  { label: 'Hydrocarbon pore volume', mnemonic: 'HCPV', unit: 'V/V', expr: 'PHIE * (1 - SW)' },
  { label: 'Total porosity from PHIE and a shale point', mnemonic: 'PHIT_X', unit: 'V/V', expr: 'PHIE + VSH * 0.06' },
  { label: 'Effective porosity from PHIT', mnemonic: 'PHIE_X', unit: 'V/V', expr: 'clip(PHIT - VSH * 0.06, 0, 1)' },
  { label: 'Net flag by cutoffs', mnemonic: 'NET', unit: 'FLAG', expr: 'if(PHIE >= 0.08 && VSH <= 0.5, 1, 0)' },
  { label: 'Log10 resistivity', mnemonic: 'LOGRT', unit: '', expr: 'log10(RT)' },
  { label: 'Sonic porosity, Wyllie', mnemonic: 'PHIS_X', unit: 'V/V', expr: '(DT - 182) / (656 - 182)' },
];
