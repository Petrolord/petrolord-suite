// Tanks, dips and the day's movements (DS5).
import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTerminalDepot, parseStrapping } from '@/contexts/TerminalDepotContext';

// Senior test T1: the strapping table turned every dip into a volume but
// could not be seen or replaced.
const StrappingEditor = ({ tank, setTank }) => {
  const asText = (rows) => (rows || []).map((r) => `${r.heightMm} ${r.volumeM3}`).join('\n');
  const [text, setText] = React.useState(asText(tank.strapping));
  const [error, setError] = React.useState('');
  React.useEffect(() => { setText(asText(tank.strapping)); }, [tank.strapping]);
  const apply = () => {
    const parsed = parseStrapping(text);
    if (parsed.error) { setError(parsed.error); return; }
    setError('');
    setTank(tank.id, { strapping: parsed.rows, strappingIsSample: false });
  };
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-[11px] text-pl-muted hover:text-pl-text">
        Strapping table {tank.strappingIsSample ? '(linear placeholder)' : `(${(tank.strapping || []).length} rows supplied)`}
      </summary>
      {tank.strappingIsSample && (
        <p className="text-[11px] text-pl-warning-text mt-1" data-testid="strapping-placeholder">
          A straight line from capacity and height, standing in for this tank's table. Paste the
          tank's own, one height (mm) and volume (m3) per line, for volumes you can stand behind.
        </p>
      )}
      <textarea
        aria-label={`Strapping table for ${tank.name}`}
        value={text} onChange={(e) => setText(e.target.value)} onBlur={apply} rows={6}
        className="mt-1 w-full rounded border border-pl-border-strong bg-pl-surface p-2 font-mono text-[11px] text-pl-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pl-focus"
      />
      {error && <p className="text-[11px] text-pl-danger-text">{error}</p>}
    </details>
  );
};

// Labels are associated with their inputs rather than merely sitting above
// them, so a screen reader and a test can both find a field by its name.
let cellSeq = 0;
const Cell = ({ label, value, onChange, unit }) => {
  const id = React.useMemo(() => `cell-${(cellSeq += 1)}`, []);
  const text = `${label}${unit ? ` (${unit})` : ''}`;
  return (
    <div>
      <Label htmlFor={id} className="text-[10px] text-pl-muted">{text}</Label>
      <Input id={id} type="number" step="any" value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 text-xs" />
    </div>
  );
};

const TankPanel = () => {
  const { inputs, setTank, setSection, tankStocks } = useTerminalDepot();

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-pl-border bg-pl-raised p-3">
        <h2 className="text-sm font-semibold text-pl-text mb-1">Volume correction</h2>
        <p className="text-[11px] text-pl-muted mb-2">
          The API MPMS Chapter 11.1 coefficients are a published table this app does not ship, so
          supply your commodity group&apos;s row here, or type a VCF straight off your own tables on
          each tank. Without either, only gross observed volumes are reported, which is honest and
          still useful.
        </p>
        <div className="grid grid-cols-3 gap-2">
          <Cell label="K0" value={inputs.vcfCoefficients.k0} onChange={(v) => setSection('vcfCoefficients', { k0: v })} />
          <Cell label="K1" value={inputs.vcfCoefficients.k1} onChange={(v) => setSection('vcfCoefficients', { k1: v })} />
          <Cell label="K2" value={inputs.vcfCoefficients.k2} onChange={(v) => setSection('vcfCoefficients', { k2: v })} />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-pl-text mb-2">Tanks and dips</h2>
        {inputs.tanks.map((t) => {
          const stock = tankStocks.find((s) => s.id === t.id);
          return (
            <div key={t.id} className="rounded-lg border border-pl-border bg-pl-raised p-2 mb-2">
              <Input value={t.name} onChange={(e) => setTank(t.id, { name: e.target.value })}
                className="h-7 text-sm font-medium mb-2" />
              <div className="grid grid-cols-3 gap-2">
                <Cell label="Dip" unit="mm" value={t.dipMm} onChange={(v) => setTank(t.id, { dipMm: v })} />
                <Cell label="Water" unit="mm" value={t.waterMm} onChange={(v) => setTank(t.id, { waterMm: v })} />
                <Cell label="Temp" unit="C" value={t.temperatureC} onChange={(v) => setTank(t.id, { temperatureC: v })} />
                <Cell label="Density 15C" unit="kg/m3" value={t.densityKgM3} onChange={(v) => setTank(t.id, { densityKgM3: v })} />
                <Cell label="Capacity" unit="m3" value={t.capacityM3} onChange={(v) => setTank(t.id, { capacityM3: v })} />
                <Cell label="Heel" unit="m3" value={t.heelM3} onChange={(v) => setTank(t.id, { heelM3: v })} />
                <Cell label="VCF (typed)" value={t.vcf} onChange={(v) => setTank(t.id, { vcf: v })} />
                <Cell label="Height" unit="mm" value={t.maxHeightMm} onChange={(v) => setTank(t.id, { maxHeightMm: v })} />
              </div>
              <StrappingEditor tank={t} setTank={setTank} />
              {stock && (
                <p className="text-[11px] text-pl-muted mt-2">
                  {stock.error
                    ? <span className="text-pl-warning-text">{stock.error}</span>
                    : (
                      <>
                        Gross {stock.grossM3?.toFixed(1)} m3
                        {stock.standardM3 !== null
                          ? `, standard ${stock.standardM3.toFixed(1)} m3 (VCF ${stock.vcfSource})`
                          : ', no standard volume without a VCF'}
                        {stock.waterM3 > 0 && `, water ${stock.waterM3.toFixed(1)} m3 excluded`}
                      </>
                    )}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-pl-text mb-2">The day</h2>
        <p className="text-[11px] text-pl-muted mb-2">
          Opening stock is yesterday&apos;s closing stock. The closing stock is today&apos;s dips above.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Cell label="Opening stock" unit="m3" value={inputs.day.openingStockM3} onChange={(v) => setSection('day', { openingStockM3: v })} />
          <Cell label="Receipts" unit="m3" value={inputs.day.receiptsM3} onChange={(v) => setSection('day', { receiptsM3: v })} />
          <Cell label="Deliveries" unit="m3" value={inputs.day.deliveriesM3} onChange={(v) => setSection('day', { deliveriesM3: v })} />
          <Cell label="Known loss" unit="m3" value={inputs.day.knownLossM3} onChange={(v) => setSection('day', { knownLossM3: v })} />
          <Cell label="Tolerance" unit="% of throughput" value={inputs.day.tolerancePercentOfThroughput} onChange={(v) => setSection('day', { tolerancePercentOfThroughput: v })} />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-pl-text mb-2">Loading rack</h2>
        <div className="grid grid-cols-3 gap-2">
          <Cell label="Arrivals" unit="/hr" value={inputs.rack.arrivalsPerHour} onChange={(v) => setSection('rack', { arrivalsPerHour: v })} />
          <Cell label="Load time" unit="min" value={inputs.rack.loadMinutes} onChange={(v) => setSection('rack', { loadMinutes: v })} />
          <Cell label="Bays" value={inputs.rack.bays} onChange={(v) => setSection('rack', { bays: v })} />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-pl-text mb-2">Throughput economics</h2>
        <div className="grid grid-cols-2 gap-2">
          <Cell label="Fee" unit="$/m3" value={inputs.economics.feePerM3} onChange={(v) => setSection('economics', { feePerM3: v })} />
          <Cell label="Variable cost" unit="$/m3" value={inputs.economics.variableCostPerM3} onChange={(v) => setSection('economics', { variableCostPerM3: v })} />
          <Cell label="Fixed cost" unit="$/period" value={inputs.economics.fixedCostPerPeriod} onChange={(v) => setSection('economics', { fixedCostPerPeriod: v })} />
          <Cell label="Loss factor" unit="kgCO2e/t" value={inputs.economics.lossEmissionFactorKgCo2ePerTonne} onChange={(v) => setSection('economics', { lossEmissionFactorKgCo2ePerTonne: v })} />
        </div>
      </div>
    </div>
  );
};

export default TankPanel;
