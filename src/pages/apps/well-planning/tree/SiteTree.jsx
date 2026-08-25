// EDM-style workspace tree (WD1): Site > Wellbore > Design with status
// and share badges. Selection drives the whole workspace; context
// actions create/edit/delete entities and manage the design lifecycle.

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  ChevronRight, ChevronDown, MapPin, PlusCircle, MoreVertical,
  CircleDot, FileStack, Share2, Star, Pencil, Trash2, Import,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_DOT = {
  planning: 'bg-blue-500', drilling: 'bg-orange-500',
  completed: 'bg-slate-500', abandoned: 'bg-red-600',
};

const DesignBadge = ({ status }) => {
  const cls = {
    draft: 'text-slate-400 border-slate-600',
    definitive: 'text-lime-400 border-lime-600',
    archived: 'text-slate-600 border-slate-700 line-through',
  }[status] || 'text-slate-400 border-slate-600';
  return (
    <span className={cn('ml-auto shrink-0 rounded-full border px-1.5 text-[9px] uppercase tracking-wide', cls)}>
      {status}
    </span>
  );
};

const Row = ({ depth = 0, active, onClick, children }) => (
  <div
    role="button"
    tabIndex={0}
    onClick={onClick}
    onKeyDown={(e) => { if (e.key === 'Enter') onClick?.(); }}
    className={cn(
      'group flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors cursor-pointer',
      active ? 'bg-[#4CAF50]/10 text-[#4CAF50]' : 'text-slate-300 hover:bg-slate-800',
    )}
    style={{ paddingLeft: `${8 + depth * 14}px` }}
  >
    {children}
  </div>
);

const SiteTree = ({
  store, onNewSite, onEditSite, onDeleteSite, onShareSite,
  onNewWellbore, onEditWellbore, onDeleteWellbore,
  onNewDesign, onRenameDesign, onDeleteDesign, onSaveRevision, onSetDefinitive,
  onLegacyImport,
}) => {
  const {
    sites, wellbores, designs, selection,
    selectSite, selectWellbore, selectDesign, user,
  } = store;
  const [openSites, setOpenSites] = useState({});
  const [openWellbores, setOpenWellbores] = useState({});

  const toggleSite = (id) => setOpenSites((o) => ({ ...o, [id]: !o[id] }));
  const toggleWellbore = (id) => setOpenWellbores((o) => ({ ...o, [id]: !o[id] }));

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 items-center justify-between border-b border-slate-800 px-3">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Sites</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" title="Import legacy Well Planning data" onClick={onLegacyImport} className="h-6 w-6 text-slate-500 hover:text-white">
            <Import className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" title="New site" onClick={onNewSite} className="h-6 w-6 text-[#4CAF50]">
            <PlusCircle className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-0.5 p-2">
          {sites.length === 0 && (
            <div className="px-2 py-8 text-center text-xs text-slate-500">
              No sites yet. Create a site (pad) to start designing wells, or import your legacy Well Planning data.
            </div>
          )}
          {sites.map((s) => {
            const isOpen = openSites[s.id] ?? (selection.siteId === s.id);
            const shared = Boolean(s.organization_id);
            const own = s.user_id === user?.id;
            return (
              <div key={s.id}>
                <Row active={selection.siteId === s.id && !selection.wellboreId} onClick={() => { selectSite(s.id); if (!isOpen) toggleSite(s.id); }}>
                  <button type="button" onClick={(e) => { e.stopPropagation(); toggleSite(s.id); }} className="shrink-0 text-slate-500">
                    {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  </button>
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                  <span className="truncate font-medium">{s.name}</span>
                  {shared && <Share2 className="h-3 w-3 shrink-0 text-sky-400" title="Shared with your organization" />}
                  {own && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="ml-auto h-5 w-5 opacity-0 group-hover:opacity-100 text-slate-500">
                          <MoreVertical className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="bg-slate-800 border-slate-700 text-slate-200">
                        <DropdownMenuItem onClick={() => onNewWellbore(s)}><PlusCircle className="mr-2 h-3.5 w-3.5" /> New wellbore</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onEditSite(s)}><Pencil className="mr-2 h-3.5 w-3.5" /> Edit site</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onShareSite(s)}><Share2 className="mr-2 h-3.5 w-3.5" /> {shared ? 'Stop sharing' : 'Share with organization'}</DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-slate-700" />
                        <DropdownMenuItem onClick={() => onDeleteSite(s)} className="text-red-400"><Trash2 className="mr-2 h-3.5 w-3.5" /> Delete site</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </Row>

                {isOpen && selection.siteId === s.id && wellbores.map((w) => {
                  const wOpen = openWellbores[w.id] ?? (selection.wellboreId === w.id);
                  return (
                    <div key={w.id}>
                      <Row depth={1} active={selection.wellboreId === w.id && !selection.designId} onClick={() => { selectWellbore(s.id, w.id); if (!wOpen) toggleWellbore(w.id); }}>
                        <button type="button" onClick={(e) => { e.stopPropagation(); toggleWellbore(w.id); }} className="shrink-0 text-slate-500">
                          {wOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        </button>
                        <span className={cn('h-2 w-2 shrink-0 rounded-full', STATUS_DOT[w.status] || 'bg-slate-600')} />
                        <span className="truncate">{w.name}</span>
                        {w.parent_wellbore_id && <span className="shrink-0 text-[9px] text-slate-500">ST</span>}
                        {own && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="ml-auto h-5 w-5 opacity-0 group-hover:opacity-100 text-slate-500">
                                <MoreVertical className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="bg-slate-800 border-slate-700 text-slate-200">
                              <DropdownMenuItem onClick={() => onNewDesign(w)}><PlusCircle className="mr-2 h-3.5 w-3.5" /> New design</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onEditWellbore(w)}><Pencil className="mr-2 h-3.5 w-3.5" /> Edit wellbore</DropdownMenuItem>
                              <DropdownMenuSeparator className="bg-slate-700" />
                              <DropdownMenuItem onClick={() => onDeleteWellbore(w)} className="text-red-400"><Trash2 className="mr-2 h-3.5 w-3.5" /> Delete wellbore</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </Row>

                      {wOpen && selection.wellboreId === w.id && designs.map((d) => (
                        <Row key={d.id} depth={2} active={selection.designId === d.id} onClick={() => selectDesign(s.id, w.id, d.id)}>
                          {d.status === 'definitive'
                            ? <Star className="h-3 w-3 shrink-0 text-lime-400" />
                            : <FileStack className="h-3 w-3 shrink-0 text-slate-500" />}
                          <span className="truncate">{d.name} <span className="text-slate-500">r{d.revision}</span></span>
                          <DesignBadge status={d.status} />
                          {own && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100 text-slate-500">
                                  <MoreVertical className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent className="bg-slate-800 border-slate-700 text-slate-200">
                                {d.status !== 'definitive' && (
                                  <DropdownMenuItem onClick={() => onSetDefinitive(d)}><Star className="mr-2 h-3.5 w-3.5 text-lime-400" /> Set definitive</DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => onSaveRevision(d)}><FileStack className="mr-2 h-3.5 w-3.5" /> Duplicate as new revision</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onRenameDesign(d)}><Pencil className="mr-2 h-3.5 w-3.5" /> Rename</DropdownMenuItem>
                                <DropdownMenuSeparator className="bg-slate-700" />
                                <DropdownMenuItem onClick={() => onDeleteDesign(d)} className="text-red-400"><Trash2 className="mr-2 h-3.5 w-3.5" /> Delete design</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </Row>
                      ))}
                      {wOpen && selection.wellboreId === w.id && designs.length === 0 && (
                        <div className="py-1 pl-12 text-[10px] text-slate-600">No designs. Use the wellbore menu to add one.</div>
                      )}
                    </div>
                  );
                })}
                {isOpen && selection.siteId === s.id && wellbores.length === 0 && (
                  <div className="py-1 pl-9 text-[10px] text-slate-600">No wellbores yet.</div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
};

export default SiteTree;
