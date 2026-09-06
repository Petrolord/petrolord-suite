import { parseCalibrationText, parseTopsText, layersFromTops } from '../services/calibrationImport';

test('a calibration file with depth, Ro and temperature columns reads both, and bad rows are reported', () => {
  const r = parseCalibrationText('Depth_m,Ro,BHT_C\n1500,0.55,\n3000,1.15,110\n3500,abc,120\n4000,,\n');
  expect(r.ro).toEqual([{ depth: 1500, value: 0.55 }, { depth: 3000, value: 1.15 }]);
  expect(r.temp).toEqual([{ depth: 3000, value: 110 }, { depth: 3500, value: 120 }]);
  expect(r.problems).toEqual(['Row 4: Ro "abc" is not a reflectance in percent.', 'Row 5: no Ro or temperature value.']);
  expect(parseCalibrationText('a,b\n1,2').problems[0]).toMatch(/No depth column/);
  // semicolons and a comma decimal
  expect(parseCalibrationText('depth;vitrinite\n2000;0,7').ro).toEqual([{ depth: 2000, value: 0.7 }]);
});

test('tops read with or without a header and become layers with gap thicknesses and placeholder ages', () => {
  const withHeader = parseTopsText('Formation,MD\nUpper Shale,0\nMid Sand,1600\nSource Shale,2800\nBase Sand,3200');
  expect(withHeader.tops.map((t) => t.depth)).toEqual([0, 1600, 2800, 3200]);
  const bare = parseTopsText('Top A\t100\nTop B\t400');
  expect(bare.tops).toEqual([{ name: 'Top A', depth: 100 }, { name: 'Top B', depth: 400 }]);
  const layers = layersFromTops(withHeader.tops, { baseDepth: 4700 });
  expect(layers.map((l) => l.thickness)).toEqual([1600, 1200, 400, 1500]);
  expect(layers.map((l) => l.lithology)).toEqual(['shale', 'sandstone', 'shale', 'sandstone']);
  expect(layers[0]).toMatchObject({ ageStart: 10, ageEnd: 0, agesGuessed: true });
  expect(layersFromTops([{ name: 'Only', depth: 100 }]).map((l) => l.thickness)).toEqual([500]);
});
