// Time-depth from a well's checkshots (AppUpgrade WC-U2-003/U2-004): the
// stored checkshots are [{tvdss_m, twt_ms}] strictly increasing in both
// (validated at the door, WDM PT1). Linear between stations, no
// extrapolation: outside the checkshots the time is unknown (NaN), never a
// guess. Pure.

const rowsOf = (checkshots) => (Array.isArray(checkshots) ? checkshots : [])
  .map((r) => ({ z: Number(r?.tvdss_m), t: Number(r?.twt_ms) }))
  .filter((r) => Number.isFinite(r.z) && Number.isFinite(r.t))
  .sort((a, b) => a.z - b.z);

const interp = (rows, x, from, to) => {
  if (rows.length < 2 || !Number.isFinite(x)) return NaN;
  if (x < rows[0][from] - 1e-9 || x > rows[rows.length - 1][from] + 1e-9) return NaN;
  for (let i = 0; i + 1 < rows.length; i++) {
    const a = rows[i]; const b = rows[i + 1];
    if (x >= a[from] - 1e-9 && x <= b[from] + 1e-9) {
      const d = b[from] - a[from];
      return d > 0 ? a[to] + ((x - a[from]) / d) * (b[to] - a[to]) : a[to];
    }
  }
  return NaN;
};

/** TWT (ms) at a TVDSS (m) through the checkshots; NaN outside them. */
export const twtAtTvdss = (checkshots, tvdssM) => interp(rowsOf(checkshots), tvdssM, 'z', 't');
/** TVDSS (m) at a TWT (ms) through the checkshots; NaN outside them. */
export const tvdssAtTwt = (checkshots, twtMs) => interp(rowsOf(checkshots), twtMs, 't', 'z');
/** The TVDSS range the checkshots cover, or null. */
export function checkshotRange(checkshots) {
  const r = rowsOf(checkshots);
  return r.length >= 2 ? { top: r[0].z, base: r[r.length - 1].z, tTop: r[0].t, tBase: r[r.length - 1].t, n: r.length } : null;
}
