// Published from this Studio (AppUpgrade PETRO-U2-009 and U2-013): each curve
// the Studio's publish wrote on this well, with whether it still matches the
// interpretation now open, and why not. Pre-PT9a PHIE rows (total porosity
// under the PHIE name) are flagged, and the well's owner gets an explicit
// Republish that replaces them with this interpretation's curves.

import React from 'react';
import { PRE_PT9A_PHIE_NOTE } from '@/lib/petroProvenance';

const TONE = {
  current: 'text-pl-success-text',
  stale: 'text-pl-warning-text',
  other: 'text-pl-muted',
  'old-phie': 'text-pl-danger-text',
  unknown: 'text-pl-muted',
};
const WORD = { current: 'current', stale: 'stale', other: 'other interpretation', 'old-phie': 'total porosity (pre 2026-09-07)', unknown: 'no record of its rules' };

export default function PublishedCurvesPanel({ summary, facies = [], isOwn = false, busy = false, onRepublish }) {
  if (!summary || (!summary.rows.length && !facies.length)) return null;
  const needs = summary.stale + summary.oldPhie;
  return (
    <div className="mt-1 pt-1 border-t border-pl-border text-[10px]" data-testid="petro-published">
      <div className="text-pl-muted" data-testid="petro-published-summary">
        Published here: {summary.current} current{summary.stale ? `, ${summary.stale} stale` : ''}{summary.oldPhie ? `, ${summary.oldPhie} old PHIE` : ''}{summary.other ? `, ${summary.other} from another interpretation` : ''}
      </div>
      {summary.rows.map((r) => (
        <div key={r.log.id} className="flex items-center gap-1" title={r.state === 'old-phie' ? PRE_PT9A_PHIE_NOTE : r.reasons.join('; ') || 'Matches the parameters, overrides and pipeline now applied'}>
          <span className="text-pl-text">{r.log.mnemonic}</span>
          <span className={TONE[r.state]} data-testid={`petro-published-${r.log.mnemonic}`} data-state={r.state}>{WORD[r.state]}</span>
          {r.state === 'stale' && <span className="truncate text-pl-muted">{r.reasons[0]}</span>}
        </div>
      ))}
      {facies.map((f) => (
        <div key={f.kind} className="flex items-center gap-1">
          <span className="text-pl-text">{f.label}</span>
          <span className={TONE[f.state]} data-testid={`petro-published-facies-${f.kind}`} data-state={f.state}>{WORD[f.state]} ({f.n} intervals)</span>
        </div>
      ))}
      {needs > 0 && (
        isOwn ? (
          <button
            type="button"
            disabled={busy}
            data-testid="petro-republish"
            className="mt-0.5 px-1.5 py-0.5 rounded border border-pl-primary/60 text-pl-primary-text hover:bg-pl-primary/10 disabled:opacity-50"
            title="Publish this interpretation's curves again; old PHIE rows holding total porosity are replaced"
            onClick={onRepublish}
          >
            Republish
          </button>
        ) : (
          <div className="text-pl-muted">Org-shared well: ask its owner to republish.</div>
        )
      )}
    </div>
  );
}
