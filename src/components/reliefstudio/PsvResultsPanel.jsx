// Main panel, PSV tab: the area, the orifice, and the honesty notes.
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useRelief } from '@/contexts/ReliefStudioContext';
import { fmt, Stat, ErrorNote, WarnNote } from './fields';

const OrificeLadder = ({ selected }) => {
  const letters = ['D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R', 'T'];
  return (
    <div className="flex flex-wrap gap-1.5">
      {letters.map((l) => (
        <span
          key={l}
          className={`px-2 py-1 rounded text-xs font-semibold ${l === selected
            ? 'bg-emerald-600 text-white'
            : 'bg-slate-800 text-slate-500'}`}
        >
          {l}
        </span>
      ))}
    </div>
  );
};

const PsvResultsPanel = () => {
  const { psv } = useRelief();
  if (psv.error) return <ErrorNote>{psv.error}</ErrorNote>;
  const o = psv.orifice;
  return (
    <div className="space-y-4">
      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Required orifice</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Required area" value={fmt(psv.areaIn2, 3)} unit="in2" />
            {o.error ? (
              <Stat label="Selection" value={`${o.multipleOfT} x T`} accent="text-amber-400" hint="beyond a single T orifice" />
            ) : (
              <>
                <Stat label="API 526 orifice" value={o.orifice} accent="text-emerald-400" hint={`${fmt(o.areaIn2, 3)} in2`} />
                <Stat label="Margin" value={fmt((o.margin - 1) * 100, 0)} unit="%" hint="orifice area over required" />
              </>
            )}
            {psv.p1Psia && <Stat label="Relieving pressure" value={fmt(psv.p1Psia, 1)} unit="psia" />}
          </div>
          {!o.error && <OrificeLadder selected={o.orifice} />}
          {psv.scenario === 'gas' && (
            <p className="text-[12px] text-slate-500">
              {psv.critical
                ? 'Critical flow: the nozzle is choked and the back pressure does not set the rate.'
                : 'Subcritical flow: sized with the F2 factor; the back pressure is in the equation itself.'}
            </p>
          )}
          {psv.scenario === 'liquid' && Number.isFinite(psv.kv) && psv.kv < 1 && (
            <p className="text-[12px] text-slate-500">
              Viscosity correction Kv = {fmt(psv.kv, 3)} at Reynolds {fmt(psv.reynolds, 0)}, iterated with the area.
            </p>
          )}
          {psv.scenario === 'steam' && psv.kn > 1 && (
            <p className="text-[12px] text-slate-500">Napier correction KN = {fmt(psv.kn, 3)} (above 1500 psia).</p>
          )}
          {psv.warning && <WarnNote>{psv.warning}</WarnNote>}
          {psv.loadWarning && <WarnNote>{psv.loadWarning}</WarnNote>}
        </CardContent>
      </Card>

      {psv.scenario === 'fire' && (
        <Card className="bg-slate-900/60 border-slate-800">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Fire duty chain</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Stat label="Wetted area" value={fmt(psv.wettedFt2, 0)} unit="ft2"
                hint="count only to 25 ft above grade; trim the level for tall vessels" />
              <Stat label="Heat input" value={fmt(psv.qBtuHr / 1e6, 2)} unit="MMBtu/hr" />
              <Stat label="Relief load" value={fmt(psv.wLbHr, 0)} unit="lb/hr"
                hint="sized at the actual fire-case relieving pressure" />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PsvResultsPanel;
