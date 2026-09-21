/**
 * Reservoir Balance: stored results keep rendering across the drive-index
 * rename (engines #167).
 *
 * The oil path used to publish the rock and connate water expansion term as
 * `sdi` / `final_sdi`; it is `cdi` / `final_cdi` on both fluid systems now.
 * Results written before the rename are still in rb_results, and their
 * plot_data carries the series under `sdi` with a `cdi` array that EXISTS but
 * is all null. That is the case a plain `plot.cdi ?? plot.sdi` gets wrong,
 * because the null-ish check passes on an array of nulls, so it is the case
 * these tests pin.
 */
import { buildPlotDataCsv } from '../mbalReportExport.js';

const columnOf = (csv, name) => {
  const [header, ...rows] = csv.split('\n');
  const idx = header.split(',').indexOf(name);
  if (idx === -1) return null;
  return rows.map((r) => r.split(',')[idx]);
};

const basePlot = (extra) => ({
  plot_data: {
    timestep_index: [0, 1, 2],
    pressure: [3000, 2900, 2800],
    ddi: [null, 0.61, 0.58],
    gdi: [null, 0.33, 0.35],
    wdi: [null, 0.02, 0.03],
    ...extra,
  },
});

describe('buildPlotDataCsv drive-index columns', () => {
  it('uses cdi when the run was written after the rename', () => {
    const csv = buildPlotDataCsv(basePlot({ cdi: [null, 0.04, 0.04], sdi: [null, 0.04, 0.04] }));
    expect(columnOf(csv, 'cdi')).toEqual(['', '0.04', '0.04']);
    expect(columnOf(csv, 'sdi')).toBeNull();   // the legacy name is not exported
  });

  it('falls back to a legacy sdi series when cdi exists but is all null', () => {
    const csv = buildPlotDataCsv(basePlot({ cdi: [null, null, null], sdi: [null, 0.04, 0.05] }));
    expect(columnOf(csv, 'cdi')).toEqual(['', '0.04', '0.05']);
  });

  it('falls back when the legacy row has no cdi key at all', () => {
    const csv = buildPlotDataCsv(basePlot({ sdi: [null, 0.04, 0.05] }));
    expect(columnOf(csv, 'cdi')).toEqual(['', '0.04', '0.05']);
  });

  it('emits no cdi column when neither series carries data', () => {
    const csv = buildPlotDataCsv(basePlot({ cdi: [null, null, null] }));
    expect(columnOf(csv, 'cdi')).toEqual(['', '', '']);
  });

  it('returns null when there is no plot data at all', () => {
    expect(buildPlotDataCsv({})).toBeNull();
    expect(buildPlotDataCsv(null)).toBeNull();
  });
});
