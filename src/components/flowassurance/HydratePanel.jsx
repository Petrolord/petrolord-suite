// The hydrate answer and the dose that follows from it.
//
// Two things are kept firmly apart. WHERE THE BOUNDARY IS is a fluid
// property, screened here and belonging to the fluid model. HOW FAR AN
// INHIBITOR MOVES IT is a thermodynamic depression, and both relations
// for it are shown with the gap between them named rather than one
// picked silently: they agree when dilute and separate badly when not,
// and that gap is the honest measure of how far a dose is being pushed.
import React from 'react';
import { Snowflake, Droplets, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useFlowAssurance } from '@/contexts/FlowAssuranceContext';
import { Row, Stat, fmt } from './fields';

const HydratePanel = () => {
  const { analysis } = useFlowAssurance();
  const hydrate = analysis?.hydrate;
  const inh = analysis?.inhibition;
  const wax = analysis?.wax;

  if (!hydrate) return null;

  return (
    <div className="space-y-4">
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Snowflake className="w-4 h-4 text-sky-400" /> Hydrate exposure
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat
              label="Worst subcooling"
              value={fmt(hydrate.maxSubcoolingF, 1)}
              unit="F"
              accent={hydrate.inHydrate ? 'text-rose-400' : 'text-emerald-400'}
              hint={hydrate.inHydrate ? 'Inside the region' : 'Clear of the region'}
            />
            <Stat
              label="At"
              value={fmt(hydrate.worst?.pPsia)}
              unit="psia"
              hint={`${fmt(hydrate.worst?.tempF, 1)} F, ${fmt(hydrate.worst?.sFt)} ft along`}
            />
            <Stat
              label="Exposed length"
              value={fmt(hydrate.exposedLengthFt)}
              unit="ft"
              hint={hydrate.entry ? `From ${fmt(hydrate.entry.sFt)} ft` : 'None'}
            />
            <Stat
              label="Arrival"
              value={fmt(analysis.arrival?.tempF, 1)}
              unit="F"
              hint={`${fmt(analysis.arrival?.pPsia)} psia`}
            />
          </div>
          <p className="text-[11px] text-slate-600">
            The worst station is ranked by SUBCOOLING, not by temperature. A cold low-pressure
            arrival can be perfectly safe while a warmer high-pressure spool is not, and ranking by
            temperature picks the wrong one.
          </p>
        </CardContent>
      </Card>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Droplets className="w-4 h-4 text-cyan-400" /> Inhibitor
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!inh && <p className="text-sm text-slate-500">The trace has not produced a subcooling yet.</p>}

          {inh && !inh.required && (
            <p className="text-sm text-emerald-400 flex items-start gap-1.5">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{inh.note}</span>
            </p>
          )}

          {inh?.required && !inh.ok && (
            <p className="text-sm text-rose-400 flex items-start gap-1.5">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{inh.error}</span>
            </p>
          )}

          {inh?.required && inh.ok && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat
                  label="Depression needed"
                  value={fmt(inh.neededDepressionF, 1)}
                  unit="F"
                  hint="Subcooling plus the margin"
                />
                <Stat
                  label="Concentration"
                  value={fmt(inh.weightPct, 1)}
                  unit="wt %"
                  accent="text-cyan-300"
                  hint="In the produced water"
                />
                <Stat
                  label="Injection rate"
                  value={fmt(inh.rate.rateBpd, 1)}
                  unit="bbl/d"
                  accent="text-cyan-300"
                  hint={`${fmt(inh.rate.rateGpd)} gal/d of ${fmt(inh.rate.inhibitor.densityLbGal, 1)} lb/gal stream`}
                />
                <Stat
                  label="Pure inhibitor"
                  value={fmt(inh.rate.pureMassLbDay)}
                  unit="lb/d"
                  hint="Before the water the lean stream brings"
                />
              </div>

              <div className="border-t border-slate-800 pt-3">
                <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">
                  Both relations, and the gap
                </p>
                <Row
                  label="Hammerschmidt"
                  value={`${fmt(inh.depressionCheck.hammerschmidtF, 1)} F`}
                  hint="The field standard, and reliable to about 25 weight percent"
                />
                <Row
                  label="Nielsen-Bucklin"
                  value={inh.depressionCheck.nielsenBucklinF != null
                    ? `${fmt(inh.depressionCheck.nielsenBucklinF, 1)} F`
                    : 'Does not apply'}
                  hint="Thermodynamic, developed for methanol"
                />
                <Row
                  label="Gap between them"
                  value={inh.depressionCheck.spreadF != null
                    ? `${fmt(inh.depressionCheck.spreadF, 1)} F`
                    : '--'}
                  hint="How far this dose is being pushed"
                  accent={(inh.depressionCheck.spreadF ?? 0) > 5 ? 'text-amber-400' : 'text-slate-100'}
                />
                <Row
                  label="Basis used"
                  value={inh.depressionCheck.basis === 'hammerschmidt' ? 'Hammerschmidt' : 'Nielsen-Bucklin'}
                />
                {inh.depressionCheck.note && (
                  <p className="text-[11px] text-amber-300 mt-2">{inh.depressionCheck.note}</p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Wax</CardTitle>
        </CardHeader>
        <CardContent>
          {!wax ? (
            <p className="text-sm text-slate-500">
              No wax appearance temperature was entered, so the wax question is not answered. There
              is no wax correlation in this studio on purpose: a WAT inferred from an API gravity
              would be a fiction dressed as an answer. Measure it, or take it from a fluid study.
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Stat label="WAT" value={fmt(wax.watF, 1)} unit="F" hint="Measured" />
              <Stat
                label="Coldest point"
                value={fmt(wax.coldest?.tempF, 1)}
                unit="F"
                hint={`${fmt(wax.coldest?.sFt)} ft along`}
              />
              <Stat
                label="Below WAT"
                value={wax.crosses ? 'Yes' : 'No'}
                accent={wax.crosses ? 'text-amber-400' : 'text-emerald-400'}
                hint={wax.crosses ? `First at ${fmt(wax.entry?.sFt)} ft` : 'Stays above'}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default HydratePanel;
