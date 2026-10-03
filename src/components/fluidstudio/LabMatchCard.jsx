// Black-oil correlations matched to the laboratory tables (FLUID-U2-004 and
// -008): one multiplier per property, the error before and after, the
// interval of each fitted multiplier, and a status that holds only while
// the match still describes the fluid.
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SlidersHorizontal, RotateCcw, AlertTriangle } from 'lucide-react';
import { fitLabMatch, labMatchRecord, labMatchState } from '@/utils/fluidstudio/labMatch';

const STATUS_WORDS = { matched: 'Matched to lab', stale: 'Matched, not confirmed', 'not-applied': 'Match not applied', none: 'Not matched' };
const STATUS_CLASS = {
  matched: 'border-pl-success/40 bg-pl-success-bg text-pl-success-text',
  stale: 'border-pl-warning/40 bg-pl-warning-bg text-pl-warning-text',
  'not-applied': 'border-pl-warning/40 bg-pl-warning-bg text-pl-warning-text',
  none: 'border-pl-border bg-pl-sunken text-pl-muted',
};

/**
 * @param {{inputs: object, onMatch: function(?object): void, section: object}} props
 *   `section` is the report model's tuning section (the same rows the PDF prints)
 */
const LabMatchCard = ({ inputs, onMatch, section }) => {
  const [reasons, setReasons] = useState([]);
  const state = labMatchState(inputs);
  const run = () => {
    const fitted = fitLabMatch(inputs);
    setReasons(fitted.ok ? [] : fitted.reasons);
    if (fitted.ok) onMatch(labMatchRecord(fitted));
  };
  const reset = () => { setReasons([]); onMatch(null); };

  return (
    <Card data-testid="fluid-lab-match" data-status={state.status}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center text-base text-pl-text"><SlidersHorizontal className="w-4 h-4 mr-2 text-pl-muted" />Match the correlations to the laboratory data</CardTitle>
          <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[state.status]}`} data-testid="fluid-lab-match-status">{STATUS_WORDS[state.status]}</span>
        </div>
        <p className="text-xs text-pl-muted mt-1">
          Sets the bubble point to the laboratory saturation pressure and multiplies Bo and the oil viscosity each by one constant fitted to the laboratory rows. The black-oil table, the report and the handoffs then use the matched correlations and say so.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-pl-text">
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" onClick={run} data-testid="fluid-lab-match-run"><SlidersHorizontal className="w-4 h-4 mr-2" />{state.status === 'none' ? 'Match to lab data' : 'Match again'}</Button>
          {state.status !== 'none' && (
            <Button size="sm" variant="outline" onClick={reset} data-testid="fluid-lab-match-reset"><RotateCcw className="w-4 h-4 mr-2" />Remove the match</Button>
          )}
        </div>
        {reasons.length > 0 && (
          <ul className="text-xs text-pl-warning-text space-y-1" data-testid="fluid-lab-match-reasons">
            {reasons.map((r) => <li key={r} className="flex items-start gap-1"><AlertTriangle className="w-4 h-4 shrink-0" />{r}</li>)}
          </ul>
        )}
        {state.status !== 'none' && section && (
          <>
            <p className={state.status === 'matched' ? '' : 'text-pl-warning-text'} data-testid="fluid-lab-match-text">{section.text}</p>
            {section.table && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs" data-testid="fluid-lab-match-table">
                  <thead><tr className="text-pl-muted border-b border-pl-border">{section.table.head.map((h) => <th key={h} className="py-1 px-2 text-left font-medium">{h}</th>)}</tr></thead>
                  <tbody>{section.table.rows.map((r) => <tr key={r[0]} className="border-b border-pl-border">{r.map((c, j) => <td key={j} className="py-1 px-2">{c}</td>)}</tr>)}</tbody>
                </table>
              </div>
            )}
            {section.parameters && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs" data-testid="fluid-lab-match-parameters">
                  <thead><tr className="text-pl-muted border-b border-pl-border">{section.parameters.head.map((h) => <th key={h} className="py-1 px-2 text-left font-medium">{h}</th>)}</tr></thead>
                  <tbody>{section.parameters.rows.map((r) => <tr key={r[0]} className="border-b border-pl-border">{r.map((c, j) => <td key={j} className="py-1 px-2">{c}</td>)}</tr>)}</tbody>
                </table>
                {section.parameters.note && <p className="text-xs text-pl-muted mt-1">{section.parameters.note}</p>}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default LabMatchCard;
