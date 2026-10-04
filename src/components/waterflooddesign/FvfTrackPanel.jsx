// FVF by period on the Surveillance tab (WF-U2-008): one FVF set for the
// whole history, or Bo, Bw, Bg and Rs read from the pvt-1 table at each
// date's reservoir pressure, from dated surveys typed here (in the display
// pressure unit, stored psia) or taken with a VRR Monitor ledger.
import React, { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useWaterfloodDesign } from '@/contexts/WaterfloodDesignContext';
import { cleanSurveys } from '@/utils/waterflooddesign/fvfTrack';
import { SectionLabel } from './primitives';

const toText = (surveys, u) => cleanSurveys(surveys).map((s) => `${s.date} ${String(parseFloat(u.show('pressure', s.p_psia).toPrecision(6)))}`).join('\n');

/** Lines "YYYY-MM-DD value" (value in the display pressure unit) as surveys in psia, with the lines not read. */
export function parseSurveyText(text, u) {
  const surveys = [];
  const bad = [];
  String(text || '').split(/\r?\n/).forEach((line, i) => {
    const l = line.trim();
    if (!l) return;
    const m = /^(\d{4}-\d{2}(?:-\d{2})?)[\s,;]+(-?\d+(?:[.,]\d+)?)$/.exec(l);
    const v = m ? Number(m[2].replace(',', '.')) : NaN;
    if (!m || !(v > 0)) { bad.push(i + 1); return; }
    surveys.push({ date: m[1].length === 7 ? `${m[1]}-01` : m[1], p_psia: u.store('pressure', v) });
  });
  return { surveys, bad };
}

export default function FvfTrackPanel() {
  const { surveillanceConfig, setSurveillanceField, surveillanceResult, u, pvtIntake } = useWaterfloodDesign();
  const mode = surveillanceConfig.fvf_mode === 'by-period' ? 'by-period' : 'constant';
  const [text, setText] = useState(() => toText(surveillanceConfig.pressure_surveys, u));
  const [bad, setBad] = useState([]);
  useEffect(() => { setText(toText(surveillanceConfig.pressure_surveys, u)); }, [u.system, surveillanceConfig.pressure_surveys]); // eslint-disable-line react-hooks/exhaustive-deps
  const track = surveillanceResult?.fvfTrack || null;
  return (
    <section data-testid="wds-fvf-track">
      <SectionLabel>FVF by period</SectionLabel>
      <Tabs value={mode} onValueChange={(v) => setSurveillanceField('fvf_mode', v)}>
        <TabsList className="h-8 p-0.5 w-full">
          <TabsTrigger value="constant" className="h-7 text-xs flex-1">One set</TabsTrigger>
          <TabsTrigger value="by-period" className="h-7 text-xs flex-1" data-testid="wds-fvf-by-period">By period from pvt-1</TabsTrigger>
        </TabsList>
      </Tabs>
      {mode === 'by-period' && (
        <div className="mt-2 space-y-2">
          <Label htmlFor="wds-pressure-surveys" className="text-xs text-pl-muted">Reservoir pressure surveys, one per line: date and pressure ({u.label('pressure')})</Label>
          <textarea
            id="wds-pressure-surveys"
            data-testid="wds-pressure-surveys"
            className="w-full h-24 rounded-md border border-pl-border bg-pl-surface p-2 text-xs text-pl-text font-pl-mono"
            placeholder={'2025-01-01 2800\n2025-06-01 2500'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => { const r = parseSurveyText(text, u); setBad(r.bad); if (!r.bad.length) setSurveillanceField('pressure_surveys', r.surveys); }}
          />
          {bad.length > 0 && <p className="text-[11px] text-pl-warning-text">Lines not read: {bad.join(', ')}. Write a date (YYYY-MM-DD or YYYY-MM) and a positive pressure.</p>}
          {track && !track.ok && <p className="text-[11px] text-pl-warning-text" data-testid="wds-fvf-track-problem">{track.problems.join(' ')}</p>}
          {track?.ok && (
            <p className="text-[11px] text-pl-muted" data-testid="wds-fvf-track-status">
              Bo, Bw, Bg and Rs read from the PVT table of {pvtIntake?.from?.recordName || 'the Fluid project'} at {track.rows.length} dates, pressures {Math.round(u.show('pressure', track.pRange[0]))} to {Math.round(u.show('pressure', track.pRange[1]))} {u.label('pressure')}
              {track.held ? `; ${track.held} dates outside the surveys hold the nearest survey` : ''}. The single set above is not used.
            </p>
          )}
          <Label className="text-[11px] text-pl-muted leading-snug block">
            The pressure at each date is linear in time between surveys and held at the first and last survey outside them. The values are read in the PVT table kept with the intake and never extrapolated.
          </Label>
        </div>
      )}
    </section>
  );
}
