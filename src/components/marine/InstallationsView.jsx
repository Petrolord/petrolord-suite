// Installations and demand: the Ekene demo, a pasted data set, and the
// cluster every voyage calculation reads (SC4): products, vessels,
// installations with their demand and voyage cargo, and the milk run.
import React, { useState } from 'react';
import {
  Database, FileDown, Plus, Trash2, Upload, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMarineLogistics } from '@/contexts/MarineLogisticsContext';
import {
  ACTIVITIES, INSTALLATION_CSV_HELP, blankInstallation, blankVessel, installationsToCsv, parseDataText,
} from '@/utils/supplychain/marineAdapters';
import { downloadText } from '@/lib/fullPrecision';
import {
  Cell, NumField, Note, Panel, TextField, inputClass,
} from './common';

const renameKey = (obj, from, to) => {
  if (!obj || from === to || !Object.prototype.hasOwnProperty.call(obj, from) || Object.prototype.hasOwnProperty.call(obj, to)) return obj;
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k === from ? to : k, v]));
};
const dropKey = (obj, key) => Object.fromEntries(Object.entries(obj || {}).filter(([k]) => k !== key));
const resize = (list, n) => Array.from({ length: n }, (_, i) => (list[i] === undefined ? '' : list[i]));

const LoadPanel = () => {
  const {
    inputs, loadEkene, importDataSet, importInstallations, clearAll, addNotification,
  } = useMarineLogistics();
  const [paste, setPaste] = useState('');
  const [parseError, setParseError] = useState(null);
  const doImport = () => {
    const parsed = parseDataText(paste);
    if (parsed.error) { setParseError(parsed.error); return; }
    setParseError(null);
    if (parsed.dataSet) {
      importDataSet(parsed.dataSet);
      addNotification('Imported the data set. Every control it states was filled; the rest are as they were.', 'success');
    } else {
      importInstallations(parsed.installations);
      addNotification(`Imported ${parsed.installations.length} installations. Products, vessels, the milk run and every calculation input are unchanged.`, 'success');
    }
  };
  const exportCsv = () => {
    if (!downloadText('marine-installations.csv', installationsToCsv(inputs.cluster.installations))) addNotification('The download could not start in this browser.', 'error');
  };
  return (
    <Panel title="Load a cluster" testId="cluster-load">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={loadEkene} data-testid="load-ekene">
          <Database className="mr-1 h-4 w-4" /> Load the Ekene demo
        </Button>
        <Button size="sm" variant="outline" onClick={clearAll} data-testid="clear-all">
          <Trash2 className="mr-1 h-4 w-4" /> Clear everything
        </Button>
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={!inputs.cluster.installations.length} data-testid="export-installations">
          <FileDown className="mr-1 h-4 w-4" /> Installations as CSV
        </Button>
      </div>
      <Note>
        The Ekene demo is a synthetic offshore cluster for block EK-11, Petrolord&apos;s fictional teaching field: four installations
        supplied from one base by a PSV and an AHTS, a week&apos;s demand, one voyage of cargo, a deck load and the supply base. It is
        the same file the marine logistics engine is validated on. No real company, vessel, port or installation appears in it.
      </Note>
      <div className="space-y-1">
        <label htmlFor="mlp-data-paste" className="block text-[11px] font-medium text-pl-text">Paste a data set (JSON) or installations (CSV)</label>
        <textarea
          id="mlp-data-paste"
          data-testid="data-paste"
          className="h-32 w-full rounded-md border border-pl-border-strong bg-pl-surface p-2 font-mono text-xs text-pl-text"
          value={paste}
          placeholder={'id,name,distanceFromBaseNm,fieldHours,minVisits,demand_deckAreaM2,demand_deckWeightT,demand_diesel,cargo_deckAreaM2,cargo_deckWeightT,cargo_diesel\nP-1,Platform one,40,6,2,300,350,200,100,120,70'}
          onChange={(e) => setPaste(e.target.value)}
        />
        <p className="text-[10px] leading-snug text-pl-muted">
          CSV columns: {INSTALLATION_CSV_HELP}. A CSV replaces the installations only. JSON takes the Ekene data set&apos;s shape
          (products, vessels, installations, milkRun, portHours, weather, fuelPricePerT, period, variability, deck, deckItems,
          shoreBase); each key present fills the controls it states and the rest stay as they are. A key or column the planner
          does not read is refused by name.
        </p>
        <Button size="sm" onClick={doImport} data-testid="import-data" variant="outline">
          <Upload className="mr-1 h-4 w-4" /> Import
        </Button>
        {parseError ? <Note tone="warn" testId="data-parse-error">{parseError}</Note> : null}
      </div>
    </Panel>
  );
};

const ProductsPanel = () => {
  const { inputs, updateCluster } = useMarineLogistics();
  const { products } = inputs.cluster;
  const setProduct = (i, patch) => updateCluster((c) => {
    const old = c.products[i];
    const next = { ...c, products: c.products.map((p, j) => (j === i ? { ...p, ...patch } : p)) };
    if (patch.id !== undefined && patch.id !== old.id && old.id) {
      // A renamed product keeps its tanks and its bulk figures.
      next.vessels = c.vessels.map((v) => ({ ...v, tanks: renameKey(v.tanks, old.id, patch.id) }));
      next.installations = c.installations.map((x) => ({
        ...x,
        demand: { ...x.demand, bulk: renameKey(x.demand.bulk, old.id, patch.id) },
        cargo: { ...x.cargo, bulk: renameKey(x.cargo.bulk, old.id, patch.id) },
      }));
    }
    return next;
  });
  const remove = (i) => updateCluster((c) => {
    const id = c.products[i].id;
    return {
      ...c,
      products: c.products.filter((_, j) => j !== i),
      vessels: c.vessels.map((v) => ({ ...v, tanks: dropKey(v.tanks, id) })),
      installations: c.installations.map((x) => ({
        ...x, demand: { ...x.demand, bulk: dropKey(x.demand.bulk, id) }, cargo: { ...x.cargo, bulk: dropKey(x.cargo.bulk, id) },
      })),
    };
  });
  return (
    <Panel title="Bulk products" testId="products-panel" right={<span className="text-[11px] text-pl-muted" data-testid="product-count">{products.length} products</span>}>
      <Note>Each product travels in its own tank. Its density turns the m3 carried into tonnes of deadweight.</Note>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-pl-muted">
            <tr><th className="p-1">Id</th><th className="p-1">Name</th><th className="p-1">Kind</th><th className="p-1">Density (t/m3)</th><th /></tr>
          </thead>
          <tbody>
            {products.map((p, i) => (
              <tr key={i} className="border-t border-pl-border" data-testid={`product-row-${i}`}>
                <td className="p-1"><Cell numeric={false} label={`Product ${i + 1} id`} testId={`product-id-${i}`} value={p.id} onChange={(v) => setProduct(i, { id: v })} /></td>
                <td className="p-1"><Cell numeric={false} label={`Product ${i + 1} name`} testId={`product-name-${i}`} value={p.name} onChange={(v) => setProduct(i, { name: v })} placeholder="optional" /></td>
                <td className="p-1">
                  <select aria-label={`Product ${i + 1} kind`} data-testid={`product-kind-${i}`} className={inputClass} value={p.kind} onChange={(e) => setProduct(i, { kind: e.target.value })}>
                    <option value="">Choose (required)</option>
                    <option value="liquid">Liquid bulk</option>
                    <option value="dry">Dry bulk</option>
                  </select>
                </td>
                <td className="p-1"><Cell label={`Product ${i + 1} density`} testId={`product-density-${i}`} value={p.densityTPerM3} onChange={(v) => setProduct(i, { densityTPerM3: v })} /></td>
                <td className="p-1"><Button size="icon" variant="ghost" className="h-7 w-7 text-pl-muted" onClick={() => remove(i)} aria-label={`Remove product ${i + 1}`}><X className="h-4 w-4" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button size="sm" variant="ghost" className="text-pl-primary-text hover:text-pl-primary-text-hover" data-testid="add-product" onClick={() => updateCluster((c) => ({ ...c, products: [...c.products, { id: '', name: '', kind: '', densityTPerM3: '' }] }))}>
        <Plus className="mr-1 h-3 w-3" /> Product
      </Button>
    </Panel>
  );
};

const VESSEL_FIELDS = [
  ['speedKnots', 'Service speed (knots)'],
  ['deckAreaM2', 'Clear deck area (m2)'],
  ['deckUsableFraction', 'Usable deck fraction (above 0, at most 1)'],
  ['deckLoadT', 'Deck load (t)'],
  ['deadweightT', 'Cargo deadweight (t)'],
];

const VesselsPanel = () => {
  const { inputs, updateCluster } = useMarineLogistics();
  const { vessels, products } = inputs.cluster;
  const setVessel = (i, patch) => updateCluster((c) => ({ ...c, vessels: c.vessels.map((v, j) => (j === i ? { ...v, ...patch } : v)) }));
  return (
    <Panel title="Vessels" testId="vessels-panel" right={<span className="text-[11px] text-pl-muted" data-testid="vessel-count">{vessels.length} vessels</span>}>
      <Note>Deck area times the usable fraction is the deck space a voyage can fill. Cargo deadweight is your net figure for cargo; there is no stowage factor.</Note>
      <div className="grid gap-3 lg:grid-cols-2">
        {vessels.map((v, i) => (
          <div key={i} className="space-y-2 rounded-md border border-pl-border p-2" data-testid={`vessel-card-${i}`}>
            <div className="flex items-end gap-2">
              <div className="w-28"><TextField label="Key" testId={`vessel-key-${i}`} value={v.key} onChange={(x) => setVessel(i, { key: x })} /></div>
              <div className="flex-1"><TextField label="Name" testId={`vessel-name-${i}`} value={v.name} onChange={(x) => setVessel(i, { name: x })} placeholder="optional" /></div>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-pl-muted" onClick={() => updateCluster((c) => ({ ...c, vessels: c.vessels.filter((_, j) => j !== i) }))} aria-label={`Remove vessel ${i + 1}`}><X className="h-4 w-4" /></Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {VESSEL_FIELDS.map(([k, label]) => (
                <NumField key={k} label={label} testId={`vessel-${k}-${i}`} value={v[k]} onChange={(x) => setVessel(i, { [k]: x })} />
              ))}
            </div>
            <div>
              <p className="mb-1 text-[11px] font-medium text-pl-text">Fuel burn (t an hour)</p>
              <div className="grid grid-cols-3 gap-2">
                {ACTIVITIES.map((a) => (
                  <NumField key={a} label={a === 'sailing' ? 'Sailing' : a === 'port' ? 'In port' : 'In the field'} testId={`vessel-fuel-${a}-${i}`} value={v.fuelTPerHour[a]} onChange={(x) => setVessel(i, { fuelTPerHour: { ...v.fuelTPerHour, [a]: x } })} />
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-medium text-pl-text">Tank capacity (m3, 0 when the vessel has no tank for the product)</p>
              {products.length === 0 ? <Note>Add the bulk products first.</Note> : (
                <div className="grid grid-cols-3 gap-2">
                  {products.map((p, k) => (
                    <NumField key={k} label={p.id || `product ${k + 1}`} testId={`vessel-tank-${p.id}-${i}`} value={v.tanks[p.id]} onChange={(x) => setVessel(i, { tanks: { ...v.tanks, [p.id]: x } })} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <Button size="sm" variant="ghost" className="text-pl-primary-text hover:text-pl-primary-text-hover" data-testid="add-vessel" onClick={() => updateCluster((c) => ({ ...c, vessels: [...c.vessels, blankVessel(`vessel-${c.vessels.length + 1}`)] }))}>
        <Plus className="mr-1 h-3 w-3" /> Vessel
      </Button>
    </Panel>
  );
};

const InstallationsPanel = () => {
  const { inputs, updateCluster } = useMarineLogistics();
  const { installations, products } = inputs.cluster;
  const setInst = (i, patch) => updateCluster((c) => ({ ...c, installations: c.installations.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const setCargo = (i, part, patch) => setInst(i, { [part]: { ...installations[i][part], ...patch } });
  const setBulk = (i, part, id, v) => setCargo(i, part, { bulk: { ...installations[i][part].bulk, [id]: v } });
  const bulkHead = (part) => products.map((p) => <th key={`${part}-${p.id}`} className="p-1">{p.id || '?'} (m3)</th>);
  return (
    <Panel title="Installations" testId="installations-panel" right={<span className="text-[11px] text-pl-muted" data-testid="installation-count">{installations.length} installations</span>}>
      <Note>
        Demand is what an installation needs over the fleet sizing period; voyage cargo is what one voyage carries to it for the voyage
        plan. The distance from the base is read on dedicated voyages; a milk run reads its legs below. A blank bulk cell carries none of
        that product.
      </Note>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-pl-muted">
            <tr>
              <th className="p-1" colSpan={5}>Installation</th>
              <th className="border-l border-pl-border p-1" colSpan={2 + products.length}>Demand over the period</th>
              <th className="border-l border-pl-border p-1" colSpan={2 + products.length}>Cargo on one voyage</th>
              <th />
            </tr>
            <tr>
              <th className="p-1">Id</th><th className="p-1">Name</th><th className="p-1">From base (NM)</th><th className="p-1">Field hours a visit</th><th className="p-1">Minimum visits</th>
              <th className="border-l border-pl-border p-1">Deck (m2)</th><th className="p-1">Deck (t)</th>{bulkHead('demand')}
              <th className="border-l border-pl-border p-1">Deck (m2)</th><th className="p-1">Deck (t)</th>{bulkHead('cargo')}
              <th />
            </tr>
          </thead>
          <tbody>
            {installations.map((x, i) => (
              <tr key={i} className="border-t border-pl-border" data-testid={`installation-row-${x.id || i}`}>
                <td className="p-1"><Cell numeric={false} label={`Installation ${i + 1} id`} testId={`inst-id-${i}`} value={x.id} onChange={(v) => setInst(i, { id: v })} /></td>
                <td className="p-1"><Cell numeric={false} label={`Installation ${i + 1} name`} testId={`inst-name-${i}`} value={x.name} onChange={(v) => setInst(i, { name: v })} placeholder="optional" /></td>
                <td className="p-1"><Cell label={`Installation ${i + 1} distance`} testId={`inst-distance-${i}`} value={x.distanceFromBaseNm} onChange={(v) => setInst(i, { distanceFromBaseNm: v })} placeholder="dedicated" /></td>
                <td className="p-1"><Cell label={`Installation ${i + 1} field hours`} testId={`inst-field-${i}`} value={x.fieldHours} onChange={(v) => setInst(i, { fieldHours: v })} /></td>
                <td className="p-1"><Cell label={`Installation ${i + 1} minimum visits`} testId={`inst-visits-${i}`} value={x.minVisits} onChange={(v) => setInst(i, { minVisits: v })} /></td>
                {['demand', 'cargo'].map((part) => (
                  <React.Fragment key={part}>
                    <td className="border-l border-pl-border p-1"><Cell label={`Installation ${i + 1} ${part} deck area`} testId={`inst-${part}-area-${i}`} value={x[part].deckAreaM2} onChange={(v) => setCargo(i, part, { deckAreaM2: v })} /></td>
                    <td className="p-1"><Cell label={`Installation ${i + 1} ${part} deck weight`} testId={`inst-${part}-weight-${i}`} value={x[part].deckWeightT} onChange={(v) => setCargo(i, part, { deckWeightT: v })} /></td>
                    {products.map((p) => (
                      <td key={p.id} className="p-1"><Cell label={`Installation ${i + 1} ${part} ${p.id}`} testId={`inst-${part}-${p.id}-${i}`} value={x[part].bulk[p.id]} onChange={(v) => setBulk(i, part, p.id, v)} placeholder="none" /></td>
                    ))}
                  </React.Fragment>
                ))}
                <td className="p-1"><Button size="icon" variant="ghost" className="h-7 w-7 text-pl-muted" onClick={() => updateCluster((c) => ({ ...c, installations: c.installations.filter((_, j) => j !== i) }))} aria-label={`Remove installation ${i + 1}`}><X className="h-4 w-4" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {installations.length === 0 ? <Note tone="warn" testId="empty-cluster">There are no installations. Load the Ekene demo, paste your own, or add one.</Note> : null}
      <Button size="sm" variant="ghost" className="text-pl-primary-text hover:text-pl-primary-text-hover" data-testid="add-installation" onClick={() => updateCluster((c) => ({ ...c, installations: [...c.installations, blankInstallation()] }))}>
        <Plus className="mr-1 h-3 w-3" /> Installation
      </Button>
    </Panel>
  );
};

const MilkRunPanel = () => {
  const { inputs, updateCluster } = useMarineLogistics();
  const { milkRun, installations } = inputs.cluster;
  const setStops = (stops) => updateCluster((c) => ({ ...c, milkRun: { stops, legsNm: resize(c.milkRun.legsNm, stops.length + 1) } }));
  const names = ['base', ...milkRun.stops, 'base'];
  return (
    <Panel title="Milk run" testId="milkrun-panel">
      <Note>The order the stops are sailed in, and a distance for every leg: base to the first stop, stop to stop, the last stop back to the base.</Note>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <TextField
            label="Stops in the order sailed (installation ids, comma separated)"
            testId="milkrun-stops"
            value={milkRun.stops.join(', ')}
            onChange={(v) => setStops(v === '' ? [] : v.split(',').map((s) => s.trim()))}
          />
        </div>
        <Button size="sm" variant="outline" className="h-8" disabled={!installations.length} onClick={() => setStops(installations.map((x) => x.id))} data-testid="milkrun-fill">
          Stops in table order
        </Button>
      </div>
      {milkRun.stops.length ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {resize(milkRun.legsNm, milkRun.stops.length + 1).map((nm, i) => (
            <NumField
              key={i}
              label={`${names[i] || '?'} to ${names[i + 1] || '?'} (NM)`}
              testId={`milkrun-leg-${i}`}
              value={nm}
              onChange={(v) => updateCluster((c) => ({ ...c, milkRun: { ...c.milkRun, legsNm: resize(c.milkRun.legsNm, c.milkRun.stops.length + 1).map((x, j) => (j === i ? v : x)) } }))}
            />
          ))}
        </div>
      ) : null}
    </Panel>
  );
};

const InstallationsView = () => {
  const { inputs } = useMarineLogistics();
  return (
    <div className="space-y-4">
      <LoadPanel />
      {inputs.cluster.title ? <p className="text-xs text-pl-text" data-testid="cluster-title">{inputs.cluster.title}</p> : null}
      <InstallationsPanel />
      <div className="grid gap-4 xl:grid-cols-2">
        <ProductsPanel />
        <MilkRunPanel />
      </div>
      <VesselsPanel />
    </div>
  );
};

export default InstallationsView;
