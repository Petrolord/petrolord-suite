// Suite Projects P1: the header switcher, "Client X › Project A".
// Renders NOTHING unless the user has more than the Default project or any
// client (useProject().showSwitcher), so screens of users who never create
// a project are unchanged. Placed in the app ribbons beside the module home
// link (ModuleHomeLink) and on the dashboard.

import React from 'react';
import { Link } from 'react-router-dom';
import { FolderKanban, Check, ChevronDown, Settings2 } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';
import { useToast } from '@/components/ui/use-toast';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuGroup,
} from '@/components/ui/dropdown-menu';

function Swatch({ colour }) {
  if (!colour) return null;
  return <span aria-hidden="true" className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colour }} />;
}

/**
 * @param {Object} p
 * @param {boolean} [p.withSeparator] draw the ribbon's "|" after the switcher
 * @param {string} [p.className]
 */
export default function ProjectSwitcher({ withSeparator = false, className = '' }) {
  const { showSwitcher, current, currentClient, groups, switchProject, label } = useProject();
  const { toast } = useToast();
  if (!showSwitcher || !current) return null;

  const pick = async (id) => {
    try { await switchProject(id); } catch (e) {
      toast({ variant: 'destructive', title: 'Could not switch project', description: e.message });
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            data-testid="project-switcher"
            title="Current project. Choose another client or project."
            className={`flex max-w-[16rem] items-center gap-1 rounded px-1 text-xs text-pl-muted hover:text-pl-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pl-focus ${className}`}
          >
            <FolderKanban className="h-3.5 w-3.5 shrink-0" />
            <Swatch colour={currentClient?.colour} />
            <span className="truncate" data-testid="project-switcher-label">{label}</span>
            <ChevronDown className="h-3 w-3 shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-[70vh] w-72 overflow-y-auto" data-testid="project-switcher-menu">
          {groups.filter((g) => g.projects.length).map((g) => (
            <DropdownMenuGroup key={g.client?.id || 'internal'}>
              <DropdownMenuLabel className="flex items-center gap-1.5 text-xs text-pl-muted">
                <Swatch colour={g.client?.colour} /> {g.label}
              </DropdownMenuLabel>
              {g.projects.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  data-testid={`project-option-${p.id}`}
                  onSelect={() => pick(p.id)}
                  className="flex items-center gap-2 pl-5 text-sm"
                >
                  <span className="flex-1 truncate">{p.name}{p.visibility === 'members' ? ' (members only)' : ''}</span>
                  {p.id === current.id && <Check className="h-3.5 w-3.5" aria-label="current project" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/dashboard/projects" data-testid="project-switcher-manage" className="flex items-center gap-2 text-sm">
              <Settings2 className="h-3.5 w-3.5" /> Clients and projects
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {withSeparator && <span className="select-none text-pl-border-strong" aria-hidden="true">|</span>}
    </>
  );
}
