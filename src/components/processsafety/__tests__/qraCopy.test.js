/**
 * Owner copy rule on the QRA Studio (PS3): no em or en dashes, and no
 * "X, not Y" contrastive, anywhere in its user-facing files.
 */
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '../../..');
const FILES = [
  'pages/apps/QraStudio.jsx',
  'pages/apps/QraStudioHelpGuide.jsx',
  'components/processsafety/qra/fields.jsx',
  'components/processsafety/qra/QraCharts.jsx',
  'components/processsafety/qra/QraScopeNotice.jsx',
  'components/processsafety/qra/EventTreePanel.jsx',
  'components/processsafety/qra/RegisterPanel.jsx',
  'components/processsafety/qra/IndividualRiskPanel.jsx',
  'components/processsafety/qra/SocietalRiskPanel.jsx',
  'components/processsafety/qra/AlarpPanel.jsx',
  'contexts/QraStudioContext.jsx',
  'utils/processSafety/qraStudy.js',
  'utils/processSafety/qraStudiesService.js',
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
