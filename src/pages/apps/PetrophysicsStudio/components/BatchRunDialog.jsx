// Multi-well batch runs (Petrophysics Studio G2.5): apply the CURRENT
// parameter set across several owned wells and publish the computed
// curves to each — the roadmap's "multi-well batch runs". Read-only
// (org-shared) wells are excluded up front; each well's outcome is
// reported so a partial failure is visible, not swallowed.

import React, { useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Check, X, Play } from 'lucide-react';

export default function BatchRunDialog({ open, onOpenChange, wells, runBatch }) {
  const ownWells = useMemo(() => wells.filter((w) => w.is_own), [wells]);
  const [picked, setPicked] = useState(() => new Set());
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null); // [{well, ok, message}]

  const toggle = (id) => setPicked((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const run = async () => {
    setRunning(true);
    setResults([]);
    const out = [];
    for (const w of ownWells.filter((x) => picked.has(x.id))) {
      // eslint-disable-next-line no-await-in-loop
      const r = await runBatch(w).then(
        (n) => ({ well: w, ok: true, message: `${n} curves published` }),
        (e) => ({ well: w, ok: false, message: e.message }),
      );
      out.push(r);
      setResults([...out]);
    }
    setRunning(false);
  };

  const close = (v) => { if (!v) { setResults(null); setPicked(new Set()); } onOpenChange(v); };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg bg-slate-900 border-slate-700 text-slate-200" data-testid="petro-batch-dialog">
        <DialogHeader>
          <DialogTitle>Batch run — current parameters</DialogTitle>
          <DialogDescription className="text-slate-400">
            Computes and publishes with the parameter set now applied. Only wells you own can be written.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-64 overflow-auto space-y-1">
          {ownWells.map((w) => {
            const r = results?.find((x) => x.well.id === w.id);
            return (
              <label key={w.id} className="flex items-center gap-2 text-xs py-0.5" data-testid="petro-batch-well">
                <input
                  type="checkbox"
                  data-testid={`petro-batch-pick-${w.name}`}
                  checked={picked.has(w.id)}
                  disabled={running}
                  onChange={() => toggle(w.id)}
                />
                <span className="text-slate-200">{w.name}</span>
                {r && (
                  <span className={`ml-auto inline-flex items-center gap-1 ${r.ok ? 'text-emerald-400' : 'text-red-400'}`}
                    data-testid={`petro-batch-result-${w.name}`}
                  >
                    {r.ok ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                    {r.message}
                  </span>
                )}
              </label>
            );
          })}
          {!ownWells.length && <p className="text-xs text-slate-500">No wells you own to batch.</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" className="border-slate-700 text-slate-300" onClick={() => close(false)}>
            {results ? 'Close' : 'Cancel'}
          </Button>
          <Button
            size="sm"
            className="bg-cyan-600 hover:bg-cyan-500 text-white"
            disabled={running || !picked.size}
            data-testid="petro-batch-run"
            onClick={run}
          >
            {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
            Run {picked.size || ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
