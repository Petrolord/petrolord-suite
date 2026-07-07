// Fractional flow / Buckley-Leverett engine.
//
// Corey relative permeability -> water fractional flow fw(Sw) -> Welge tangent
// construction -> front saturation, breakthrough, and oil recovery vs pore
// volumes injected. Horizontal, immiscible, no capillary/gravity term (the
// classic 1-D Buckley-Leverett displacement).
//
// Corey model on normalized saturation Swn = (Sw - Swc)/(1 - Swc - Sor):
//   krw = krwMax * Swn^nw
//   kro = kroMax * (1 - Swn)^no
// Fractional flow:
//   fw = 1 / (1 + (kro * muW) / (krw * muO))

const clamp01 = (x) => Math.min(1, Math.max(0, x));

export function coreyKr(Sw, p) {
  const { Swc, Sor, krwMax, kroMax, nw, no } = p;
  const denom = 1 - Swc - Sor;
  const Swn = denom > 0 ? clamp01((Sw - Swc) / denom) : 0;
  return {
    Swn,
    krw: krwMax * Math.pow(Swn, nw),
    kro: kroMax * Math.pow(1 - Swn, no),
  };
}

export function fractionalFlow(Sw, p, muW, muO) {
  const { krw, kro } = coreyKr(Sw, p);
  if (krw <= 0) return 0;
  if (kro <= 0) return 1;
  return 1 / (1 + (kro * muW) / (krw * muO));
}

// Endpoint mobility ratio M = (krw@Sor / muW) / (kro@Swc / muO). M > 1 is unfavorable.
export function mobilityRatio(p, muW, muO) {
  return (p.krwMax / muW) / (p.kroMax / muO);
}

// Sampled kr + fw curves across the mobile saturation range [Swc, 1-Sor].
export function buildCurves(p, muW, muO, n = 101) {
  const lo = p.Swc;
  const hi = 1 - p.Sor;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const Sw = lo + ((hi - lo) * i) / n;
    const { krw, kro } = coreyKr(Sw, p);
    pts.push({ Sw, krw, kro, fw: fractionalFlow(Sw, p, muW, muO) });
  }
  return pts;
}

// Numerical dfw/dSw (central difference).
function dfwdSw(Sw, p, muW, muO, h = 1e-4) {
  return (fractionalFlow(Sw + h, p, muW, muO) - fractionalFlow(Sw - h, p, muW, muO)) / (2 * h);
}

// Welge tangent from (Swc, 0): the front saturation Swf is where the secant slope
// fw/(Sw - Swc) is maximal (= tangency). That slope is fw'(Swf).
export function welgeTangent(p, muW, muO, n = 1000) {
  const { Swc, Sor } = p;
  const lo = Swc;
  const hi = 1 - Sor;
  let Swf = null;
  let fwf = 0;
  let best = -Infinity;
  for (let i = 1; i <= n; i++) {
    const Sw = lo + ((hi - lo) * i) / n;
    const d = Sw - Swc;
    if (d <= 1e-6) continue;
    const f = fractionalFlow(Sw, p, muW, muO);
    const slope = f / d;
    if (slope > best) {
      best = slope;
      Swf = Sw;
      fwf = f;
    }
  }
  const fwPrimeF = best > 0 ? best : null; // secant slope == tangent slope at the front
  const QiBt = fwPrimeF ? 1 / fwPrimeF : null; // pore volumes injected at breakthrough
  const SwAvgBt = fwPrimeF ? Swc + 1 / fwPrimeF : null; // avg Sw behind front at BT
  const EDbt = SwAvgBt != null ? (SwAvgBt - Swc) / (1 - Swc) : null; // displacement eff. at BT
  const EDmax = (1 - Sor - Swc) / (1 - Swc); // ultimate displacement efficiency
  return { Swf, fwf, fwPrimeF, QiBt, SwAvgBt, EDbt, EDmax };
}

// Oil recovery (displacement efficiency) vs pore volumes injected, from
// breakthrough to residual. For an outlet saturation Sw2 > Swf:
//   Qi = 1 / fw'(Sw2);  SwAvg = Sw2 + (1 - fw(Sw2)) / fw'(Sw2);  ED = (SwAvg - Swc)/(1 - Swc)
export function recoveryProfile(p, muW, muO, bl, n = 40) {
  const { Swc, Sor } = p;
  const hi = 1 - Sor;
  const pts = [];
  if (bl.QiBt != null) {
    pts.push({ Sw2: bl.Swf, Qi: bl.QiBt, SwAvg: bl.SwAvgBt, ED: bl.EDbt, fw: bl.fwf, breakthrough: true });
  }
  for (let i = 1; i <= n; i++) {
    const Sw2 = bl.Swf + ((hi - bl.Swf) * i) / n;
    const d = dfwdSw(Sw2, p, muW, muO);
    if (!(d > 0)) continue;
    const f = fractionalFlow(Sw2, p, muW, muO);
    const Qi = 1 / d;
    const SwAvg = Sw2 + (1 - f) / d;
    const ED = (SwAvg - Swc) / (1 - Swc);
    pts.push({ Sw2, Qi, SwAvg, ED, fw: f });
  }
  return pts;
}

export function analyzeFractionalFlow(p, muW, muO) {
  const curves = buildCurves(p, muW, muO);
  const bl = welgeTangent(p, muW, muO);
  const recovery = recoveryProfile(p, muW, muO, bl);
  const M = mobilityRatio(p, muW, muO);
  return { curves, bl, recovery, M };
}

export function sampleFractionalFlowData() {
  return {
    params: { Swc: 0.2, Sor: 0.2, krwMax: 0.4, kroMax: 1.0, nw: 2, no: 2 },
    muW: 0.5, // cp
    muO: 5.0, // cp
  };
}
