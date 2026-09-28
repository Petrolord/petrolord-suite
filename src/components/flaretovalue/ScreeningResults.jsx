// The gas, the screening, and the bid comparison (DS10).
import React from 'react';
import { AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react';
import { NumericTable, NumTh, NumRow, NumCell, NUMERIC_TABLE } from '@/components/ui/numeric-table';
import { useFlareToValue } from '@/contexts/FlareToValueContext';

const fmt = (v, dp = 2) => (Number.isFinite(v)
  ? v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })
  : 'not available');

// KPI tile in theme roles; numbers in the mono face.
const Stat = ({ label, value, hint }) => (
  <div className="rounded-lg border border-pl-border bg-pl-surface p-3 shadow-pl-sm">
    <p className="text-[10px] uppercase tracking-wide text-pl-muted">{label}</p>
    <p className="text-lg font-semibold font-pl-mono tabular-nums text-pl-text break-words">{value}</p>
    {hint && <p className="text-[11px] text-pl-muted mt-0.5">{hint}</p>}
  </div>
);

// A screening verdict is status: an icon, the word and the status tone.
const VERDICT = {
  passes: { icon: CheckCircle2, cls: 'text-pl-success-text', label: 'passes' },
  fails: { icon: AlertTriangle, cls: 'text-pl-danger-text', label: 'fails' },
  'not fully screened': { icon: HelpCircle, cls: 'text-pl-warning-text', label: 'not fully screened' },
};

const ScreeningResults = () => {
  const { gas, screenings, economics, comparison } = useFlareToValue();

  if (gas.error) {
    return (
      <div className="rounded-lg border border-pl-warning/40 bg-pl-warning-bg p-4 flex items-start gap-3 text-pl-warning-text">
        <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" aria-hidden="true" />
        <p className="text-sm">{gas.error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-pl-text mb-1">The gas that is actually there</h3>
        <p className="text-[11px] text-pl-muted mb-2">{gas.gpmBasis}</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Heating value" value={gas.ghvBtuScf === null ? 'not available' : `${fmt(gas.ghvBtuScf, 0)} Btu/scf`} hint={gas.ghvNote ? 'a component is missing one' : null} />
          <Stat label="Inerts" value={`${fmt(gas.inertMoleFraction * 100, 1)}%`} hint={`${fmt(gas.co2MoleFraction * 100, 1)}% of it CO2`} />
          <Stat label="Liquids" value={gas.gpmC3Plus === null ? 'not available' : `${fmt(gas.gpmC3Plus, 2)} gal/Mscf`} hint={gas.gpmC3Plus === null ? 'a liquid density is missing' : `C3+, and the gas is ${gas.richness}`} />
          <Stat label="Carbon" value={`${fmt(gas.carbonPerMol, 2)} per mol`} hint="what the flare turns into CO2" />
        </div>
        {gas.missingLiquidDensity.length > 0 && (
          <p className="text-[11px] text-pl-warning-text mt-2">
            {`No liquid density for ${gas.missingLiquidDensity.join(', ')}, so the liquids content is not given: a partial figure would read as the whole.`}
          </p>
        )}
        {gas.normalisationNote && <p className="text-[11px] text-pl-warning-text mt-2">{gas.normalisationNote}</p>}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-pl-text mb-1">Screening</h3>
        <p className="text-[11px] text-pl-muted mb-2">
          A requirement with no limit set is reported as unchecked and is not treated as passed, because an
          unset limit is not a satisfied one. A failure names which requirement failed and by how
          much, since &quot;not feasible&quot; is not an answer anybody can act on.
        </p>
        <div className="space-y-2">
          {screenings.filter((s) => !s.error).map((s) => {
            const v = VERDICT[s.verdict];
            const Icon = v.icon;
            return (
              <div key={s.routeId} className="rounded-lg border border-pl-border bg-pl-surface p-3 shadow-pl-sm">
                <p className="flex flex-wrap items-center gap-2 font-medium text-pl-text text-sm">
                  <Icon className={`w-4 h-4 ${v.cls}`} aria-hidden="true" />
                  {s.label}
                  <span className={`text-xs ${v.cls}`}>{v.label}</span>
                </p>
                {s.failures.length > 0 && (
                  <ul className="text-[11px] text-pl-danger-text mt-1.5 list-disc pl-5">
                    {s.failures.map((f) => (
                      <li key={f.requirement}>
                        {`${f.requirement}: ${fmt(f.actual, 3)} against a limit of ${fmt(f.limit, 3)} ${f.unit}, short by ${fmt(f.shortfall, 3)}.`}
                      </li>
                    ))}
                  </ul>
                )}
                {s.uncheckedRequirements.length > 0 && (
                  <p className="text-[11px] text-pl-warning-text mt-1.5">
                    {`Not checked: ${s.uncheckedRequirements.join(', ')}. Set the limits your licensor or your market require.`}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-pl-text mb-1">The bid comparison</h3>
        <p className="text-[11px] text-pl-muted mb-2">
          A route that failed screening stays in the table with its failure named. A route missing
          from a comparison reads as one nobody considered, and in a bid that is the difference
          between thorough and careless.
        </p>
        {/* Money columns in mono; a negative margin reads in danger text
            beside its minus sign. The verdict keeps its word. */}
        <NumericTable>
          <thead>
            <tr>
              <NumTh sticky>Route</NumTh>
              <NumTh>Screening</NumTh>
              <NumTh numeric>Capital</NumTh>
              <NumTh numeric>Margin/yr</NumTh>
              <NumTh numeric>Value/Mscf</NumTh>
              <NumTh numeric>Abatement t/yr</NumTh>
            </tr>
          </thead>
          <tbody>
            {comparison.rows.map((r) => (
              <NumRow key={r.routeId}>
                <td className={NUMERIC_TABLE.rowLabel}>
                  {r.label}
                  {comparison.bestByValuePerMscf === r.routeId && (
                    <span className="ml-2 text-[10px] text-pl-success-text">best on value</span>
                  )}
                  {comparison.leaderNotFullyScreened === r.routeId && (
                    <span className="ml-2 text-[10px] text-pl-warning-text">leads on value; screening incomplete</span>
                  )}
                </td>
                <td className={`border-b border-pl-border px-3 py-2 text-xs whitespace-nowrap ${VERDICT[r.verdict].cls}`}>{r.verdict}</td>
                <NumCell value={r.capitalCost}>{r.capitalCost === null ? '-' : fmt(r.capitalCost, 0)}</NumCell>
                <NumCell value={r.grossMarginPerYear}>{r.grossMarginPerYear === null ? '-' : fmt(r.grossMarginPerYear, 0)}</NumCell>
                <NumCell value={r.valuePerMscf}>{r.valuePerMscf === null ? '-' : fmt(r.valuePerMscf, 3)}</NumCell>
                <NumCell signed={false} tone={r.netAbatementTonnesCo2ePerYear === null ? 'text-pl-muted' : undefined}>
                  {r.netAbatementTonnesCo2ePerYear === null ? 'not stated' : fmt(r.netAbatementTonnesCo2ePerYear, 0)}
                </NumCell>
              </NumRow>
            ))}
          </tbody>
        </NumericTable>
        <p className="text-[11px] text-pl-muted mt-2">{comparison.rankingNote}</p>
        {!comparison.bestByValuePerMscf && (
          <p className="text-[11px] text-pl-muted mt-1">
            Value per Mscf is the gross margin and ignores the capital. Value the shortlist in the sanctioned economics engine.
          </p>
        )}
        {/* FLARE-T1-003: say how the capital column was built */}
        <p className="text-[11px] text-pl-muted mt-1" data-testid="fv-capex-basis">
          Capital scales from each route's reference plant by (volume / reference capacity) to the power 0.9,
          the modular rule (trains are replicated, so cost is close to linear); the six-tenths rule applies to
          stick-built plants.
        </p>
        {economics.filter((e) => e.error).map((e) => (
          <p key={e.error} className="text-[11px] text-pl-warning-text mt-1">{e.error}</p>
        ))}
        {economics.filter((e) => !e.error && e.assumedZero && e.assumedZero.length).map((e) => (
          <p key={e.routeId} className="text-[11px] text-pl-warning-text mt-1">
            {`${e.label}: ${e.assumedZero.join(' and ')} left blank, taken as zero.`}
          </p>
        ))}
      </div>
    </div>
  );
};

export default ScreeningResults;
