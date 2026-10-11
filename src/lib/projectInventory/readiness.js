// Project Data Inventory: readiness per workflow. For each analysis a
// petrophysics or QI study runs, whether the loaded data supports it
// (ready), supports it with stated limits (limited) or cannot support it
// yet (blocked), with the reason in one line. The project score is the mean
// of the workflows (ready 1, limited 0.5, blocked 0) as a percentage. Pure.

const st = (row, col) => row.cells[col]?.status;
const usable = (row, col) => ['complete', 'partial', 'derived'].includes(st(row, col));
const measured = (row, col) => ['complete', 'partial'].includes(st(row, col));
const good = (row, col) => st(row, col) === 'complete';

export const WORKFLOWS = Object.freeze([
  { key: 'petro', label: 'Petrophysics' },
  { key: 'rockphysics', label: 'Rock physics and fluid substitution' },
  { key: 'tie', label: 'Well-to-seismic tie' },
  { key: 'avo', label: 'AVO feasibility' },
  { key: 'inversion', label: 'Post-stack inversion' },
  { key: 'simultaneous', label: 'Simultaneous inversion' },
  { key: 'depth', label: 'Depth conversion and mapping' },
]);

const ORDER = {
  petro: ['petro', 'rockphysics', 'tie', 'depth', 'avo', 'inversion', 'simultaneous'],
  qi: ['petro', 'rockphysics', 'tie', 'avo', 'inversion', 'simultaneous', 'depth'],
};

export const LEVEL = Object.freeze({
  ready: { key: 'ready', label: 'Ready', value: 1, status: 'complete' },
  limited: { key: 'limited', label: 'Limited', value: 0.5, status: 'partial' },
  blocked: { key: 'blocked', label: 'Blocked', value: 0, status: 'missing' },
});

const of = (k, n) => `${k} of ${n}`;

/**
 * @param {{rows: Array, seismic: Object, interp: Object, audience?: 'qi'|'petro'}} ctx
 * @returns {{workflows: Array<{key, label, level, reason}>, score: number}}
 */
export function readiness({ rows, seismic, interp, audience = 'qi' }) {
  const n = rows.length;
  const out = {};
  if (!n) {
    for (const w of WORKFLOWS) out[w.key] = { level: 'blocked', reason: 'No wells in the inventory.' };
  } else {
    // petrophysics: a shale indicator, deep resistivity and a porosity tool
    const petroOk = rows.filter((r) => (usable(r, 'gr') || usable(r, 'sp')) && usable(r, 'rdeep') && (usable(r, 'rhob') || usable(r, 'nphi') || usable(r, 'dtc')));
    const petroFull = petroOk.filter((r) => good(r, 'gr') && good(r, 'rdeep') && good(r, 'rhob') && good(r, 'nphi'));
    out.petro = petroOk.length === 0
      ? { level: 'blocked', reason: 'No well has a shale indicator, deep resistivity and a porosity log together.' }
      : petroFull.length === n
        ? { level: 'ready', reason: `${of(n, n)} wells have GR, deep resistivity, density and neutron over the interval.` }
        : { level: 'limited', reason: `${of(petroFull.length, n)} wells have the full triple combo over the interval; ${of(petroOk.length, n)} can be evaluated.` };

    // rock physics: Vp and density, porosity and saturation, shear measured or estimated
    const rp = rows.filter((r) => usable(r, 'dtc') && usable(r, 'rhob'));
    const rpFull = rp.filter((r) => measured(r, 'dtc') && measured(r, 'rhob') && usable(r, 'phi') && usable(r, 'sw'));
    const shear = rows.filter((r) => measured(r, 'dts'));
    out.rockphysics = !rp.length
      ? { level: 'blocked', reason: 'No well has both sonic and density.' }
      : rpFull.length === n && shear.length === n
        ? { level: 'ready', reason: `${of(n, n)} wells have sonic, density, shear and an interpretation.` }
        : { level: 'limited', reason: `${of(rp.length, n)} wells have sonic and density; ${of(shear.length, n)} have measured shear; ${of(rows.filter((r) => usable(r, 'phi') && usable(r, 'sw')).length, n)} have porosity and saturation.` };

    // tie: a stack, wells with sonic, density and datum, ties committed
    const tieable = rows.filter((r) => usable(r, 'dtc') && usable(r, 'rhob') && good(r, 'datum'));
    const tied = tieable.filter((r) => usable(r, 'tie') || st(r, 'tie') === 'complete');
    const tiedGood = tieable.filter((r) => good(r, 'tie'));
    out.tie = !seismic.stacks.length
      ? { level: 'blocked', reason: 'No seismic stack in the project.' }
      : !tieable.length
        ? { level: 'blocked', reason: 'No well has sonic, density and a depth reference.' }
        : tiedGood.length === tieable.length
          ? { level: 'ready', reason: `${of(tiedGood.length, tieable.length)} tie wells are tied at a correlation of 0.7 or better.` }
          : { level: 'limited', reason: `${of(tied.length, tieable.length)} tie wells are tied, ${tiedGood.length} at 0.7 or better; ${of(rows.filter((r) => good(r, 'checkshots')).length, n)} wells have checkshots.` };

    // AVO feasibility: measured shear and angle-dependent seismic
    const angleData = seismic.angle.length >= 2 || seismic.gathers.length > 0;
    const vsAny = rows.filter((r) => usable(r, 'dts'));
    out.avo = !angleData
      ? { level: 'blocked', reason: seismic.stacks.length ? 'Full stack only: no angle stacks or gathers.' : 'No seismic in the project.' }
      : !vsAny.length
        ? { level: 'blocked', reason: 'No shear log, measured or estimated, at any well.' }
        : shear.length >= Math.max(2, Math.ceil(n / 2)) && seismic.angle.length >= 2
          ? { level: 'ready', reason: `${of(shear.length, n)} wells have measured shear; ${seismic.angle.length} angle stacks${seismic.gathers.length ? ' and gathers' : ''}.` }
          : { level: 'limited', reason: `${of(shear.length, n)} wells have measured shear; ${seismic.angle.length ? `${seismic.angle.length} angle stacks` : 'gathers only, stacks to build'}.` };

    // post-stack inversion: a stack, horizons, tied wells with sonic and density for the LFM
    const lfm = rows.filter((r) => usable(r, 'dtc') && usable(r, 'rhob'));
    const lfmTied = lfm.filter((r) => usable(r, 'tie'));
    const hz = interp.horizons?.count || 0;
    out.inversion = !seismic.stacks.length
      ? { level: 'blocked', reason: 'No seismic stack in the project.' }
      : !lfm.length
        ? { level: 'blocked', reason: 'No well with sonic and density for the low-frequency model.' }
        : lfmTied.length >= 2 && hz >= 2
          ? { level: 'ready', reason: `Low-frequency model from ${lfmTied.length} tied wells and ${hz} horizons.` }
          : { level: 'limited', reason: `Needs a low-frequency model from ${lfm.length} well${lfm.length === 1 ? '' : 's'} with sonic and density; ${lfmTied.length} tied, ${hz} horizon${hz === 1 ? '' : 's'}.` };

    // simultaneous inversion: three angle stacks, measured shear, wavelets
    const wav = interp.ties?.wavelets || 0;
    out.simultaneous = seismic.angle.length < 2 && !seismic.gathers.length
      ? { level: 'blocked', reason: 'Needs at least three angle stacks (none loaded).' }
      : !shear.length
        ? { level: 'limited', reason: 'No measured shear to calibrate S-impedance; estimated Vs only.' }
        : seismic.angle.length >= 3 && wav >= 1 && hz >= 2
          ? { level: 'ready', reason: `${seismic.angle.length} angle stacks, ${of(shear.length, n)} wells with measured shear, ${wav} wavelet${wav === 1 ? '' : 's'}.` }
          : { level: 'limited', reason: `${seismic.angle.length} angle stack${seismic.angle.length === 1 ? '' : 's'} (three needed for density), ${of(shear.length, n)} wells with measured shear, ${wav} wavelet${wav === 1 ? '' : 's'}.` };

    // depth: horizons, velocity control and datum
    const cs = rows.filter((r) => good(r, 'checkshots')).length;
    const vel = interp.velocity?.count || 0;
    out.depth = !hz
      ? { level: 'blocked', reason: 'No interpreted horizons to convert or map.' }
      : (vel || cs === n) && rows.every((r) => good(r, 'datum'))
        ? { level: 'ready', reason: `${hz} horizons; ${vel ? 'a velocity model' : `checkshots on every well`}; every datum set.` }
        : { level: 'limited', reason: `${hz} horizons; checkshots on ${of(cs, n)} wells${vel ? ' and a velocity model' : ', no velocity model'}.` };
  }
  const workflows = (ORDER[audience] || ORDER.qi).map((k) => {
    const w = WORKFLOWS.find((x) => x.key === k);
    return { key: k, label: w.label, ...out[k] };
  });
  const score = Math.round((workflows.reduce((s, w) => s + LEVEL[w.level].value, 0) / workflows.length) * 100);
  return { workflows, score };
}
