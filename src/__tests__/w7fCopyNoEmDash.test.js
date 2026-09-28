// W7F copy rule: no em dashes in user-facing copy. These three files carried
// one each (the ESP gas callout, the About Us story, the Org Access toast).
// Comment lines are skipped; everything else is copy or code. Negative
// control: on the old files each has a match.
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '../..');
const FILES = [
  'src/components/esp/GasHandlingPanel.jsx',
  'src/pages/company/AboutUs.jsx',
  'src/components/admin/organizations/OrgAccess.jsx',
];

test.each(FILES)('%s has no em dash outside comments', (rel) => {
  const lines = fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n');
  const hits = lines
    .map((l, i) => [i + 1, l])
    .filter(([, l]) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l))
    .filter(([, l]) => /—|&mdash;/.test(l));
  expect(hits).toEqual([]);
});
