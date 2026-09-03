// PT7: the AI proposal is data the user confirms, never a trace. These
// pin the normalisation, the edge-assumed calibration and the edit diff.

import {
  PROPOSAL_KEYS, parseScanProposal, proposalToCalibration, proposalEdited, M_PER_FT,
} from '../services/scanProposal';

const RAW = {
  mnemonic: ' gr ', unit: 'GAPI', depth_unit: 'FT', depth_top: '2000', depth_bottom: 2100,
  value_left: 0, value_right: '150', value_log: 'false', curve_color_hex: 'FF0000',
  confidence: 1.4, notes: 'Header partly cut.', extra: 'dropped',
};

test('parseScanProposal normalises strings, numbers, units, colour and confidence; unknown keys drop', () => {
  const p = parseScanProposal(RAW);
  expect(Object.keys(p).sort()).toEqual([...PROPOSAL_KEYS].sort());
  expect(p).toMatchObject({
    mnemonic: 'GR', unit: 'GAPI', depth_unit: 'ft', depth_top: 2000, depth_bottom: 2100,
    value_left: 0, value_right: 150, value_log: false, curve_color_hex: '#ff0000', confidence: 1,
    notes: 'Header partly cut.',
  });
  expect(p.extra).toBeUndefined();
  const empty = parseScanProposal({ mnemonic: null, depth_unit: 'furlongs', curve_color_hex: '#fff', value_log: true });
  expect(empty).toMatchObject({ mnemonic: null, depth_unit: null, curve_color_hex: null, value_log: true, depth_top: null });
  expect(() => parseScanProposal(null)).toThrow(/no proposal/);
  expect(() => parseScanProposal([1])).toThrow(/no proposal/);
});

test('proposalToCalibration assumes image edges, converts feet at the door, and drops half-read axes', () => {
  const p = parseScanProposal(RAW);
  const cal = proposalToCalibration(p, { width: 200, height: 300 });
  expect(cal.depthCal).toEqual([{ pixel: 0, value: 2000 * M_PER_FT }, { pixel: 299, value: 2100 * M_PER_FT }]);
  expect(cal.valueCal).toEqual([{ pixel: 0, value: 0 }, { pixel: 199, value: 150 }]);
  expect(cal).toMatchObject({ valueLog: false, assumedEdges: true, depthUnitIn: 'ft', mnemonic: 'GR', unit: 'GAPI', seedHex: '#ff0000' });
  // metres pass through; a missing value_right leaves valueCal null; a log axis with a zero end is unusable
  const m = proposalToCalibration(parseScanProposal({ depth_unit: 'm', depth_top: 1000, depth_bottom: 1100, value_left: 0.2, value_log: true }), { width: 100, height: 100 });
  expect(m.depthCal[0].value).toBe(1000);
  expect(m.valueCal).toBeNull();
  const lg = proposalToCalibration(parseScanProposal({ value_left: 0, value_right: 2000, value_log: true }), { width: 100, height: 100 });
  expect(lg.valueCal).toBeNull();
  expect(lg.assumedEdges).toBe(false);
});

test('proposalEdited lists the keys the user changed after Accept', () => {
  const p = parseScanProposal(RAW);
  expect(proposalEdited(p, p)).toEqual([]);
  expect(proposalEdited(p, { ...p, value_right: 200, mnemonic: 'SGR', confidence: 0.1, notes: 'x' })).toEqual(['mnemonic', 'value_right']);
});
