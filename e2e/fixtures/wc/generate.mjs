// Well Correlation evidence kit (AppUpgrade WC-U1, 2026-09-29).
// Run: node e2e/fixtures/wc/generate.mjs   (deterministic, no RNG)
//
// hostile/wells.json   registry rows as users leave them (in-memory seed shape):
//   BONGA G1-UP  curves stored bottom-up by a G1-era import (start > stop)
//   ARLO 12/14   a US-survey-feet state-plane pair 1,000 m apart (EPSG:2277)
//   OKAN PX-4    UTM metres (a different CRS from ARLO)
//   IDU 7        deviated (0 to 40 degrees below 1,850 m) with no KB
//   IDU 9        no deviation survey, KB 28 m
//   IDU 11       Kingdom-style upper-case tops and a repeated top (fault repeat)
// hostile/tops_*   tops files as other tools write them (read through the
//   Suite's tops door, Well Data Manager's tops sheet paste)
// saved/section-*.json  geo_correlation_sections rows as each release stored them

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = (dir, name, text) => fs.writeFileSync(path.join(here, dir, name), text);

const STEP = 0.5;
function curvesFor(top, base, tops, { upward = false } = {}) {
  const n = Math.round((base - top) / STEP) + 1;
  const DEPT = []; const GR = []; const RT = [];
  for (let i = 0; i < n; i++) {
    const md = top + i * STEP;
    const zone = tops.filter((t) => t.md_m <= md).length;
    const sand = zone % 2 === 1;
    const w = Math.sin(md / 4);
    DEPT.push(md); GR.push(Math.round(((sand ? 38 : 102) + 7 * w) * 100) / 100); RT.push(Math.round(((sand ? 22 : 2.4) * (1 + 0.1 * w)) * 1000) / 1000);
  }
  if (upward) { DEPT.reverse(); GR.reverse(); RT.reverse(); }
  const meta = (unit) => (upward
    ? { start_md_m: base, stop_md_m: top, step_m: null, n_samples: n, unit, provenance: { source_file: 'g1_upward.las' } }
    : { start_md_m: top, stop_md_m: base, step_m: STEP, n_samples: n, unit });
  return { curves: { DEPT, GR, RT }, logMeta: { DEPT: meta('M'), GR: meta('GAPI'), RT: meta('OHMM') } };
}

const tops = (id, list) => list.map(([name, md, type = 'formation_top'], i) => ({ id: `${id}-top-${i}`, well_id: id, name, md_m: md, surface_type: type }));
function well(id, name, extra, topList, opts = {}) {
  const t = tops(id, topList);
  return { id, name, user_id: 'user-dev', organization_id: null, is_own: true, td_md_m: 2100, deviation: null, ...extra, tops: t, ...curvesFor(1800, 2100, t, opts) };
}

const STD = [['Top Agbada', 1880], ['Base Seal', 1960], ['Top Akata', 2040]];
const wells = [
  well('hw-g1-upward', 'BONGA G1-UP', { uwi: 'NG-BNG-0001', surface_x: 470200, surface_y: 480300, crs: 'EPSG:32632', xy_unit: 'm', kb_m: 30 }, STD, { upward: true }),
  well('hw-ft-a', 'ARLO 12', { uwi: '42-001-00012', surface_x: 2300000, surface_y: 13900000, crs: 'EPSG:2277', xy_unit: 'ftUS', kb_m: 12 }, STD.map(([n, d]) => [n, d + 10])),
  // 1,000 m east of ARLO 12: 1000 / 0.3048006096 US survey feet
  well('hw-ft-b', 'ARLO 14', { uwi: '42-001-00014', surface_x: 2300000 + 1000 / (1200 / 3937), surface_y: 13900000, crs: 'EPSG:2277', xy_unit: 'ftUS', kb_m: 12 }, STD.map(([n, d]) => [n, d + 18])),
  well('hw-utm', 'OKAN PX-4', { uwi: 'NG-OKN-0004', surface_x: 471500, surface_y: 480900, crs: 'EPSG:32632', xy_unit: 'm', kb_m: 25 }, STD.map(([n, d]) => [n, d - 6])),
  well('hw-nokb', 'IDU 7', { uwi: 'NG-IDU-0007', surface_x: 472400, surface_y: 481200, crs: 'EPSG:32632', xy_unit: 'm', kb_m: 0,
    deviation: [{ md: 0, inc: 0, azi: 0 }, { md: 1850, inc: 0, azi: 0 }, { md: 2100, inc: 40, azi: 120 }] }, STD.map(([n, d]) => [n, d + 4])),
  well('hw-nosurvey', 'IDU 9', { uwi: 'NG-IDU-0009', surface_x: 473100, surface_y: 481000, crs: 'EPSG:32632', xy_unit: 'm', kb_m: 28, deviation: null }, STD.map(([n, d]) => [n, d - 2])),
  well('hw-case', 'IDU 11', { uwi: 'NG-IDU-0011', surface_x: 473900, surface_y: 480700, crs: 'EPSG:32632', xy_unit: 'm', kb_m: 27 },
    [['TOP AGBADA', 1885], ['Top Agbada', 1945], ['Base Seal ', 1965], ['Top Akata', 2046]]),
];
out('hostile', 'wells.json', `${JSON.stringify(wells)}\n`);

const ft = (m) => (m / 0.3048).toFixed(1);
out('hostile', 'tops_petrel_wells_ft.txt', [
  'Well\tSurface\tMD (ft)\tTWT (ms)\tZ (ft)\tInterpreter',
  `OKAN PX-4\tTop Agbada\t${ft(1874)}\t1601.2\t-${ft(1849)}\tama`,
  `OKAN PX-4\tSand D\t${ft(1990)}\t1688.0\t-${ft(1965)}\tama`,
  `IDU 9\tSand D\t${ft(1994)}\t1690.4\t-${ft(1966)}\tama`,
].join('\n') + '\n');
out('hostile', 'tops_kingdom_export.csv', [
  'UWI,Well Name,Formation,MD (ft),TVDSS (ft),Source',
  `NG-OKN-0004,OKAN PX-4,SAND D,${ft(1990)},${ft(1965)},Kingdom`,
  `NGIDU0009,IDU 9,SAND D,${ft(1994)},${ft(1966)},Kingdom`,
].join('\n') + '\n');
out('hostile', 'tops_petra_export.txt', [
  'UWI\tLABEL\tFMNAME\tDEPTH',
  `NG-OKN-0004\tOKAN PX-4\tSand E\t${ft(2010)}`,
  `NG-IDU-0009\tIDU 9\tSand E\t${ft(2016)}`,
].join('\n') + '\n');
out('hostile', 'tops_tvdss_only.csv', [
  'Well,Surface,Depth (TVDSS m)',
  'OKAN PX-4,Sand F,1990',
  'IDU 9,Sand F,1995',
].join('\n') + '\n');
out('hostile', 'tops_odd_order.csv', [
  'MD (m),Comment,Top,Well',
  '2040,base first,Top Akata,IDU 9',
  '1878,,Top Agbada,IDU 9',
  '1958,,Base Seal,IDU 9',
].join('\n') + '\n');
out('hostile', 'tops_duplicates.csv', [
  'Well,Top,MD',
  'IDU 9,Sand G,2001',
  'IDU 9,SAND G,2003',
  'OKAN PX-4,Sand G,1999',
].join('\n') + '\n');
out('hostile', 'tops_elevation_z.csv', [
  'Well,Horizon,Z',
  'OKAN PX-4,Sand H,-1975',
  'IDU 9,Sand H,-1978',
].join('\n') + '\n');
// WC-U2-004: a time-only file (refused), a semicolon file with comma
// decimals, and TVDSS rows the door must name (no KB, unknown well, no name,
// not a number, above sea level on a well whose KB puts it above the rig)
out('hostile', 'tops_twt_only.csv', ['Well,Horizon,TWT (ms)', 'OKAN PX-4,Sand K,1650'].join('\n') + '\n');
out('hostile', 'tops_semicolon_comma.csv', ['Well;Top;TVDSS (m)', 'OKAN PX-4;Sand J;1990,5', 'IDU 9;Sand J;1996,25'].join('\n') + '\n');
out('hostile', 'tops_tvdss_problems.csv', [
  'Well,Top,TVDSS (m)', 'IDU 7,Sand L,1950', 'NO SUCH WELL,Sand L,1950', 'OKAN PX-4,,1950', 'OKAN PX-4,Sand L,abc', 'OKAN PX-4,Sand L,-40',
].join('\n') + '\n');

// ---- saved sections, one per release ---------------------------------------
const save = (name, row) => out('saved', name, `${JSON.stringify(row, null, 2)}\n`);
const KETA = ['corr-w1', 'corr-w2', 'corr-w3'];
save('section-g3-2026-07-13.json', {
  id: 'sec-g3', user_id: 'user-dev', name: 'Default section', well_ids: KETA,
  datum: { mode: 'flatten', topName: 'Top Dome', datumM: 1500 }, track_layout: {},
  created_at: '2026-07-13T12:00:00Z', updated_at: '2026-07-13T12:00:00Z',
});
save('section-wc2-2026-09-03.json', {
  id: 'sec-wc2', user_id: 'user-dev', name: 'Default section', well_ids: ['corr-w2', 'corr-w1', 'corr-w3'],
  datum: { mode: 'structural' },
  track_layout: {
    // a version 1 layout with the user's own copy active (fork of Raw quicklook)
    layouts: {
      version: 1, activeTemplateId: 'wc2-user-1',
      templates: [{ id: 'wc2-user-1', name: 'My GR and RT', builtin: false, tracks: [
        { id: 'u-gr', title: 'GR (API)', type: 'curves', width: 1, scale: 'linear', min: 0, max: 150, curves: [{ source: 'input:GR', label: 'GR', color: '#059669' }], fills: [] },
        { id: 'u-rt', title: 'RT (ohm.m)', type: 'curves', width: 1, scale: 'log', min: 0.2, max: 2000, curves: [{ source: 'input:RT', label: 'RT', color: '#dc2626' }], fills: [] },
      ] }],
    },
    depthUnit: 'ft', depthRef: 'tvdss', spacing: 'proportional',
    zoneMode: 'pair', shownTops: ['Top Dome', 'Base Sand'], zonePair: ['Top Dome', 'Base Sand'],
  },
  created_at: '2026-09-03T12:00:00Z', updated_at: '2026-09-03T12:00:00Z',
});
save('section-st2-2026-09-06.json', {
  id: 'sec-st2', user_id: 'user-dev', name: 'Default section', well_ids: KETA,
  datum: { mode: 'stretch', upperName: 'Top Dome', lowerName: 'Base Sand' },
  track_layout: { depthUnit: 'm', depthRef: 'md', spacing: 'equal', zoneMode: 'consecutive', shownTops: [] },
  schema_version: 1, app_build: '1ffc8a8c9',
  created_at: '2026-09-06T12:00:00Z', updated_at: '2026-09-06T12:00:00Z',
});
save('section-missing-well.json', {
  id: 'sec-missing', user_id: 'user-dev', name: 'Default section', well_ids: ['corr-w1', 'well-deleted-since', 'corr-w2'],
  datum: { mode: 'structural' }, track_layout: { depthUnit: 'm', depthRef: 'md' },
  schema_version: 1, app_build: 'c71824ef6',
  created_at: '2026-09-20T12:00:00Z', updated_at: '2026-09-20T12:00:00Z',
});
save('section-newer-build.json', {
  id: 'sec-newer', user_id: 'user-dev', name: 'Default section', well_ids: KETA,
  datum: { mode: 'structural' }, track_layout: {}, schema_version: 2, app_build: 'future0000',
  created_at: '2026-12-01T12:00:00Z', updated_at: '2026-12-01T12:00:00Z',
});
console.log('wrote', wells.length, 'wells, 7 tops files, 5 saved sections');
