// Identification proposed from the shared wells registry (FLUID-U2-025).
// Nothing changes until the user ticks and applies.
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Database } from 'lucide-react';
import { proposeFluidIdentification } from '@/utils/fluidstudio/registryIdentification';

const NONE = '__none__';

/**
 * @param {{identification: object, onApply: function(Array<[string, string]>): void,
 *   registry?: {listWells: function, listZones: function}}} props
 *   `registry` is injectable for tests; the shared wells registry by default
 */
export default function FluidRegistryProposal({ identification, onApply, registry = null }) {
  const [wells, setWells] = useState(null);
  const [error, setError] = useState('');
  const [well, setWell] = useState(null);
  const [zones, setZones] = useState([]);
  const [zoneId, setZoneId] = useState(NONE);
  const [picked, setPicked] = useState({});
  const reg = async () => registry || import('@/lib/wellsRegistry');

  const load = async () => {
    try { setWells(await (await reg()).listWells()); } catch (e) { setWells([]); setError(e.message || 'Could not read the wells registry.'); }
  };
  const choose = async (id) => {
    const w = (wells || []).find((x) => x.id === id) || null;
    setWell(w);
    setZoneId(NONE);
    setPicked({ well: true, reservoir: true, sampleDepth: true });
    try { setZones(w ? await (await reg()).listZones(id) : []); } catch { setZones([]); }
  };
  const proposal = proposeFluidIdentification({ well, zones, zoneId, identification });
  const apply = () => {
    const changes = proposal.rows.filter((r) => picked[r.key] && !r.same).map((r) => [r.key, r.value]);
    changes.push(['registryWellId', proposal.wellId || ''], ['registryWellName', proposal.wellName || '']);
    onApply(changes);
    setWell(null);
  };

  return (
    <div className="space-y-2" data-testid="fluid-registry">
      {wells === null ? (
        <Button size="sm" variant="outline" onClick={load}><Database className="w-4 h-4 mr-2" />Propose from the wells registry</Button>
      ) : wells.length === 0 ? (
        <p className="text-xs text-pl-muted" data-testid="fluid-registry-empty">{error || 'The shared wells registry holds no wells you can see. Add the well in Well Data Manager, or type the details here.'}</p>
      ) : (
        <Select value={well?.id || ''} onValueChange={choose}>
          <SelectTrigger className="h-8 w-72" aria-label="Registry well"><SelectValue placeholder="Choose a well" /></SelectTrigger>
          <SelectContent>{wells.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}{w.uwi ? ` (${w.uwi})` : ''}</SelectItem>)}</SelectContent>
        </Select>
      )}
      {proposal && (
        <div className="rounded-md border border-pl-border p-3 space-y-2 text-xs" data-testid="fluid-registry-proposal">
          <p className="text-pl-muted">Proposed from <span className="text-pl-text font-medium">{proposal.wellName}</span>. Nothing changes until you apply.</p>
          {zones.length > 0 && (
            <Select value={zoneId} onValueChange={setZoneId}>
              <SelectTrigger className="h-8 w-72" aria-label="Zone sampled"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No zone</SelectItem>
                {zones.map((z) => <SelectItem key={z.id} value={String(z.id)}>{z.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {proposal.rows.map((r) => (
            <label key={r.key} className={`flex items-start gap-2 ${r.same ? 'text-pl-muted' : 'text-pl-text'}`}>
              <input type="checkbox" disabled={r.same} checked={!r.same && !!picked[r.key]} onChange={(e) => setPicked((p) => ({ ...p, [r.key]: e.target.checked }))} data-testid={`fluid-registry-pick-${r.key}`} />
              <span>{r.label}: {r.value}{r.same ? ' (already set)' : r.current ? ` (now "${r.current}")` : ''}</span>
            </label>
          ))}
          <Button size="sm" onClick={apply} data-testid="fluid-registry-apply">Apply the ticked values</Button>
        </div>
      )}
    </div>
  );
}
