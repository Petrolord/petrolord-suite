// Dev-only harness route (/dev/stratigraphy-studio, DEV builds only): the
// FULL Stratigraphy Studio app on the in-memory backend, no auth or DB.
// Wells and tops are the Well Correlation sample section, the column is a
// seeded four-unit column, so the Playwright suite can type a top, save a
// unit and toggle the terminology display.
//
// AppUpgrade STRAT-U1 (2026-09-30): the evidence kit reaches the harness.
// ?scaleWells=<n> adds n located ten-curve wells whose eight tops are typed
// and dated (a Wheeler across a field), ?scaleUnits=1 seeds an 84-unit
// column, ?sample=0 drops the KETA wells, and an e2e can seed hostile wells,
// saved sections (newest last) and a saved strat project through
// window.__STRAT_SEED__ ({ wells, sections, project }) before the page loads.

import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import StratWorkstation from './components/StratWorkstation';
import { makeInMemoryBackend } from './services/inMemoryBackend';
import { DEV_APP_PATHS } from '@/components/wells/appLinks';
import { scaleWells } from '../WellCorrelation/services/scaleSection';

// the scale wells' eight tops as a stratigrapher types them (types and ages)
const SCALE_TYPES = {
  'Top Agbada': ['BSFR', 3], 'Sand A': ['formation_top', null], 'Shale A': ['MFS', 5], 'Sand B': ['formation_top', null],
  'Shale B': ['MRS', 8], 'Sand C': ['formation_top', null], 'Top Akata': ['SU', 12], 'Marker K': ['formation_top', 20],
};
const typedScaleWells = (n) => scaleWells(n).map((w) => ({
  ...w,
  tops: w.tops.map((t) => ({ ...t, surface_type: SCALE_TYPES[t.name]?.[0] || 'formation_top', age_ma: SCALE_TYPES[t.name]?.[1] ?? null, hiatus_to_ma: t.name === 'Top Akata' ? 16 : null })),
}));

/** 4 groups, 20 formations, 60 members: an 84-unit column. */
function scaleUnits() {
  const out = [];
  let top = 0;
  for (let g = 0; g < 4; g++) {
    const gid = `su-g${g}`; const gTop = top;
    out.push({ id: gid, name: `Group ${g + 1}`, rank: 'group', parent_id: null, order_index: g, age_top_ma: gTop, age_base_ma: gTop + 15, colour: '#94a3b8' });
    for (let f = 0; f < 5; f++) {
      const fid = `${gid}-f${f}`; const fTop = gTop + f * 3;
      out.push({ id: fid, name: `Fm ${g + 1}.${f + 1}`, rank: 'formation', parent_id: gid, order_index: f, age_top_ma: fTop, age_base_ma: fTop + 3, colour: '#f59e0b' });
      for (let m = 0; m < 3; m++) out.push({ id: `${fid}-m${m}`, name: `Mbr ${g + 1}.${f + 1}.${m + 1}`, rank: 'member', parent_id: fid, order_index: m, age_top_ma: fTop + m, age_base_ma: fTop + m + 1, colour: '#fde68a' });
    }
    top += 15;
  }
  return out.map((u) => ({ user_id: 'user-a', organization_id: null, lithology: null, notes: null, ...u }));
}

export default function StratigraphyStudioHarness() {
  const [params] = useSearchParams();
  const n = Number(params.get('scaleWells')) || 0;
  const sample = params.get('sample') !== '0';
  const manyUnits = params.get('scaleUnits') === '1';
  const backend = useMemo(() => {
    const seed = (typeof window !== 'undefined' && window.__STRAT_SEED__) || {};
    const seedWells = [...(seed.wells || []), ...typedScaleWells(n)];
    const sections = seed.sections || (n ? [{ id: 'section-scale', name: `Field ${n} wells`, well_ids: [...(sample ? ['corr-w1', 'corr-w2', 'corr-w3'] : []), ...seedWells.map((w) => w.id)], datum: { mode: 'structural' }, track_layout: {} }] : null);
    return makeInMemoryBackend({ sample, seedWells, sections, project: seed.project || null, units: manyUnits ? scaleUnits() : null });
  }, [n, sample, manyUnits]);
  return (
    <div className="h-screen w-full overflow-hidden" data-testid="strat-theme-scope">
      <StratWorkstation backend={backend} appPaths={DEV_APP_PATHS} />
    </div>
  );
}
