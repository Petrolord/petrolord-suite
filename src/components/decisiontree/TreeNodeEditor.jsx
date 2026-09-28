import React from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, GitBranch, Circle, Square, Link2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { COMPACT_FIELD_THEMED } from '@/components/ui/native-select';
import { terminalNode, chanceNode, decisionNode } from './templates';

// Recursive outline editor for the decision tree (D3). Edits are expressed
// as pure functions applied to the node subtree; the parent supplies
// `onChange(newNode)` and re-renders from the root.

// Dense editor fields on the design system (Decision Tree Builder is themed).
const field = (width = 'w-24') => cn(COMPACT_FIELD_THEMED, width);
const typeIcon = { decision: Square, chance: Circle, terminal: GitBranch };

const NodeTypeBadge = ({ type }) => {
  const Icon = typeIcon[type] || GitBranch;
  // The glyph shape tells the node type apart; no colour needed.
  return <Icon className="w-3.5 h-3.5 text-pl-muted" aria-hidden="true" />;
};

const TreeNodeEditor = ({ node, onChange, onLinkMcRun, depth = 0 }) => {
  const set = (patch) => onChange({ ...node, ...patch });

  /**
   * EC4-4 (engines #192). The engine refuses a cost or payoff that is present
   * but blank or not a finite number, by node label; an OMITTED cost is still
   * 0 by contract. A cleared box therefore has to remove the key, not store
   * '' or null (a refusal) and not store 0 (a number the user did not type).
   */
  const omit = (obj, key) => {
    const next = { ...obj };
    delete next[key];
    return next;
  };

  const setOmitting = (key) => onChange(omit(node, key));

  const setBranch = (i, patch) => {
    const branches = node.branches.map((b, j) => (j === i ? { ...b, ...patch } : b));
    set({ branches });
  };

  const setBranchOmitting = (i, key) => {
    const branches = node.branches.map((b, j) => (j === i ? omit(b, key) : b));
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
    <div className={depth > 0 ? 'ml-5 pl-3 border-l border-pl-border' : ''}>
      <div className="flex flex-wrap items-center gap-2 py-1.5">
        <NodeTypeBadge type={node.type} />
        <input
          value={node.label ?? ''}
          onChange={(e) => set({ label: e.target.value })}
          className={field('w-44')}
          placeholder="Node label"
        />
        <select
          value={node.type}
          onChange={(e) => convertTo(e.target.value)}
          aria-label="Node type"
          className={field('w-auto')}
        >
          <option value="decision">Decision</option>
          <option value="chance">Chance</option>
          <option value="terminal">Outcome</option>
        </select>

        {node.type === 'terminal' && !payoffIsLinked && (
          <label className="text-xs text-pl-text flex items-center gap-1">
            Payoff $MM
            <input
              type="number" step="any"
              value={node.payoff ?? ''}
              onChange={(e) => (e.target.value === ''
                ? setOmitting('payoff')
                : set({ payoff: Number(e.target.value) }))}
              className={field()}
            />
          </label>
        )}
        {node.type === 'terminal' && payoffIsLinked && (
          <span className="text-xs text-pl-info-text bg-pl-info-bg border border-pl-info/40 rounded px-2 py-0.5 flex items-center gap-1">
            <Link2 className="w-3 h-3" />
            EPE MC: mean {Number(node.payoff.mean).toFixed(1)} $MM (P90 {Number(node.payoff.p90).toFixed(1)} / P10 {Number(node.payoff.p10).toFixed(1)})
            <button type="button" onClick={() => set({ payoff: Number(node.payoff.mean) })} title="Unlink, keep the mean as a fixed payoff" className="ml-1 text-pl-info-text hover:text-pl-text">
              <X className="w-3 h-3" />
            </button>
          </span>
        )}
        {node.type === 'terminal' && !payoffIsLinked && onLinkMcRun && (
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-pl-primary-text hover:text-pl-primary-text-hover" onClick={() => onLinkMcRun((payoff) => set({ payoff }))}>
            <Link2 className="w-3 h-3 mr-1" /> Link EPE MC run
          </Button>
        )}

        {node.type !== 'terminal' && (
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-pl-primary-text hover:text-pl-primary-text-hover" onClick={addBranch}>
            <Plus className="w-3 h-3 mr-1" /> Branch
          </Button>
        )}
      </div>

      {node.type !== 'terminal' && (node.branches || []).map((b, i) => (
        <div key={i} className="ml-5">
          <div className="flex flex-wrap items-center gap-2 py-1">
            <span className="text-pl-muted text-xs">└</span>
            <input
              value={b.label ?? ''}
              onChange={(e) => setBranch(i, { label: e.target.value })}
              className={field('w-36')}
              placeholder="Branch label"
            />
            {node.type === 'chance' ? (
              <label className="text-xs text-pl-text flex items-center gap-1">
                P
                <input
                  type="number" step="0.01" min="0" max="1"
                  value={b.probability ?? 0}
                  onChange={(e) => setBranch(i, { probability: e.target.value === '' ? 0 : Number(e.target.value) })}
                  className={field('w-16')}
                />
              </label>
            ) : (
              <label className="text-xs text-pl-text flex items-center gap-1">
                Cost $MM
                <input
                  type="number" step="any"
                  value={b.cost ?? ''}
                  onChange={(e) => (e.target.value === ''
                    ? setBranchOmitting(i, 'cost')
                    : setBranch(i, { cost: Number(e.target.value) }))}
                  className={field('w-20')}
                />
              </label>
            )}
            <button type="button" onClick={() => removeBranch(i)} title="Remove branch" aria-label="Remove branch" className="text-pl-muted hover:text-pl-danger-text">
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
