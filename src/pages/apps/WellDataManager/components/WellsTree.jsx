// Wells explorer tree (the SeismicExplorer idiom, workstation-lite):
// search box, one row per well with an org/private badge, context menu
// with the owner-only actions. Presentational — state and persistence
// live in WellWorkstation.

import React from 'react';
import {
  CircleDot, Search, Building2, Lock, Loader2, Trash2, Share2, Upload, Plus, Package, PackageOpen, Files,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem,
  ContextMenuSeparator,
} from '@/components/ui/context-menu';
import { OpenInAppSubmenu } from '@/components/wells/OpenInAppMenu';
import { toDisp, unitText } from '../engine/displayUnits';

function Row({ well, selected, busy, appPaths, unit, onSelect, onShareToggle, onDelete }) {
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
        ${selected ? 'bg-pl-primary/10 text-pl-primary-text' : 'text-pl-text hover:bg-pl-sunken'}`}
      onClick={() => onSelect(well.id)}
      onKeyDown={(e) => { if (e.key === 'Enter') onSelect(well.id); }}
    >
      <CircleDot className="w-3.5 h-3.5 shrink-0 text-pl-muted" />
      <span className="truncate min-w-0">{well.name}</span>
      <span
        data-testid="wdm-well-badge"
        title={shared
          ? `Shared with the organization${well.is_own ? '' : ' (read-only for you)'}`
          : 'Private: only you can see this well'}
        className={`ml-1 shrink-0 inline-flex items-center gap-0.5 rounded px-1 text-[10px]
          ${shared ? 'bg-pl-primary/10 text-pl-primary-text' : 'bg-pl-sunken text-pl-muted'}`}
      >
        {shared ? <Building2 className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
        {shared ? 'org' : 'private'}
      </span>
      <span className="ml-auto shrink-0 pl-2 text-[11px] text-pl-muted whitespace-nowrap">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" />
          : (well.td_md_m ? `TD ${Math.round(toDisp(well.td_md_m, unit))} ${unitText(unit)}` : '')}
      </span>
    </div>
  );
  // every well can be opened in the other Geoscience apps (read-only
  // wells included); the owner actions stay owner-only
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <OpenInAppSubmenu wellIds={[well.id]} paths={appPaths} testIdPrefix="wdm-row" />
        {well.is_own && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => onShareToggle(well)}>
              <Share2 className="w-4 h-4 mr-2" />
              {shared ? 'Stop sharing with organization' : 'Share with organization'}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem className="text-pl-danger-text" onSelect={() => onDelete(well)}>
              <Trash2 className="w-4 h-4 mr-2" />
              Delete well…
            </ContextMenuItem>
          </>
        )}
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
  wells, total, search, onSearch, selectedId, busyId, appPaths, unit = 'm',
  onSelect, onShareToggle, onDelete, onImportLas, onAddWell, onExportPackage, onImportPackage, onBatchLas,
}) {
  return (
    <div className="h-full min-h-0 flex flex-col bg-pl-surface" data-testid="wdm-tree">
      <div className="p-1.5 border-b border-pl-border space-y-1.5">
        <div className="flex items-center gap-1">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-1.5 top-1.5 text-pl-muted" />
            <input
              data-testid="wdm-tree-search"
              className="w-full rounded-md bg-pl-surface border border-pl-border-strong text-pl-text
                pl-6 pr-1.5 py-1 text-xs"
              placeholder="Search wells…"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
            />
          </div>
          {onBatchLas && (
            <button
              type="button"
              data-testid="wdm-open-batch"
              title="Import many LAS files at once, each matched to a well by UWI or name"
              className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-pl-primary/60 text-pl-primary-text hover:bg-pl-primary/10 whitespace-nowrap"
              onClick={onBatchLas}
            >
              <Files className="w-3.5 h-3.5" /> Batch LAS…
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            data-testid="wdm-open-las"
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-xs rounded
              border border-pl-primary/60 text-pl-primary-text hover:bg-pl-primary/10"
            onClick={onImportLas}
          >
            <Upload className="w-3.5 h-3.5" /> Import LAS…
          </button>
          <button
            type="button"
            data-testid="wdm-open-manual"
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-xs rounded
              border border-pl-border text-pl-text hover:bg-pl-sunken"
            onClick={onAddWell}
          >
            <Plus className="w-3.5 h-3.5" /> Add well…
          </button>
          <button
            type="button"
            data-testid="wdm-open-package"
            title="Export the selected wells as a portable Petrolord Project Package (.pld)"
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-xs rounded
              border border-pl-border text-pl-text hover:bg-pl-sunken"
            onClick={onExportPackage}
          >
            <Package className="w-3.5 h-3.5" /> Export package
          </button>
          <button
            type="button"
            data-testid="wdm-open-import"
            title="Import a Petrolord Project Package (.pld) as an independent copy"
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-xs rounded
              border border-pl-border text-pl-text hover:bg-pl-sunken"
            onClick={onImportPackage}
          >
            <PackageOpen className="w-3.5 h-3.5" /> Import package
          </button>
        </div>
      </div>
      <div className="px-2.5 py-1 text-[11px] uppercase tracking-wider text-pl-muted">
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
            appPaths={appPaths}
            unit={unit}
            onSelect={onSelect}
            onShareToggle={onShareToggle}
            onDelete={onDelete}
          />
        ))}
        {!wells.length && (
          <p className="px-3 py-2 text-xs text-pl-muted leading-snug">
            {total
              ? 'No well matches the search.'
              : 'No wells yet. Import a LAS file or add a well manually. Org members\' shared wells appear here too.'}
          </p>
        )}
      </ScrollArea>
    </div>
  );
}
