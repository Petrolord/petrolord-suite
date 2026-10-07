import { buildQiProspectRecord, qiProspectProblem, qiProspectLink, readQiProspect, QI_PROSPECT_CONTRACT } from '../qiProspectSource';

const analysis = {
  trap: { crest: { depthM: 2000 }, spill: { depthM: 2160 }, columnM: 160, areaKm2: 1.2, grvSpillM3: 9.8e7, limitedByEdge: true },
  anomaly: { conformance: 0.96, insideClosure: 1, impliedContactDepthM: 2100, grvImpliedM3: 3.9e7 },
  evidence: { independent: 2 },
  assessment: { recommendation: 'mature', label: 'Mature', seismicSupport: 'supports', reasons: ['fits'] },
};
const prospect = { id: 'p1', name: 'Ekene North', target: 'SAND A', anomaly: { threshold: 0.5, sense: 'high' }, evidence: [{ name: 'RMS', source: 'full_stack' }], competing: [{ name: 'tuning', status: 'ruled-out' }] };

test('the record: every field, no chance of any kind', () => {
  const r = buildQiProspectRecord({ prospect, analysis, projectId: 'qp1', projectName: 'Keta QI', surfaceName: 'Top', attributeName: 'RMS', feasibility: 'feasible', now: 'T' });
  expect(r.contract).toBe(QI_PROSPECT_CONTRACT);
  expect(r.trap).toMatchObject({ crest_depth_m: 2000, spill_depth_m: 2160, limited_by_edge: true, surface: 'Top' });
  expect(r.anomaly).toMatchObject({ present: true, conformance: 0.96, implied_contact_depth_m: 2100, source: 'RMS' });
  expect(r.assessment.seismic_support).toBe('supports');
  expect(JSON.stringify(r)).not.toMatch(/"pg"|chance_of_success|gcos/i);
  expect(qiProspectProblem(r)).toBeNull();
  expect(qiProspectProblem({ contract: 'rf-1' })).toMatch(/rf-1/);
  expect(buildQiProspectRecord({ prospect: { ...prospect, anomaly: null }, analysis: { ...analysis, anomaly: null } }).anomaly).toEqual({ present: false });
});

test('link and reader', async () => {
  expect(qiProspectLink('/x', 'a b', 'p1')).toBe('/x?qiProject=a%20b&qiProspect=p1');
  const rec = buildQiProspectRecord({ prospect, analysis });
  const supa = (data, error = null) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data, error }) }) }) }) });
  expect(await readQiProspect(supa({ id: 'q', inputs_data: { prospects: [{ id: 'p1', record: rec }] } }), 'q', 'p1')).toEqual({ ok: true, record: rec });
  expect((await readQiProspect(supa(null), 'q', 'p1')).reason).toMatch(/not found/);
  expect((await readQiProspect(supa(null, { code: '42P01', message: 'relation does not exist' }), 'q', 'p1')).reason).toMatch(/not switched on/);
  expect((await readQiProspect(supa({ inputs_data: { prospects: [{ id: 'p1' }] } }), 'q', 'p1')).ok).toBe(false);
});
