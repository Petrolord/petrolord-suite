// Sending a run downstream (SIM-U2-002, RL11). The Waterflood pattern
// (src/components/waterflooddesign/WfSendPanel.jsx): what leaves this app is
// the `sim-forecast-1` contract, read by id (the case and the run) by the
// receiver. Forecast Scenario Hub takes the field oil profile as a profile
// case; Petroleum Economics Studio takes calendar-year oil, gas and water as
// a production file. Both keep the contract, print where the numbers came
// from, and say when the case gains a newer run.
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Send, GitBranch, Landmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSimStudio } from '@/contexts/SimStudioContext';
import { buildSimForecastContract, simBasisLine, SIM_PHASES } from '@/utils/simstudio/simForecastContract';
import { summarizeDeck } from '@/utils/simstudio/deckSummary';
import { sha256Hex } from '@/lib/simService';
import { buildLabel } from '@/lib/platformBuild';

export const HUB_ROUTE = '/dashboard/apps/reservoir/forecast-scenario-hub';
export const EPE_ROUTE = '/dashboard/apps/economics/epe/cases';

const SimSendPanel = ({ run }) => {
  const { pathname } = useLocation();
  const onHarness = pathname.startsWith('/dev/');
  const hubRoute = onHarness ? '/dev/forecast-scenario-hub' : HUB_ROUTE;
  const epeRoute = onHarness ? '/dev/epe/cases/c1' : EPE_ROUTE;
  const { activeCase, summary, deckText, u } = useSimStudio();
  const navigate = useNavigate();
  const [phase, setPhase] = useState('run');
  const [deckSha, setDeckSha] = useState(null);
  useEffect(() => {
    let alive = true;
    if (deckText) sha256Hex(deckText).then((h) => { if (alive) setDeckSha(h); });
    else setDeckSha(null);
    return () => { alive = false; };
  }, [deckText]);
  // the deck's history end, when the case deck is the deck that ran (the receiver applies the same rule)
  const facts = useMemo(() => {
    if (!deckText || !deckSha || !run?.deck_sha256 || deckSha !== run.deck_sha256) return { historyEnd: null, deckSystem: null };
    const d = summarizeDeck(deckText);
    return { historyEnd: d.schedule?.historyControls ? d.schedule.lastDate || null : null, deckSystem: d.unitSystem || null };
  }, [deckText, deckSha, run?.deck_sha256]);
  const preview = useMemo(() => (run && summary ? buildSimForecastContract({
    caseRow: activeCase, run, summary, phase, historyEnd: facts.historyEnd, deckSystem: facts.deckSystem, build: buildLabel(),
  }) : null), [activeCase, run, summary, phase, facts]);
  if (!run || !summary) return null;
  const c = preview?.ok ? preview.contract : null;
  const query = `simCase=${encodeURIComponent(activeCase?.id || '')}&simRun=${encodeURIComponent(run.id)}&simPhase=${phase}`;
  return (
    <Card data-testid="sim-send">
      <CardHeader className="pb-1"><CardTitle className="text-sm inline-flex items-center gap-1"><Send className="w-3.5 h-3.5" /> Send this run</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-xs">
        <div className="flex flex-wrap items-center gap-3" role="radiogroup" aria-label="What to send">
          {Object.entries(SIM_PHASES).map(([k, words]) => (
            <label key={k} className="inline-flex items-center gap-1 cursor-pointer">
              <input type="radio" name="sim-send-phase" checked={phase === k} onChange={() => setPhase(k)} disabled={k === 'prediction' && !facts.historyEnd} data-testid={`sim-send-phase-${k}`} />
              <span>{words[0].toUpperCase() + words.slice(1)}</span>
            </label>
          ))}
        </div>
        {!c ? (
          <p className="text-pl-muted" data-testid="sim-send-refusal">{preview?.reason}</p>
        ) : (
          <>
            <p className="text-[11px] text-pl-muted leading-relaxed" data-testid="sim-send-basis">
              {simBasisLine(c)}. Np {Math.round(u.show('oilVolume', c.forecast.Np) ?? 0).toLocaleString('en-US')} {u.label('oilVolume')} from {c.forecast.start}.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => navigate(`${hubRoute}?${query}`)} data-testid="sim-send-hub">
                <GitBranch size={12} /> Open as a case in Forecast Scenario Hub
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => navigate(`${epeRoute}?${query}`)} data-testid="sim-send-epe">
                <Landmark size={12} /> Use in Petroleum Economics Studio
              </Button>
            </div>
            <p className="text-[10px] text-pl-muted">The receiving app reads this run by its case and run id, keeps where it came from, and tells you when the case gains a newer completed run. In Petroleum Economics Studio open a case, then Production, Import from Reservoir Simulation Studio.</p>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default SimSendPanel;
