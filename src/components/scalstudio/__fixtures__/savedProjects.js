// SCAL Studio projects as earlier releases saved them (SCAL-U1, PL5 and
// RL4): the jest suites and the /dev harness (?saved=1) open these to prove
// an old project still opens, computes and reports, with n/a for what it
// never had. Shapes copied from the three live rows of saved_scal_projects
// (2026-10-03, read only): schema 1, no identification, no sources, no unit
// system, no pedigree, no kr block. The payloads are the `inputs_data`.
import { buildDemoSamples } from '../demoSamples';

const DEMO = buildDemoSamples().map((s, i) => {
  // a schema 1 sample carried name, depth, rock, IFT and the two tables only
  const { name, depth_ft, k_md, phi, sigma_dyncm, thetaDeg, krRows, pcRows } = s;
  return { id: `fixture-demo-${i}`, name, depth_ft, k_md, phi, sigma_dyncm, thetaDeg, krRows, pcRows };
});

// SC5 to T1 (2026-07-18 to 2026-09-28): the manual J power law, no samples.
export const SCHEMA_1_MANUAL = Object.freeze({
  id: 'fixture-scal-manual',
  name: 'Obodo D-3 SCAL (saved 2026-09)',
  schema: 1,
  modified: '2026-09-28T10:30:01.449Z',
  curves: { phase: 'oilwater', ow: { Swc: '0.22', Sor: '0.24', krwMax: '0.3', kroMax: '0.85', nw: '2.8', no: '2.2' }, go: { Swc: '0.2', Sgc: '0.05', Sorg: '0.15', krgMax: '0.6', krogMax: '0.85', ng: '2.0', nog: '2.5' }, fwPreviewOn: false, muW: '0.5', muO: '5.0' },
  samples: [],
  capillary: { jMode: 'manual', manual: { a: '0.3', b: '1.3', Swirr: '0.14' }, SwirrOverride: '', includedSampleIds: [], reservoir: { k_md: '220', phi: '0.24', sigma_dyncm: '26', thetaDeg: '30' } },
  height: { gammaW: '1.05', gammaHc: '0.78', fwl_tvdss: '8620', swMin: '0.2', swMax: '0.95' },
  notes: '',
});

// The same release with the demo pair averaged and a shared Swirr override.
export const SCHEMA_1_SAMPLES = Object.freeze({
  id: 'fixture-scal-samples',
  name: 'Demo pair averaged (saved 2026-09)',
  schema: 1,
  modified: '2026-09-28T19:56:04.073Z',
  curves: { phase: 'oilwater', ow: { Swc: '0.18', Sor: '0.22', krwMax: '0.32', kroMax: '0.88', nw: '2.4', no: '2.1' }, go: { Swc: '0.2', Sgc: '0.05', Sorg: '0.15', krgMax: '0.6', krogMax: '0.85', ng: '2.0', nog: '2.5' }, fwPreviewOn: false, muW: '0.5', muO: '5.0' },
  samples: DEMO,
  capillary: { jMode: 'samples', manual: { a: '0.25', b: '1.4', Swirr: '0.15' }, SwirrOverride: '0.12', includedSampleIds: DEMO.map((s) => s.id), reservoir: { k_md: '150', phi: '0.22', sigma_dyncm: '26', thetaDeg: '30' } },
  height: { gammaW: '1.05', gammaHc: '0.80', fwl_tvdss: '', swMin: '0.2', swMax: '0.95' },
  notes: '',
});

/** The two payloads as table rows of a user (the harness and the sharing tests). */
export const savedScalRows = (userId) => [SCHEMA_1_MANUAL, SCHEMA_1_SAMPLES].map((p) => ({
  id: p.id, user_id: userId, project_name: p.name, inputs_data: p, created_at: p.modified, updated_at: p.modified,
}));
