import React from 'react';
import { jobWarnings } from '../services/jobWarnings';

// The warnings a finished job returned (QI round 3, 2026-10-15). Renders
// nothing when there are none, so runs without warnings look as before.
export default function JobWarnings({ result, testId = 'qi-job-warnings' }) {
  const w = jobWarnings(result);
  if (!w.length) return null;
  return (
    <ul className="mt-1 list-disc pl-4 text-xs text-pl-warning-text" data-testid={testId}>
      {w.map((t) => <li key={t}>{`Warning: ${t}`}</li>)}
    </ul>
  );
}
