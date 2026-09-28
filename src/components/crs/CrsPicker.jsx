import React, { useMemo, useState } from 'react';
import { Search, Plus, Check, ChevronRight, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CRS_CATALOG, catalogGet, crsDisplayName, validateCustomDefinition } from '@/lib/crs';
import { normalizeTag, LOCAL, UNKNOWN } from '@/lib/crs/tags';
import { browseGroups, searchResults, UTM_GROUP_KEY } from './crsBrowse';


/**
 * Searchable CRS picker over the curated catalog, with sentinel options
 * (local grid, unknown) and a paste box for custom proj4/WKT
 * definitions. Petrel habit honored: hints from the data file (the SEG-Y
 * textual header, a GeoJSON crs member) surface at the top, each quoting
 * the evidence line so the user can judge it.
 *
 * With an empty search the catalog is browsed by region (Nigeria first),
 * with the 120 WGS 84 / UTM zones folded into one group; a search lists
 * matches with their count (see crsBrowse.js).
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
  const [utmOpen, setUtmOpen] = useState(false);
  const searching = query.trim().length > 0;
  const results = useMemo(() => (searching ? searchResults(query) : null), [query, searching]);
  const groups = useMemo(() => browseGroups(), []);
  const codeSuggestions = suggestions.filter((s) => s.code);

  const pick = (t, name) => {
    setOpen(false);
    setQuery('');
    onChange(t, { name: name || null });
  };

  const renderRow = (e) => (
    <button
      key={e.code}
      type="button"
      className="w-full text-left px-3 py-1.5 hover:bg-pl-sunken text-sm flex items-center"
      onClick={() => pick(e.code, e.name)}
    >
      <span className="text-pl-text">{e.name}</span>
      <span className="ml-2 text-pl-muted">{e.code}</span>
      <span className="ml-auto text-xs text-pl-muted">{e.region}</span>
      {e.code === tag && <Check className="w-3.5 h-3.5 ml-2 text-pl-success-text" />}
    </button>
  );

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
        className="w-full rounded-md bg-pl-surface border border-pl-border-strong text-pl-text p-2 text-sm text-left disabled:opacity-50"
      >
        {tag === UNKNOWN && !value ? 'Choose a coordinate reference system' : crsDisplayName(tag, customDefs)}
        {tag !== UNKNOWN || value ? <span className="ml-2 text-pl-muted">{tag}</span> : null}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-pl-border-strong bg-pl-surface shadow-xl max-h-80 overflow-y-auto">
          <div className="p-2 sticky top-0 bg-pl-surface border-b border-pl-border">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-2.5 text-pl-muted" />
              <Input
                autoFocus
                value={query}
                placeholder="Search name, EPSG code or region"
                className="pl-7 h-8 bg-pl-sunken border-pl-border text-pl-text text-sm"
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>

          {codeSuggestions.length > 0 && !query && (
            <div className="border-b border-pl-border">
              <div className="px-3 pt-2 text-xs text-pl-muted">Suggested by the file header (verify before trusting)</div>
              {codeSuggestions.map((s) => (
                <button
                  key={`hint-${s.code}`}
                  type="button"
                  className="w-full text-left px-3 py-1.5 hover:bg-pl-sunken text-sm"
                  onClick={() => pick(s.code, s.name || catalogGet(s.code)?.name)}
                  title={s.line}
                >
                  <span className="text-pl-primary-text">{s.name || s.code}</span>
                  <span className="ml-2 text-pl-muted">{s.code}</span>
                  <div className="text-xs text-pl-muted truncate">from: “{s.line}”</div>
                </button>
              ))}
            </div>
          )}

          {searching ? (
            <div data-testid="crs-search-results">
              <div className="px-3 pt-2 pb-1 text-xs text-pl-muted">
                {results.total === 0 && 'No catalog match. Paste a definition below.'}
                {results.total > 0 && results.total <= results.entries.length
                  && `${results.total} ${results.total === 1 ? 'match' : 'matches'}`}
                {results.total > results.entries.length
                  && `Showing ${results.entries.length} of ${results.total} matches. Add words to narrow the search.`}
              </div>
              {results.entries.map((e) => renderRow(e))}
            </div>
          ) : (
            <div data-testid="crs-browse">
              <div className="px-3 pt-2 pb-1 text-xs text-pl-muted">
                {CRS_CATALOG.length} systems. Type to search by name, EPSG code or region.
              </div>
              {groups.map((g) => (
                <div key={g.key} data-testid={`crs-group-${g.key}`}>
                  {g.key === UTM_GROUP_KEY ? (
                    <button
                      type="button"
                      className="w-full text-left px-3 pt-2 pb-1 text-xs font-medium uppercase tracking-wide text-pl-muted hover:text-pl-text flex items-center"
                      onClick={() => setUtmOpen((o) => !o)}
                    >
                      {utmOpen ? <ChevronDown className="w-3 h-3 mr-1" /> : <ChevronRight className="w-3 h-3 mr-1" />}
                      {g.label}
                      <span className="ml-2 normal-case tracking-normal font-normal text-pl-muted">
                        {g.entries.length} zones{utmOpen ? '' : '. Open, or type a zone such as 32N'}
                      </span>
                    </button>
                  ) : (
                    <div className="px-3 pt-2 pb-1 text-xs font-medium uppercase tracking-wide text-pl-muted">{g.label}</div>
                  )}
                  {(g.key !== UTM_GROUP_KEY || utmOpen) && g.entries.map((e) => renderRow(e))}
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-pl-border p-2 space-y-1">
            {Object.entries(customDefs).map(([id, d]) => (
              <button
                key={id}
                type="button"
                className="w-full text-left px-1 py-1 hover:bg-pl-sunken text-sm text-pl-text"
                onClick={() => pick(`CUSTOM:${id}`, d.name)}
              >
                {d.name} <span className="text-pl-muted">custom</span>
              </button>
            ))}
            {allowSentinels && (
              <>
                <button
                  type="button"
                  className="w-full text-left px-1 py-1 hover:bg-pl-sunken text-sm text-pl-muted"
                  onClick={() => pick(LOCAL, 'Local grid')}
                >
                  Local engineering grid (no geodetic placement)
                </button>
                <button
                  type="button"
                  className="w-full text-left px-1 py-1 hover:bg-pl-sunken text-sm text-pl-warning-text"
                  onClick={() => pick(UNKNOWN, null)}
                >
                  I do not know the CRS (placement stays unverified)
                </button>
              </>
            )}
            <button
              type="button"
              className="w-full text-left px-1 py-1 hover:bg-pl-sunken text-sm text-pl-primary-text flex items-center"
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
                  className="h-8 bg-pl-sunken border-pl-border text-pl-text text-sm"
                  onChange={(e) => setPasteName(e.target.value)}
                />
                <textarea
                  value={pasteDef}
                  placeholder="+proj=tmerc +lat_0=... or PROJCS[...]"
                  rows={3}
                  className="w-full rounded-md bg-pl-sunken border border-pl-border text-pl-text p-2 text-xs font-mono"
                  onChange={(e) => setPasteDef(e.target.value)}
                />
                {pasteError && <div className="text-xs text-pl-danger-text">{pasteError}</div>}
                <Button size="sm" onClick={submitPaste} className="bg-pl-primary hover:bg-pl-primary-hover text-pl-primary-fg">
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
