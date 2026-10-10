// The Gather view labelled Ekene-1 "Published ... for Ekene-4": it read the
// single published_gather (the last one published for any well).
import { publishedFor } from '../components/GatherPanel';

const g = (id, name) => ({ well_id: id, well_name: name, published_at: '2026-10-09T10:00:00Z', zone: { name: 'Ekene Sand' } });

test('the label reads this well\'s published gather', () => {
  const avo = { published_gather: g('w4', 'Ekene-4'), published_gathers: { w1: g('w1', 'Ekene-1'), w4: g('w4', 'Ekene-4') } };
  expect(publishedFor(avo, 'w1').well_name).toBe('Ekene-1');
  expect(publishedFor(avo, 'w4').well_name).toBe('Ekene-4');
});

test('another well\'s gather is not shown as this well\'s (the old behaviour is the negative control)', () => {
  const avo = { published_gather: g('w4', 'Ekene-4'), published_gathers: { w4: g('w4', 'Ekene-4') } };
  expect(publishedFor(avo, 'w1')).toBeNull();
  expect(avo.published_gather.well_name).toBe('Ekene-4'); // what the label used to print for w1
  // a project saved before per-well gathers: the single copy counts for its own well only
  expect(publishedFor({ published_gather: g('w2', 'Ekene-2') }, 'w2').well_name).toBe('Ekene-2');
  expect(publishedFor({ published_gather: g('w2', 'Ekene-2') }, 'w3')).toBeNull();
  expect(publishedFor({}, null)).toBeNull();
});
