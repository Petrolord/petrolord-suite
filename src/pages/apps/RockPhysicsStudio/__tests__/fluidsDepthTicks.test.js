// The Fluids & Gassmann depth axis printed its raw ends after a metre to foot
// conversion ("197.0000029236" on screen, found recording the QI videos).
import { depthTick } from '../components/FluidsPanel';

test('depth ticks are whole depths', () => {
  expect(depthTick(197.0000029236)).toBe('197');
  expect(depthTick(5183.7000002)).toBe('5184');
  expect(depthTick(NaN)).toBeNaN();
});
