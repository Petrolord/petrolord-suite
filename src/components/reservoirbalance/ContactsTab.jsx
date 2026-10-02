// Contacts tab (MB6). Tank-model contact tracking on the engine's material
// balance series: the OWC (GWC for gas) rises by the net aquifer influx and
// the GOC descends by the gas-cap expansion the MBE attributed, both spread
// over user-supplied contact areas (piston-front screening estimates; math
// in the jest-guarded lib/contactMovement.js). Replaces the pre-Horizons
// ContactsTracker shell, whose timeline and volumes were fabricated.
import React, { useEffect, useMemo, useState } from 'react';
import { Layers, Info, AlertTriangle, Save, Loader2 } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import UnitField from './UnitField';
import ChartFrame from '@/components/charts/ChartFrame';
import {
  CHART_COLORS, CHART_TYPOGRAPHY, GRID_STYLE, TOOLTIP_STYLE,
} from '@/utils/chartTheme';
import { useMaterialBalanceStudio } from '@/contexts/MaterialBalanceStudioContext';
import { getCaseDefaultConfig } from '@/pages/apps/reservoir-balance/lib/api';
import {
  computeContactMovement,
  CONTACT_DEFAULTS,
} from '@/pages/apps/reservoir-balance/lib/contactMovement';

// [form key, label, quantity of lib/mbalUnits or null, unit text, key in the study record]
const FIELDS = [
  ['initialOwcFt', 'Initial OWC depth', 'depth', '', 'initial_owc_ft'],
  ['initialGocFt', 'Initial GOC depth (blank for none)', 'depth', '', 'initial_goc_ft'],
  ['areaOwcAcres', 'Contact area at the OWC', 'area', '', 'area_owc_acres'],
  ['areaGocAcres', 'Contact area at the GOC', 'area', '', 'area_goc_acres'],
  ['porosity', 'Porosity', null, 'fraction', 'porosity'],
  ['swi', 'Initial water saturation', null, 'fraction', null],
  ['sorWater', 'Residual oil to water', null, 'fraction', 'sor_water'],
  ['sorGas', 'Residual oil to gas', null, 'fraction', 'sor_gas'],
];

const num = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const text = (v) => (v == null ? '' : String(v));

const ContactsTab = () => {
  const {
    caseId, caseData, lastResult, units, study, saveStudy,
  } = useMaterialBalanceStudio();
  const { toast } = useToast();
  const depthRef = study?.datum?.reference ?? 'TVDSS';
  const isGas = caseData?.fluid_system === 'gas';

  const [defaultCfg, setDefaultCfg] = useState(null);
  useEffect(() => {
    let alive = true;
    getCaseDefaultConfig(caseId).then(({ data }) => {
      if (alive) setDefaultCfg(data ?? null);
    });
    return () => { alive = false; };
  }, [caseId]);

  const [form, setForm] = useState({
    initialOwcFt: '',
    initialGocFt: '',
    areaOwcAcres: '',
    areaGocAcres: '',
    porosity: '0.2',
    swi: caseData?.initial_water_saturation != null ? String(caseData.initial_water_saturation) : '0.2',
    sorWater: String(CONTACT_DEFAULTS.sorWater),
    sorGas: String(CONTACT_DEFAULTS.sorGas),
  });
  useEffect(() => {
    if (caseData?.initial_water_saturation != null) {
      setForm((f) => ({ ...f, swi: String(caseData.initial_water_saturation) }));
    }
  }, [caseData?.initial_water_saturation]);

  // The geometry is kept with the case (MBAL-U1-010): it used to live in this
  // tab only, so it was lost on a visit to another tab and never reached the
  // report.
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const savedKey = JSON.stringify(study?.contacts ?? {});
  useEffect(() => {
    if (dirty) return;
    const c = study?.contacts ?? {};
    setForm((f) => ({
      ...f,
      initialOwcFt: text(c.initial_owc_ft), initialGocFt: text(c.initial_goc_ft),
      areaOwcAcres: text(c.area_owc_acres), areaGocAcres: text(c.area_goc_acres),
      porosity: c.porosity != null ? text(c.porosity) : f.porosity,
      sorWater: c.sor_water != null ? text(c.sor_water) : f.sorWater,
      sorGas: c.sor_gas != null ? text(c.sor_gas) : f.sorGas,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);
  const onSave = async () => {
    setSaving(true);
    const contacts = {};
    for (const [key, , , , saved] of FIELDS) if (saved) contacts[saved] = num(form[key]);
    const { error } = await saveStudy({ ...study, contacts });
    setSaving(false);
    if (error) { toast({ title: 'The contact geometry was not saved', description: error.message, variant: 'destructive' }); return; }
    setDirty(false);
    toast({ title: 'Contact geometry saved', description: 'It is kept with the case and the initial contacts are printed in the report. The run stays current.' });
  };

  // Gas cap ratio m: a matched value from a history-match run wins, then the
  // saved run config, then zero (GOC static with a warning from the lib).
  const gasCapM = useMemo(() => {
    const matched = lastResult?.plot_data?.history_match?.matched_parameters
      ?.find((p) => p.key === 'gas_cap_m')?.matched_value;
    if (Number.isFinite(matched) && matched > 0) return matched;
    const cfg = defaultCfg?.gas_cap_ratio_m;
    return Number.isFinite(cfg) && cfg > 0 ? cfg : 0;
  }, [lastResult, defaultCfg]);

  const observationDates = useMemo(
    () => (caseData?.production_data ?? []).map((r) => r.observation_date ?? null),
    [caseData],
  );

  const result = useMemo(() => {
    if (!lastResult?.plot_data) return null;
    return computeContactMovement(
      {
        initialOwcFt: num(form.initialOwcFt),
        initialGocFt: num(form.initialGocFt),
        areaOwcAcres: num(form.areaOwcAcres),
        areaGocAcres: num(form.areaGocAcres),
        porosity: num(form.porosity),
        swi: num(form.swi),
        sorWater: num(form.sorWater) ?? CONTACT_DEFAULTS.sorWater,
        sorGas: num(form.sorGas) ?? CONTACT_DEFAULTS.sorGas,
        ooipStb: lastResult?.estimated_ooip_stb ?? null,
        gasCapM,
        fluidSystem: caseData?.fluid_system,
      },
      lastResult.plot_data,
      observationDates,
    );
  }, [form, lastResult, gasCapM, caseData, observationDates]);

  const waterLabel = isGas ? 'GWC' : 'OWC';
  const chartData = result?.ok
    ? result.series.map((s) => ({
        step: s.step,
        [waterLabel]: units.to('depth', s.owcFt),
        ...(s.gocFt != null ? { GOC: units.to('depth', s.gocFt) } : {}),
      }))
    : [];
  const depthText = (v) => `${units.to('depth', v).toFixed(1)} ${units.label('depth')}`;

  if (!lastResult?.plot_data) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-pl-muted flex items-center gap-2">
            <Info className="h-4 w-4" />
            Contact tracking reads the water influx and expansion series of the last engine run. Run the engine on
            the Run tab first.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-pl-primary-text" />
            Contact geometry
          </CardTitle>
          <CardDescription>
            Piston-front estimates: the {waterLabel} rises by the net influx of the last run and the GOC descends by
            its gas-cap expansion, spread over these areas. A screening view that does not replace surveillance logs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {FIELDS.filter(([key]) => !(isGas && (key === 'initialGocFt' || key === 'areaGocAcres' || key === 'sorGas')))
            .map(([key, label, quantity, unitText]) => (
              <UnitField
                key={key} testId={`mbal-contacts-${key}`}
                label={(isGas ? label.replace('OWC', 'GWC') : label) + (quantity === 'depth' ? `, ${depthRef}` : '')}
                quantity={quantity} unitText={unitText} units={units}
                value={num(form[key])}
                onCommit={(v) => { setForm((f) => ({ ...f, [key]: text(v) })); if (key !== 'swi') setDirty(true); }}
              />
            ))}
          <Button size="sm" onClick={onSave} disabled={!dirty || saving} data-testid="mbal-contacts-save">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save contact geometry
          </Button>
          <p className="text-[11px] text-pl-muted">
            Depths are {depthRef}, the reference of the pressure datum on the Report tab. Porosity and the residual saturations open on screening values; type the values of the reservoir.
          </p>
          {!isGas && (
            <p className="text-[11px] text-pl-muted">
              Gas cap ratio m in use: {gasCapM > 0 ? gasCapM.toFixed(3) : 'none (GOC stays put)'}.
              {gasCapM > 0 && ' Taken from the history match or the saved run config.'}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Contact movement</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!result?.ok ? (
            <p className="text-sm text-pl-muted flex items-center gap-2">
              <Info className="h-4 w-4" />
              {result?.error ?? 'Fill in the geometry to compute contact movement.'}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="border border-pl-border rounded-md p-3 bg-pl-sunken">
                  <p className="text-[11px] text-pl-muted">Current {waterLabel}</p>
                  <p className="text-base font-semibold text-pl-text">{depthText(result.currentOwcFt)}</p>
                </div>
                {result.currentGocFt != null && (
                  <div className="border border-pl-border rounded-md p-3 bg-pl-sunken">
                    <p className="text-[11px] text-pl-muted">Current GOC</p>
                    <p className="text-base font-semibold text-pl-text">{depthText(result.currentGocFt)}</p>
                  </div>
                )}
                {result.oilColumnFt != null && (
                  <div className="border border-pl-border rounded-md p-3 bg-pl-sunken">
                    <p className="text-[11px] text-pl-muted">Remaining oil column</p>
                    <p className="text-base font-semibold text-pl-text">{depthText(result.oilColumnFt)}</p>
                  </div>
                )}
              </div>

              <ChartFrame height={300} logoHeight={24} exportFilename="mbal-contact-movement">
                <LineChart data={chartData} margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
                  <CartesianGrid {...GRID_STYLE} vertical={false} />
                  <XAxis
                    dataKey="step"
                    stroke={CHART_COLORS.axisLine}
                    tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                    label={{ value: 'Timestep', position: 'insideBottom', offset: -4, fill: CHART_COLORS.axisText, fontSize: 11 }}
                  />
                  <YAxis
                    reversed
                    domain={['auto', 'auto']}
                    stroke={CHART_COLORS.axisLine}
                    tick={{ fill: CHART_COLORS.axisText, fontSize: CHART_TYPOGRAPHY.axisFontSize }}
                    label={{ value: `Depth (${units.label('depth')} ${depthRef})`, angle: -90, position: 'insideLeft', fill: CHART_COLORS.axisText, fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={{ color: CHART_COLORS.tooltipText }}
                    formatter={(v, name) => [`${Number(v).toFixed(1)} ${units.label('depth')}`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line dataKey={waterLabel} stroke="#0284c7" strokeWidth={2} dot={false} />
                  {chartData.some((d) => d.GOC != null) && (
                    <Line dataKey="GOC" stroke="#dc2626" strokeWidth={2} dot={false} />
                  )}
                </LineChart>
              </ChartFrame>

              {result.warnings.map((w) => (
                <p key={w} className="text-xs text-pl-warning-text flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {w}
                </p>
              ))}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ContactsTab;
