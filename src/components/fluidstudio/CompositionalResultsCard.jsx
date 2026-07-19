import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, FlaskConical, Layers } from 'lucide-react';
import FluidStudioTierBadge from '@/components/fluidstudio/FluidStudioTierBadge';

const fmt = (v, d = 3) => (v == null || !Number.isFinite(v) ? 'n/a' : Number(v).toFixed(d));

const PhaseStat = ({ label, value, unit }) => (
  <div className="rounded-md bg-slate-800/60 border border-slate-700 px-3 py-2">
    <p className="text-[11px] text-slate-400">{label}</p>
    <p className="text-sm font-semibold text-white">{value}<span className="ml-1 text-xs font-normal text-slate-400">{unit}</span></p>
  </div>
);

const PhaseColumn = ({ phase }) => (
  <div className="space-y-2">
    <p className="text-sm font-semibold text-cyan-300">{phase.label}</p>
    <div className="grid grid-cols-2 gap-2">
      <PhaseStat label="Mole fraction" value={fmt(phase.moleFraction, 4)} unit="" />
      <PhaseStat label="Density" value={fmt(phase.density, 2)} unit="lb/ft³" />
      <PhaseStat label="Z factor" value={fmt(phase.zFactor, 4)} unit="" />
      <PhaseStat label="Apparent MW" value={fmt(phase.apparentMw, 1)} unit="lb/lb-mol" />
      <PhaseStat label="Viscosity (LBC)" value={fmt(phase.viscosityCp, 4)} unit="cP" />
      <PhaseStat label="Molar volume" value={fmt(phase.molarVolume, 3)} unit="ft³/lb-mol" />
    </div>
  </div>
);

/**
 * Compositional flash results (FS5): stability-gated PR78 flash at the
 * requested (T, P), per-phase properties, and the component table.
 * Recomputes synchronously with the inputs; the envelope card handles
 * the slow path.
 */
const CompositionalResultsCard = ({ eos }) => {
  if (!eos) return null;
  const { parsed, flash, characterization } = eos;

  if (!flash) {
    return (
      <Card className="bg-slate-800/50 border-slate-700 text-white">
        <CardHeader><CardTitle className="flex items-center text-base"><FlaskConical className="w-4 h-4 mr-2 text-cyan-300" />Compositional flash</CardTitle></CardHeader>
        <CardContent>
          <ul className="text-sm text-amber-300 space-y-1 list-disc list-inside">
            {parsed.errors.map((e) => <li key={e}>{e}</li>)}
          </ul>
        </CardContent>
      </Card>
    );
  }

  const twoPhase = flash.phases === 2;

  return (
    <Card className="bg-slate-800/50 border-slate-700 text-white">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center text-base">
            <FlaskConical className="w-4 h-4 mr-2 text-cyan-300" />
            Compositional flash at {fmt(parsed.pressurePsia, 0)} psia / {fmt(parsed.tempF, 0)} °F
          </CardTitle>
          <div className="flex gap-2">
            <FluidStudioTierBadge tier="oracle_gated" />
            <FluidStudioTierBadge
              tier="screening"
              note="Phase viscosities use the untuned Lohrenz-Bray-Clark correlation. Expect roughly 10% scatter for gas and up to a factor of two for oil until critical volumes are tuned to lab data."
            />
          </div>
        </div>
        {parsed.warnings.length > 0 && (
          <div className="mt-2 text-xs text-amber-300 flex gap-2 items-start">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{parsed.warnings.join(' ')}</span>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Layers className="w-4 h-4 text-cyan-300" />
          <p className="text-sm text-slate-200">
            {twoPhase
              ? `Two phases. Vapor fraction ${fmt(flash.beta, 4)}.`
              : `${flash.feed.label}.`}
          </p>
          {twoPhase && (
            <p className="text-sm text-slate-200">
              Gas and oil interfacial tension {fmt(flash.iftDynPerCm, 2)} dyn/cm
              <FluidStudioTierBadge
                tier="published_method"
                className="ml-2"
                note="Weinaug and Katz parachor method on the flash phase densities. Parachors come from the component library; the C7+ parachor uses the Firoozabadi correlation."
              />
            </p>
          )}
        </div>

        <div className={`grid gap-4 ${twoPhase ? 'md:grid-cols-2' : ''}`}>
          {twoPhase ? (
            <>
              <PhaseColumn phase={flash.liquid} />
              <PhaseColumn phase={flash.vapor} />
            </>
          ) : (
            <PhaseColumn phase={flash.feed} />
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-slate-700">
                <th className="text-left py-1.5 pr-2 font-medium">Component</th>
                <th className="text-right py-1.5 px-2 font-medium">z (feed)</th>
                {twoPhase && <th className="text-right py-1.5 px-2 font-medium">x (liquid)</th>}
                {twoPhase && <th className="text-right py-1.5 px-2 font-medium">y (vapor)</th>}
                {twoPhase && <th className="text-right py-1.5 pl-2 font-medium">K value</th>}
              </tr>
            </thead>
            <tbody>
              {flash.componentTable.map((r) => (
                <tr key={r.key} className="border-b border-slate-800 text-slate-200">
                  <td className="py-1 pr-2 font-mono text-xs">{r.key}<span className="ml-2 text-slate-500 font-sans">{r.name}</span></td>
                  <td className="text-right py-1 px-2 font-mono text-xs">{fmt(r.z, 5)}</td>
                  {twoPhase && <td className="text-right py-1 px-2 font-mono text-xs">{fmt(r.x, 5)}</td>}
                  {twoPhase && <td className="text-right py-1 px-2 font-mono text-xs">{fmt(r.y, 5)}</td>}
                  {twoPhase && <td className="text-right py-1 pl-2 font-mono text-xs">{fmt(r.K, 4)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {characterization && (
          <div className="rounded-md border border-slate-700 bg-slate-800/40 px-3 py-2 text-xs text-slate-300 space-y-1">
            <p className="font-semibold text-slate-200 flex items-center gap-2">
              C7+ characterization
              <FluidStudioTierBadge
                tier="published_method"
                note="Single pseudo component from Kesler-Lee critical properties, Lee-Kesler acentric factor, Soreide boiling point, Jhaveri-Youngren volume shift and the Chueh-Prausnitz methane interaction. Each correlation is transcription-gated against the validation harness."
              />
            </p>
            <p className="font-mono">
              Tc {fmt(characterization.tcR - 459.67, 1)} °F · Pc {fmt(characterization.pcPsia, 0)} psia · ω {fmt(characterization.omega, 4)} · s {fmt(characterization.shift, 4)} · k(C1) {fmt(characterization.bipC1, 4)}
              {characterization.meta?.tbSource === 'soreide' ? ' · Tb from Soreide' : ' · Tb measured'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CompositionalResultsCard;
