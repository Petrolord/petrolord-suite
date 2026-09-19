/**
 * Owner copy rule on the Consequence Modelling Studio (PS2): no em or en dashes, and no
 * "X, not Y" contrastive, anywhere in its user-facing files.
 */
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '../../..');
const FILES = [
  'pages/apps/ConsequenceModellingStudio.jsx',
  'pages/apps/ConsequenceModellingStudioHelpGuide.jsx',
  'components/processsafety/consequence/fields.jsx',
  'components/processsafety/consequence/ConsequenceChart.jsx',
  'components/processsafety/consequence/ConsequenceScopeNotice.jsx',
  'components/processsafety/consequence/SourceTermPanel.jsx',
  'components/processsafety/consequence/DispersionPanel.jsx',
  'components/processsafety/consequence/FirePanel.jsx',
  'components/processsafety/consequence/ExplosionPanel.jsx',
  'components/processsafety/consequence/HarmPanel.jsx',
  'contexts/ConsequenceStudioContext.jsx',
  'utils/processSafety/consequenceStudy.js',
  'utils/processSafety/consequenceStudiesService.js',
];

describe.each(FILES)('%s', (rel) => {
  const text = fs.readFileSync(path.join(SRC, rel), 'utf8');
  it('has no em or en dashes', () => {
    expect(text).not.toMatch(/[–—]/);
  });
  it('has no ", not" contrastive', () => {
    expect(text).not.toMatch(/, not (a|an|the|just|only|to|in|on|at|by|for|from|with)?\b/i);
  });
});
