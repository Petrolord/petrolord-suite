/**
 * Well Spacing Optimizer: recovery that responds to spacing, calibrated by
 * the user (WS-U2-002). There is no built-in curve: the app has no cited
 * general relation between recovery and spacing, so it fits one only to
 * points the user gives, each with its source (an analog field, a DCA type
 * well at a known spacing, a simulation run), and prints the fit and the
 * points beside the cases.
 *
 * The fit is least squares of the recovery factor on the natural log of the
 * spacing, RF(S) = a + b ln S (percent, S in acres a well): the form in which
 * recovery is commonly plotted against well density, and the simplest that
 * can bend. Two points at different spacings give the line through them.
 * A case outside the spacing range of the points is extrapolated and says
 * so; a fitted RF at or below 0, or above 100 percent, at a case is refused.
 *
 * The points ride in the form as a JSON string (`rfPoints`), so the case is
 * still one pure function of the form.
 *
 * Pure.
 */
export const RF_POINT_KINDS = Object.freeze([
  ['analog', 'Analog field'],
  ['dca', 'Decline type well (DCA)'],
  ['simulation', 'Simulation run'],
  ['other', 'Other, stated in the source'],
]);

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** The points of a form, as typed (strings kept), or []. */
export function rfPointsOf(form) {
  try {
    const v = JSON.parse(form?.rfPoints || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** The JSON string the form stores. */
export const rfPointsText = (points) => JSON.stringify((points || []).map((p) => ({
  spacing: String(p.spacing ?? ''), rf: String(p.rf ?? ''), kind: p.kind || 'analog', source: String(p.source ?? ''),
})));

/**
 * The fit of the points, or the reasons it cannot be made.
 * @returns {{ok: true, a: number, b: number, r2: ?number, n: number, sMin: number, sMax: number, points: object[]}|{ok: false, errors: string[]}}
 */
export function fitRfAgainstSpacing(rawPoints) {
  const errors = [];
  const pts = [];
  (rawPoints || []).forEach((p, i) => {
    const s = Number(p.spacing);
    const rf = Number(p.rf);
    const src = String(p.source || '').trim();
    if (String(p.spacing ?? '').trim() === '' && String(p.rf ?? '').trim() === '' && !src) return; // an empty row
    if (!(finite(s) && s > 0)) errors.push(`Point ${i + 1}: the spacing must be greater than zero.`);
    else if (!(finite(rf) && rf > 0 && rf <= 100)) errors.push(`Point ${i + 1}: the recovery factor must be above 0 and at most 100 percent.`);
    else if (!src) errors.push(`Point ${i + 1}: give its source (the analog, the decline project and well, or the simulation run). A point with no source is not used.`);
    else pts.push({ spacing: s, rf, kind: p.kind || 'analog', source: src });
  });
  if (errors.length) return { ok: false, errors };
  const xs = [...new Set(pts.map((p) => p.spacing))];
  if (pts.length < 2 || xs.length < 2) return { ok: false, errors: ['Recovery against spacing needs at least two points at different spacings, each with its source.'] };
  const n = pts.length;
  const X = pts.map((p) => Math.log(p.spacing));
  const Y = pts.map((p) => p.rf);
  const mx = X.reduce((a, b) => a + b, 0) / n;
  const my = Y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0; let sxx = 0; let syy = 0;
  for (let i = 0; i < n; i += 1) { sxy += (X[i] - mx) * (Y[i] - my); sxx += (X[i] - mx) ** 2; syy += (Y[i] - my) ** 2; }
  const b = sxy / sxx;
  const a = my - b * mx;
  const r2 = n > 2 && syy > 0 ? (sxy * sxy) / (sxx * syy) : null;
  return { ok: true, a, b, r2, n, sMin: Math.min(...xs), sMax: Math.max(...xs), points: pts };
}

/** The fitted RF (percent) at a spacing. */
export const rfAtSpacing = (fit, spacing) => fit.a + fit.b * Math.log(spacing);

/** The fit in words. */
export function rfFitText(fit) {
  if (!fit?.ok) return null;
  const g = (v) => String(Number(v.toPrecision(5)));
  return `RF = ${g(fit.a)} ${fit.b < 0 ? '-' : '+'} ${g(Math.abs(fit.b))} ln(S), percent, S in acres a well; least squares on ${fit.n} points from ${g(fit.sMin)} to ${g(fit.sMax)} acres${fit.r2 == null ? ' (two points: the line through them)' : `, r2 ${fit.r2.toFixed(3)}`}`;
}
