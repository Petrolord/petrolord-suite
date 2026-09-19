/**
 * Owner copy rule on the LOPA & SIL Studio (PS1): no em or en dashes, and no
 * "X, not Y" contrastive, anywhere in its user-facing files.
 */
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '../../..');
const FILES = [
  'pages/apps/LopaSilStudio.jsx',
  'pages/apps/LopaSilStudioHelpGuide.jsx',
  'components/processsafety/lopa/shared.jsx',
  'components/processsafety/lopa/ScenarioRail.jsx',
  'components/processsafety/lopa/ScopeNotice.jsx',
  'components/processsafety/lopa/LopaWorksheet.jsx',
  'components/processsafety/lopa/SifVerification.jsx',
  'components/processsafety/lopa/ProofTestPanel.jsx',
  'utils/processSafety/lopaStudy.js',
  'utils/processSafety/lopaStudiesService.js',
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
