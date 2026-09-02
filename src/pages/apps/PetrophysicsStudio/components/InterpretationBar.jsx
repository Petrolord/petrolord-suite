// Named interpretations (Petrophysics Studio PS3, audit A2): the
// ribbon control for list/open/save-as/rename/delete over
// petro_projects. Presentational + thin async calls; the controller
// owns which interpretation is open and what gets saved into it.
// Prompts follow the digitizer's window.prompt precedent — a name is
// one string, not a form.

import React, { useState } from 'react';
import { FolderOpen, ChevronDown } from 'lucide-react';

export default function InterpretationBar({
  backend, projectId, projectName, onOpen, onSaveAs, onRenamed, onDeleted, onStatus,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [projects, setProjects] = useState([]);

  const toggleMenu = async () => {
    if (!menuOpen) {
      try {
        setProjects(await backend.listProjects());
      } catch (e) {
        onStatus(e.message);
        return;
      }
    }
    setMenuOpen((v) => !v);
  };

  const saveAs = async () => {
    const name = window.prompt('Save interpretation as:', projectName ? `${projectName} copy` : 'Interpretation 1');
    if (!name || !name.trim()) return;
    setMenuOpen(false);
    await onSaveAs(name.trim());
  };

  const rename = async () => {
    if (!projectId) return;
    const name = window.prompt('Rename interpretation:', projectName || '');
    if (!name || !name.trim()) return;
    setMenuOpen(false);
    try {
      const p = await backend.renameProject(projectId, name.trim());
      onRenamed(p);
      onStatus(`Renamed to ${p.name}.`);
    } catch (e) {
      onStatus(e.message);
    }
  };

  const remove = async () => {
    if (!projectId) return;
    if (!window.confirm(`Delete interpretation "${projectName}"? Published curves stay in the registry.`)) return;
    setMenuOpen(false);
    try {
      await backend.deleteProject(projectId);
      onDeleted();
      onStatus('Interpretation deleted.');
    } catch (e) {
      onStatus(e.message);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        data-testid="petro-interp"
        title="Interpretations: open, save as, rename, delete"
        className="flex items-center gap-1 px-2 py-1 text-xs rounded border
          border-slate-700 text-slate-300 hover:bg-slate-800 max-w-[180px]"
        onClick={toggleMenu}
      >
        <FolderOpen className="w-3.5 h-3.5 shrink-0 text-cyan-400" />
        <span className="truncate" data-testid="petro-interp-name">{projectName || 'Unsaved'}</span>
        <ChevronDown className="w-3 h-3 shrink-0" />
      </button>
      {menuOpen && (
        <div
          className="absolute z-30 mt-1 w-64 rounded border border-slate-700 bg-slate-900 shadow-xl text-xs"
          data-testid="petro-interp-menu"
        >
          <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
            Interpretations
          </div>
          <div className="max-h-48 overflow-auto">
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                data-testid={`petro-interp-open-${p.name}`}
                className={`w-full text-left px-2.5 py-1.5 hover:bg-slate-800 flex items-center gap-2
                  ${p.id === projectId ? 'text-cyan-300' : 'text-slate-300'}`}
                onClick={() => { setMenuOpen(false); onOpen(p.id); }}
              >
                <span className="truncate">{p.name}</span>
                {p.id === projectId && <span className="ml-auto text-[10px] text-slate-500">open</span>}
              </button>
            ))}
            {!projects.length && <p className="px-2.5 py-2 text-slate-500">No saved interpretations yet.</p>}
          </div>
          <div className="border-t border-slate-800 p-1 flex gap-1">
            <button type="button" data-testid="petro-interp-saveas"
              className="flex-1 px-2 py-1 rounded border border-cyan-700/60 text-cyan-300 hover:bg-cyan-500/10"
              onClick={saveAs}
            >
              Save as…
            </button>
            <button type="button" data-testid="petro-interp-rename" disabled={!projectId}
              className="flex-1 px-2 py-1 rounded border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
              onClick={rename}
            >
              Rename
            </button>
            <button type="button" data-testid="petro-interp-delete" disabled={!projectId}
              className="flex-1 px-2 py-1 rounded border border-red-900/60 text-red-300 hover:bg-red-500/10 disabled:opacity-40"
              onClick={remove}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
