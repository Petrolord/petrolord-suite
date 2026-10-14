import { spreadToM } from '../components/DistributionCard';

test('contact spreads typed in feet reach the sampler in metres', () => {
  expect(spreadToM('30', 'ft')).toBeCloseTo(9.144, 10);
  expect(spreadToM('10', 'm')).toBe(10);
  expect(spreadToM('', 'ft')).toBe('');
});
