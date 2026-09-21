// Guard for the Facility Layout Mapper help guide (FC1-0). Same shape as
// the Economics and Reservoir guards: pin the statements that describe
// shipped behaviour, forbid claims the app does not honour, and enforce
// the owner copy rule (no em dashes).
import fs from 'fs';
import path from 'path';
import { LAYOUT_MAPPER_HELP_CONTENT } from '@/components/facilitylayoutmapper/LayoutMapperHelpGuide';

const ROOT = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(ROOT, 'components/facilitylayoutmapper/LayoutMapperHelpGuide.jsx'), 'utf8');
const text = LAYOUT_MAPPER_HELP_CONTENT.map((s) => `${s.title}. ${s.content}`).join('\n');

const COVERAGE = [
  /centre to centre/i,
  /great-circle/i,
  /not yet been verified against the published literature/i,
  /point-source/i,
  /stack height is ignored/i,
  /wind tilt/i,
  /solar radiation/i,
  /under-predicts/i,
  /radius from the pool centre/i,
  /own allowable radiation/i,
  /names the missing input/i,
  /saved with the layout/i,
  /PL-001/,
  /Pipe runs and custom icons are not checked/i,
  /safety spacing section/i,
  /DXF/, /KML/, /GeoJSON/, /SVG/, /PDF/,
];

// Claims the code does not honour.
const FORBIDDEN = [
  /bend radius (is|are) (checked|enforced)/i,
  /footprint (is|are) (included|accounted)/i,
  /verified against API/i,
  /wind tilt is (modelled|included)/i,
];

const hasEmDash = (s) => /—/.test(s);

describe('Layout Mapper help guide', () => {
  test.each(COVERAGE.map((re) => [re]))('covers %s', (re) => {
    expect(text).toMatch(re);
  });

  test.each(FORBIDDEN.map((re) => [re]))('does not claim %s', (re) => {
    expect(text).not.toMatch(re);
  });

  test('no em dashes in the guide source', () => {
    expect(hasEmDash(source)).toBe(false);
    // negative control: the detector does fire
    expect(hasEmDash('a — b')).toBe(true);
  });

  test('the mapper page mounts the guide', () => {
    const page = fs.readFileSync(path.join(ROOT, 'pages/apps/FacilityLayoutMapper.jsx'), 'utf8');
    expect(page).toMatch(/<LayoutMapperHelpGuide \/>/);
  });
});
