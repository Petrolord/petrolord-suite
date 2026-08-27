// Sand Control tab: the completion-type advisor (thresholds shown), the
// Saucier gravel card with the commercial catalog match, and the screen
// selection (gravel-pack gauge + standalone slot window). Every number is
// the engine's — recomputed by the e2e spec through psRun.

import React from 'react';

const Card = ({ title, children, testId }) => (
  <div className="rounded border border-slate-800 bg-slate-900/40" data-testid={testId}>
    <div className="border-b border-slate-800 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</div>
    <div className="p-2">{children}</div>
  </div>
);

const um = (m) => (m == null ? '--' : (m * 1e6).toFixed(0));

export default function SandControlTab({ res }) {
  const sand = res?.sand || null;
  if (!sand?.stats) {
    return (
      <div className="p-6 text-sm text-slate-500" data-testid="ps-sand-empty">
        Enter a sieve analysis on the Interval &amp; Sand tab first.
      </div>
    );
  }
  const { advisor, gravel, gpScreen, saScreen } = sand;

  return (
    <div className="grid gap-3 p-3 xl:grid-cols-2">
      <div className="flex flex-col gap-3">
        <Card title="Completion-type advisor (screening thresholds)" testId="ps-advisor-card">
          <table className="w-full text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="px-1 py-1 text-left">Rule</th>
                <th className="px-1 py-1 text-left">Indication</th>
                <th className="px-1 py-1 text-right">Met</th>
              </tr>
            </thead>
            <tbody>
              {advisor.checks.map((c, i) => (
                <tr key={i} className={`border-t border-slate-800 ${c.indication === advisor.indication && c.pass ? 'text-slate-100' : 'text-slate-400'}`}>
                  <td className="px-1 py-1 font-mono text-[11px]">{c.rule}</td>
                  <td className="px-1 py-1">{c.indication}</td>
                  <td className="px-1 py-1 text-right">{c.pass ? 'yes' : 'no'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 border-t border-slate-800 pt-2 text-sm text-slate-200">
            Indication: <span className="font-semibold" data-testid="ps-advisor-indication">{advisor.indication}</span>
          </div>
          <div className="mt-1 text-[10px] text-slate-500">{advisor.provenance}</div>
        </Card>

        <Card title="Standalone screen window" testId="ps-standalone-card">
          {!saScreen ? <div className="text-xs text-slate-500">Needs D10.</div> : (
            <div className="text-xs text-slate-300">
              <div>Slot window <span className="float-right font-mono">{um(saScreen.slotMinM)} to {um(saScreen.slotMaxM)} um</span></div>
              <div className="mt-1 text-[10px] text-slate-500">{saScreen.rule}. Standalone suitability per the advisor above.</div>
            </div>
          )}
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <Card title="Saucier gravel sizing (5-6 x formation D50)" testId="ps-gravel-card">
          <div className="text-xs text-slate-300">
            <div>Band <span className="float-right font-mono" data-testid="ps-gravel-band">{um(gravel.bandMinM)} to {um(gravel.bandMaxM)} um</span></div>
            {gravel.noMatch ? (
              <div className="mt-2 text-amber-300" data-testid="ps-gravel-match">
                No standard mesh lands in the band; nearest is {gravel.nearest.mesh}. Verify with the vendor sieve certificate.
              </div>
            ) : (
              <div className="mt-2" data-testid="ps-gravel-match">
                Recommended mesh <span className="float-right font-mono font-semibold">{gravel.matches.map((m) => m.mesh).join(', ')}</span>
              </div>
            )}
            <table className="mt-2 w-full text-[11px]">
              <thead className="text-slate-500">
                <tr>
                  <th className="px-1 py-1 text-left">Mesh</th>
                  <th className="px-1 py-1 text-right">Range (um)</th>
                  <th className="px-1 py-1 text-right">Pack D50 (um)</th>
                </tr>
              </thead>
              <tbody>
                {(gravel.matches.length ? gravel.matches : [gravel.nearest]).map((g) => (
                  <tr key={g.mesh} className="border-t border-slate-800 text-slate-300">
                    <td className="px-1 py-1 font-mono">{g.mesh}</td>
                    <td className="px-1 py-1 text-right font-mono">{um(g.minM)} to {um(g.maxM)}</td>
                    <td className="px-1 py-1 text-right font-mono">{um(g.d50M)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-1 text-[10px] text-slate-500">Pack D50 is the nominal mid-range; the vendor certificate governs.</div>
          </div>
        </Card>

        <Card title="Gravel-pack screen gauge" testId="ps-gauge-card">
          {!gpScreen ? (
            <div className="text-xs text-slate-500">Pick a gravel first (no standard mesh matched).</div>
          ) : (
            <div className="text-xs text-slate-300">
              <div>Max opening <span className="float-right font-mono">{um(gpScreen.maxGaugeM)} um</span></div>
              <div className="mt-1">Recommended gauge <span className="float-right font-mono font-semibold" data-testid="ps-gauge">{gpScreen.gaugeM == null ? 'none fits' : `${Math.round(gpScreen.gaugeM / 25.4e-6)} thou (${um(gpScreen.gaugeM)} um)`}</span></div>
              <div className="mt-1 text-[10px] text-slate-500">{gpScreen.rule}.</div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
