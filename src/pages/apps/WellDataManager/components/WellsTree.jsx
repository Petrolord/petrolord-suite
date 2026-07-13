// Wells explorer tree (the SeismicExplorer idiom, workstation-lite):
// search box, one row per well with an org/private badge, context menu
// with the owner-only actions. Presentational — state and persistence
// live in WellWorkstation.

import React from 'react';
import {
  CircleDot, Search, Building2, Lock, Loader2, Trash2, Share2, Upload, Plus,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem,
  ContextMenuSeparator,
} from '@/components/ui/context-menu';

function Row({ well, selected, busy, onSelect, onShareToggle, onDelete }) {
  const shared = !!well.organization_id;
  const row = (
    <div
      role="button"
      tabIndex={0}
      data-testid="wdm-well-row"
      data-well-name={well.name}
      title={well.uwi ? `UWI ${well.uwi}` : well.name}
      className={`group flex items-center gap-1.5 pl-2.5 pr-2 py-[3px] text-[13px]
        cursor-pointer select-none min-w-0
        ${selected ? 'bg-cyan-500/10 text-cyan-200' : 'text-slate-300 hover:bg-slate-800/70'}`}
      onClick={() => onSelect(well.id)}
      onKeyDown={(e) => { if (e.key === 'Enter') onSelect(well.id); }}
    >
      <CircleDot className="w-3.5 h-3.5 shrink-0 text-amber-400" />
      <span className="truncate">{well.name}</span>
      <span
        data-testid="wdm-well-badge"
        title={shared
          ? `Shared with the organization${well.is_own ? '' : ' (read-only for you)'}`
          : 'Private — only you can see this well'}
        className={`ml-1 inline-flex items-center gap-0.5 rounded px-1 text-[10px]
          ${shared ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-700/60 text-slate-400'}`}
      >
        {shared ? <Building2 className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
        {shared ? 'org' : 'private'}
      </span>
      <span className="ml-auto pl-2 text-[11px] text-slate-500 whitespace-nowrap">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" />
          : (well.td_md_m ? `TD ${Math.round(well.td_md_m)} m` : '')}
      </span>
    </div>
  );
  if (!well.is_own) return row; // read-only: no owner actions to offer
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuItem onSelect={() => onShareToggle(well)}>
          <Share2 className="w-4 h-4 mr-2" />
          {shared ? 'Stop sharing with organization' : 'Share with organization'}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem className="text-red-400" onSelect={() => onDelete(well)}>
          <Trash2 className="w-4 h-4 mr-2" />
          Delete well…
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/**
 * @param {Object} p
 * @param {Array} p.wells filtered list (controller applies the search)
 * @param {string} p.search
 */
export default function WellsTree({
  wells, total, search, onSearch, selectedId, busyId,
  onSelect, onShareToggle, onDelete, onImportLas, onAddWell,
}) {
  return (
    <div className="h-full min-h-0 flex flex-col bg-slate-900/60" data-testid="wdm-tree">
      <div className="p-1.5 border-b border-slate-800/60 space-y-1.5">
        <div className="flex items-center gap-1">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-1.5 top-1.5 text-slate-500" />
            <input
              data-testid="wdm-tree-search"
              className="w-full rounded-md bg-slate-950 border border-slate-700 text-slate-200
                pl-6 pr-1.5 py-1 text-xs"
              placeholder="Search wells…"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            data-testid="wdm-open-las"
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-xs rounded
              border border-cyan-700/60 text-cyan-300 hover:bg-cyan-500/10"
            onClick={onImportLas}
          >
            <Upload className="w-3.5 h-3.5" /> Import LAS…
          </button>
          <button
            type="button"
            data-testid="wdm-open-manual"
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-xs rounded
              border border-slate-700 text-slate-300 hover:bg-slate-800"
            onClick={onAddWell}
          >
            <Plus className="w-3.5 h-3.5" /> Add well…
          </button>
        </div>
      </div>
      <div className="px-2.5 py-1 text-[11px] uppercase tracking-wider text-slate-500">
        Wells <span data-testid="wdm-well-count">{wells.length}</span>
        {total !== wells.length ? ` of ${total}` : ''}
      </div>
      <ScrollArea className="flex-1 min-h-0">
        {wells.map((w) => (
          <Row
            key={w.id}
            well={w}
            selected={w.id === selectedId}
            busy={w.id === busyId}
            onSelect={onSelect}
            onShareToggle={onShareToggle}
            onDelete={onDelete}
          />
        ))}
        {!wells.length && (
          <p className="px-3 py-2 text-xs text-slate-600 leading-snug">
            {total
              ? 'No well matches the search.'
              : 'No wells yet — import a LAS file or add a well manually. Org members\' shared wells appear here too.'}
          </p>
        )}
      </ScrollArea>
    </div>
  );
}
