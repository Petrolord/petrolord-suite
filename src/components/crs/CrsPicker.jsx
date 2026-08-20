import React, { useMemo, useState } from 'react';
import { Search, Plus, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { searchCatalog, catalogGet, crsDisplayName, validateCustomDefinition } from '@/lib/crs';
import { normalizeTag, LOCAL, UNKNOWN } from '@/lib/crs/tags';

/**
 * Searchable CRS picker over the curated catalog, with sentinel options
 * (local grid, unknown) and a paste box for custom proj4/WKT
 * definitions. Petrel habit honored: hints from the data file (the SEG-Y
 * textual header, a GeoJSON crs member) surface at the top, each quoting
 * the evidence line so the user can judge it.
 *
 * @param {Object} p
 * @param {?string} p.value current tag
 * @param {(tag: string, meta: {name: ?string, customDef?: Object}) => void} p.onChange
 *   customDef is set when the user pasted a new definition: the caller
 *   stores it via settingsService.addCustomDef and passes the returned
 *   CUSTOM tag back in as value
 * @param {Object} [p.customDefs] stored custom definitions for names
 * @param {{code: ?string, name: ?string, line: string, confidence: number}[]} [p.suggestions]
 * @param {boolean} [p.disabled]
 * @param {boolean} [p.allowSentinels=true] offer Local grid / Unknown
 */
export default function CrsPicker({
  value, onChange, customDefs = {}, suggestions = [], disabled, allowSentinels = true,
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteName, setPasteName] = useState('');
  const [pasteDef, setPasteDef] = useState('');
  const [pasteError, setPasteError] = useState(null);

  const tag = normalizeTag(value);
  const results = useMemo(() => searchCatalog(query).slice(0, 30), [query]);
  const codeSuggestions = suggestions.filter((s) => s.code);

  const pick = (t, name) => {
    setOpen(false);
    setQuery('');
    onChange(t, { name: name || null });
  };

  const submitPaste = () => {
    try {
      const def = validateCustomDefinition(pasteDef);
      setPasteError(null);
      setPasteOpen(false);
      onChange(null, {
        name: pasteName.trim() || 'Custom CRS',
        customDef: { name: pasteName.trim() || 'Custom CRS', proj4: def },
      });
      setPasteName('');
      setPasteDef('');
    } catch (e) {
      setPasteError(e.message);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="w-full rounded-md bg-slate-950 border border-slate-700 text-slate-200 p-2 text-sm text-left disabled:opacity-50"
      >
        {tag === UNKNOWN && !value ? 'Choose a coordinate reference system' : crsDisplayName(tag, customDefs)}
        {tag !== UNKNOWN || value ? <span className="ml-2 text-slate-500">{tag}</span> : null}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-slate-700 bg-slate-950 shadow-xl max-h-80 overflow-y-auto">
          <div className="p-2 sticky top-0 bg-slate-950 border-b border-slate-800">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-2.5 text-slate-500" />
              <Input
                autoFocus
                value={query}
                placeholder="Search name, EPSG code or region"
                className="pl-7 h-8 bg-slate-900 border-slate-700 text-slate-200 text-sm"
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>

          {codeSuggestions.length > 0 && !query && (
            <div className="border-b border-slate-800">
              <div className="px-3 pt-2 text-xs text-slate-500">Suggested by the file header (verify before trusting)</div>
              {codeSuggestions.map((s) => (
                <button
                  key={`hint-${s.code}`}
                  type="button"
                  className="w-full text-left px-3 py-1.5 hover:bg-slate-800 text-sm"
                  onClick={() => pick(s.code, s.name || catalogGet(s.code)?.name)}
                  title={s.line}
                >
                  <span className="text-cyan-300">{s.name || s.code}</span>
                  <span className="ml-2 text-slate-500">{s.code}</span>
                  <div className="text-xs text-slate-500 truncate">from: “{s.line}”</div>
                </button>
              ))}
            </div>
          )}

          {results.map((e) => (
            <button
              key={e.code}
              type="button"
              className="w-full text-left px-3 py-1.5 hover:bg-slate-800 text-sm flex items-center"
              onClick={() => pick(e.code, e.name)}
            >
              <span className="text-slate-200">{e.name}</span>
              <span className="ml-2 text-slate-500">{e.code}</span>
              <span className="ml-auto text-xs text-slate-600">{e.region}</span>
              {e.code === tag && <Check className="w-3.5 h-3.5 ml-2 text-emerald-400" />}
            </button>
          ))}
          {results.length === 0 && (
            <div className="px-3 py-2 text-sm text-slate-500">No catalog match. Paste a definition below.</div>
          )}

          <div className="border-t border-slate-800 p-2 space-y-1">
            {Object.entries(customDefs).map(([id, d]) => (
              <button
                key={id}
                type="button"
                className="w-full text-left px-1 py-1 hover:bg-slate-800 text-sm text-slate-300"
                onClick={() => pick(`CUSTOM:${id}`, d.name)}
              >
                {d.name} <span className="text-slate-500">custom</span>
              </button>
            ))}
            {allowSentinels && (
              <>
                <button
                  type="button"
                  className="w-full text-left px-1 py-1 hover:bg-slate-800 text-sm text-slate-400"
                  onClick={() => pick(LOCAL, 'Local grid')}
                >
                  Local engineering grid (no geodetic placement)
                </button>
                <button
                  type="button"
                  className="w-full text-left px-1 py-1 hover:bg-slate-800 text-sm text-amber-300"
                  onClick={() => pick(UNKNOWN, null)}
                >
                  I do not know the CRS (placement stays unverified)
                </button>
              </>
            )}
            <button
              type="button"
              className="w-full text-left px-1 py-1 hover:bg-slate-800 text-sm text-cyan-400 flex items-center"
              onClick={() => { setPasteOpen((o) => !o); }}
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Custom definition (proj4 or WKT)
            </button>
            {pasteOpen && (
              <div className="p-1 space-y-2">
                <Input
                  value={pasteName}
                  placeholder="Name (e.g. Field grid, NAD27 zone 14 variant)"
                  className="h-8 bg-slate-900 border-slate-700 text-slate-200 text-sm"
                  onChange={(e) => setPasteName(e.target.value)}
                />
                <textarea
                  value={pasteDef}
                  placeholder="+proj=tmerc +lat_0=... or PROJCS[...]"
                  rows={3}
                  className="w-full rounded-md bg-slate-900 border border-slate-700 text-slate-200 p-2 text-xs font-mono"
                  onChange={(e) => setPasteDef(e.target.value)}
                />
                {pasteError && <div className="text-xs text-red-400">{pasteError}</div>}
                <Button size="sm" onClick={submitPaste} className="bg-cyan-600 hover:bg-cyan-500 text-white">
                  Validate and use
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
