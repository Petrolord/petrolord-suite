// Building the network: nodes, the lines between them, and pulling a
// whole field in from the shared well records.
//
// The "build from field" button is the payoff for P6.5. Every well
// studio in the module saves its well description to po_well_models;
// this reads all of them at once and puts them on a header. A field
// described well by well in six different studios becomes a network in
// one click.
import React from 'react';
import { Plus, Trash2, Waypoints, Download, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { useProductionNetwork } from '@/contexts/ProductionNetworkContext';
import { Field, Num, Text } from './fields';

const TopologyPanel = () => {
  const {
    inputs, addWell, addJunction, addBranch, removeNode, removeBranch,
    setSelectedId, selectedId, topology, wellProblems,
    fields, patchLink, buildFromField,
  } = useProductionNetwork();

  const nodeLabel = (id) => inputs.nodes.find((n) => n.id === id)?.label || '?';

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-xs text-pl-muted">Field on the production spine</Label>
        <Select
          value={inputs.link.fieldId || ''}
          onValueChange={(v) => patchLink({ fieldId: v || null })}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Not linked" />
          </SelectTrigger>
          <SelectContent>
            {fields.map((f) => (<SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>))}
          </SelectContent>
        </Select>
        <Button
          variant="outline" className="w-full h-9"
          onClick={buildFromField} disabled={!inputs.link.fieldId}
        >
          <Download className="w-3.5 h-3.5 mr-1" /> Build from the shared well records
        </Button>
        <p className="text-[11px] text-pl-muted">
          Every well studio in this module saves its well description to the same shared record.
          This reads all of them at once and puts them on a header, so a field described well by
          well elsewhere becomes a network here without being retyped.
        </p>
      </div>

      <div className="border-t border-pl-border pt-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-widest text-pl-muted font-bold">Nodes</p>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addWell}>
              <Plus className="w-3 h-3 mr-1" /> Well
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addJunction}>
              <Plus className="w-3 h-3 mr-1" /> Junction
            </Button>
          </div>
        </div>
        {inputs.nodes.map((n) => {
          const bad = wellProblems.find((p) => p.id === n.id);
          return (
            <button
              type="button"
              key={n.id}
              onClick={() => setSelectedId(n.id)}
              className={`w-full text-left px-2 py-1.5 rounded border text-xs flex items-center justify-between gap-2 ${
                selectedId === n.id
                  ? 'bg-pl-sunken border-pl-primary'
                  : 'bg-pl-surface border-pl-border hover:border-pl-border-strong'
              }`}
            >
              <span className="truncate">
                <span className="text-pl-muted">
                  {n.kind}
                </span>
                <span className="text-pl-text ml-2">{n.label}</span>
                {n.spineWellId && <Link2 className="w-3 h-3 inline ml-1 text-pl-muted" />}
              </span>
              {bad && <span className="text-pl-danger-text shrink-0">incomplete</span>}
            </button>
          );
        })}
      </div>

      <div className="border-t border-pl-border pt-3 space-y-2">
        <p className="text-[10px] uppercase tracking-widest text-pl-muted font-bold">Lines</p>
        {inputs.branches.map((b) => (
          <div key={b.id} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedId(b.id)}
              className={`flex-1 text-left px-2 py-1.5 rounded border text-xs truncate ${
                selectedId === b.id
                  ? 'bg-pl-sunken border-pl-primary'
                  : 'bg-pl-surface border-pl-border hover:border-pl-border-strong'
              }`}
            >
              <span className="text-pl-text">{b.label}</span>
              <span className="text-pl-muted ml-2">
                {nodeLabel(b.from)} to {nodeLabel(b.to)}
              </span>
            </button>
            <Button
              size="icon" variant="ghost"
              className="h-7 w-7 text-pl-muted hover:text-pl-danger-text"
              onClick={() => removeBranch(b.id)}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
        <AddBranch nodes={inputs.nodes} onAdd={addBranch} />
      </div>

      {!topology.ok && (
        <p className="text-[11px] text-pl-danger-text border-t border-pl-border pt-3">{topology.error}</p>
      )}
      {selectedId && inputs.nodes.some((n) => n.id === selectedId)
        && inputs.nodes.find((n) => n.id === selectedId)?.kind !== 'sink' && (
        <Button
          variant="outline"
          className="w-full h-8 text-xs text-pl-danger-text border-pl-danger/40 hover:bg-pl-danger-bg"
          onClick={() => removeNode(selectedId)}
        >
          <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove {nodeLabel(selectedId)}
        </Button>
      )}
    </div>
  );
};

const AddBranch = ({ nodes, onAdd }) => {
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  return (
    <div className="flex items-end gap-1 pt-1">
      <Select value={from} onValueChange={setFrom}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="From" />
        </SelectTrigger>
        <SelectContent>
          {nodes.filter((n) => n.kind !== 'sink').map((n) => (
            <SelectItem key={n.id} value={n.id}>{n.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={to} onValueChange={setTo}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="To" />
        </SelectTrigger>
        <SelectContent>
          {nodes.filter((n) => n.kind !== 'well').map((n) => (
            <SelectItem key={n.id} value={n.id}>{n.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm" variant="outline" className="h-8 text-xs shrink-0"
        onClick={() => { onAdd(from, to); setFrom(''); setTo(''); }}
        disabled={!from || !to}
      >
        <Plus className="w-3 h-3" />
      </Button>
    </div>
  );
};

export default TopologyPanel;
