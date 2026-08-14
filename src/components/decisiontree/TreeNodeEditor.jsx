import React from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, GitBranch, Circle, Square, Link2, X } from 'lucide-react';
import { terminalNode, chanceNode, decisionNode } from './templates';

// Recursive outline editor for the decision tree (D3). Edits are expressed
// as pure functions applied to the node subtree; the parent supplies
// `onChange(newNode)` and re-renders from the root.

const inputCls = 'px-2 py-1 rounded bg-slate-800 border border-slate-600 text-white text-xs w-24';
const typeIcon = { decision: Square, chance: Circle, terminal: GitBranch };

const NodeTypeBadge = ({ type }) => {
  const Icon = typeIcon[type] || GitBranch;
  const color = type === 'decision' ? 'text-sky-300' : type === 'chance' ? 'text-amber-300' : 'text-lime-300';
  return <Icon className={`w-3.5 h-3.5 ${color}`} />;
};

const TreeNodeEditor = ({ node, onChange, onLinkMcRun, depth = 0 }) => {
  const set = (patch) => onChange({ ...node, ...patch });

  const setBranch = (i, patch) => {
    const branches = node.branches.map((b, j) => (j === i ? { ...b, ...patch } : b));
    set({ branches });
  };

  const setBranchNode = (i, child) => setBranch(i, { node: child });

  const addBranch = () => {
    const isChance = node.type === 'chance';
    const branch = isChance
      ? { label: `Outcome ${node.branches.length + 1}`, probability: 0, node: terminalNode() }
      : { label: `Option ${node.branches.length + 1}`, cost: 0, node: terminalNode() };
    set({ branches: [...node.branches, branch] });
  };

  const removeBranch = (i) => set({ branches: node.branches.filter((_, j) => j !== i) });

  const convertTo = (type) => {
    if (type === node.type) return;
    if (type === 'terminal') onChange({ ...terminalNode(node.label, 0), id: node.id, label: node.label });
    else if (type === 'chance') onChange({ ...chanceNode(node.label), id: node.id, label: node.label });
    else onChange({ ...decisionNode(node.label), id: node.id, label: node.label });
  };

  const payoffIsLinked = node.type === 'terminal' && node.payoff != null && typeof node.payoff === 'object';

  return (
    <div className={depth > 0 ? 'ml-5 pl-3 border-l border-white/10' : ''}>
      <div className="flex flex-wrap items-center gap-2 py-1.5">
        <NodeTypeBadge type={node.type} />
        <input
          value={node.label ?? ''}
          onChange={(e) => set({ label: e.target.value })}
          className={`${inputCls} w-44`}
          placeholder="Node label"
        />
        <select
          value={node.type}
          onChange={(e) => convertTo(e.target.value)}
          className="px-1.5 py-1 rounded bg-slate-800 border border-slate-600 text-slate-200 text-xs"
        >
          <option value="decision">Decision</option>
          <option value="chance">Chance</option>
          <option value="terminal">Outcome</option>
        </select>

        {node.type === 'terminal' && !payoffIsLinked && (
          <label className="text-xs text-slate-300 flex items-center gap-1">
            Payoff $MM
            <input
              type="number" step="any"
              value={node.payoff ?? 0}
              onChange={(e) => set({ payoff: e.target.value === '' ? 0 : Number(e.target.value) })}
              className={inputCls}
            />
          </label>
        )}
        {node.type === 'terminal' && payoffIsLinked && (
          <span className="text-xs text-emerald-300 bg-emerald-900/30 border border-emerald-500/30 rounded px-2 py-0.5 flex items-center gap-1">
            <Link2 className="w-3 h-3" />
            EPE MC: mean {Number(node.payoff.mean).toFixed(1)} $MM (P90 {Number(node.payoff.p90).toFixed(1)} / P10 {Number(node.payoff.p10).toFixed(1)})
            <button type="button" onClick={() => set({ payoff: Number(node.payoff.mean) })} title="Unlink, keep the mean as a fixed payoff" className="ml-1 text-slate-300 hover:text-white">
              <X className="w-3 h-3" />
            </button>
          </span>
        )}
        {node.type === 'terminal' && !payoffIsLinked && onLinkMcRun && (
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-sky-300 hover:text-sky-200" onClick={() => onLinkMcRun((payoff) => set({ payoff }))}>
            <Link2 className="w-3 h-3 mr-1" /> Link EPE MC run
          </Button>
        )}

        {node.type !== 'terminal' && (
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-lime-300 hover:text-lime-200" onClick={addBranch}>
            <Plus className="w-3 h-3 mr-1" /> Branch
          </Button>
        )}
      </div>

      {node.type !== 'terminal' && (node.branches || []).map((b, i) => (
        <div key={i} className="ml-5">
          <div className="flex flex-wrap items-center gap-2 py-1">
            <span className="text-slate-500 text-xs">└</span>
            <input
              value={b.label ?? ''}
              onChange={(e) => setBranch(i, { label: e.target.value })}
              className={`${inputCls} w-36`}
              placeholder="Branch label"
            />
            {node.type === 'chance' ? (
              <label className="text-xs text-slate-300 flex items-center gap-1">
                P
                <input
                  type="number" step="0.01" min="0" max="1"
                  value={b.probability ?? 0}
                  onChange={(e) => setBranch(i, { probability: e.target.value === '' ? 0 : Number(e.target.value) })}
                  className={`${inputCls} w-16`}
                />
              </label>
            ) : (
              <label className="text-xs text-slate-300 flex items-center gap-1">
                Cost $MM
                <input
                  type="number" step="any"
                  value={b.cost ?? 0}
                  onChange={(e) => setBranch(i, { cost: e.target.value === '' ? 0 : Number(e.target.value) })}
                  className={`${inputCls} w-20`}
                />
              </label>
            )}
            <button type="button" onClick={() => removeBranch(i)} title="Remove branch" className="text-slate-500 hover:text-red-400">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <TreeNodeEditor
            node={b.node}
            depth={depth + 1}
            onChange={(child) => setBranchNode(i, child)}
            onLinkMcRun={onLinkMcRun}
          />
        </div>
      ))}
    </div>
  );
};

export default TreeNodeEditor;
