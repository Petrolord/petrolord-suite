// Track layout builder (Petrophysics Studio PS4): templates in the
// right dock — pick, fork, rename, delete; add/remove/reorder tracks;
// per-track curves (source, color, range, style) and fills (crossover,
// threshold). Every edit routes through layoutSchema.updateTemplate so
// built-ins fork on first touch (clone-on-edit) and the controller
// owns the single layouts object. Persisted with the interpretation
// (petro_projects.layouts).

import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, ArrowUp, ArrowDown, Trash2, Plus } from 'lucide-react';
import {
  activeTemplate, updateTemplate, newId,
  INPUT_SOURCES, OUTPUT_SOURCES, THRESHOLD_PARAMS,
} from '../layout/layoutSchema';

const inputCls = 'rounded bg-slate-950 border border-slate-700 text-slate-200 px-1.5 py-0.5 text-xs w-full';
const miniCls = 'rounded bg-slate-950 border border-slate-700 text-slate-200 px-1 py-0.5 text-[11px]';
const SOURCES = [...INPUT_SOURCES, ...OUTPUT_SOURCES];
const numOr = (v, fallback) => (Number.isFinite(Number(v)) && v !== '' ? Number(v) : fallback);

export default function LayoutPanel({ layouts, onLayoutsChange, focusTrack, onStatus }) {
  const tpl = activeTemplate(layouts);
  const [openTrack, setOpenTrack] = useState(null); // track id

  useEffect(() => {
    if (focusTrack == null) return;
    const t = tpl.tracks[focusTrack.index];
    if (t) setOpenTrack(t.id);
  }, [focusTrack]); // eslint-disable-line react-hooks/exhaustive-deps

  const edit = (updater) => onLayoutsChange(updateTemplate(layouts, tpl.id, updater));
  const editTrack = (trackId, fn) => edit((t) => ({
    ...t,
    tracks: t.tracks.map((tr) => (tr.id === trackId ? fn(tr) : tr)),
  }));

  const setActive = (id) => onLayoutsChange({ ...layouts, activeTemplateId: id });

  const saveAs = () => {
    const name = window.prompt('Save template as:', `${tpl.name} copy`);
    if (!name || !name.trim()) return;
    const copy = { ...JSON.parse(JSON.stringify(tpl)), id: newId('tpl'), name: name.trim(), builtin: false };
    onLayoutsChange({ ...layouts, activeTemplateId: copy.id, templates: [...layouts.templates, copy] });
    onStatus(`Template saved as ${copy.name}.`);
  };

  const rename = () => {
    const name = window.prompt('Rename template:', tpl.name);
    if (!name || !name.trim()) return;
    edit((t) => ({ ...t, name: name.trim() }));
  };

  const remove = () => {
    if (!window.confirm(`Delete template "${tpl.name}"?`)) return;
    const rest = layouts.templates.filter((t) => t.id !== tpl.id);
    onLayoutsChange({ ...layouts, activeTemplateId: rest[0].id, templates: rest });
    onStatus('Template deleted.');
  };

  const moveTrack = (i, dir) => edit((t) => {
    const tracks = [...t.tracks];
    const j = i + dir;
    if (j < 0 || j >= tracks.length) return t;
    [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
    return { ...t, tracks };
  });

  const addTrack = () => {
    const id = newId('trk');
    edit((t) => ({
      ...t,
      tracks: [...t.tracks, {
        id, title: 'New track', type: 'curves', width: 1, scale: 'linear', min: 0, max: 1, curves: [], fills: [],
      }],
    }));
    setOpenTrack(id);
  };

  return (
    <div className="p-2 space-y-1.5 text-xs border-t border-slate-800/60" data-testid="petro-layout">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">Track layout</div>
      <div className="flex items-center gap-1">
        <select
          className={inputCls}
          data-testid="petro-layout-template"
          value={tpl.id}
          onChange={(e) => setActive(e.target.value)}
        >
          {layouts.templates.map((t) => (
            <option key={t.id} value={t.id}>{t.name}{t.builtin ? ' (built-in)' : ''}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-1">
        <button type="button" data-testid="petro-layout-saveas"
          className="flex-1 px-1.5 py-0.5 rounded border border-cyan-700/60 text-cyan-300 hover:bg-cyan-500/10"
          onClick={saveAs}
        >
          Save as…
        </button>
        <button type="button" data-testid="petro-layout-rename" disabled={tpl.builtin}
          title={tpl.builtin ? 'Built-in templates fork when edited' : 'Rename this template'}
          className="flex-1 px-1.5 py-0.5 rounded border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
          onClick={rename}
        >
          Rename
        </button>
        <button type="button" data-testid="petro-layout-delete" disabled={tpl.builtin}
          className="flex-1 px-1.5 py-0.5 rounded border border-red-900/60 text-red-300 hover:bg-red-500/10 disabled:opacity-40"
          onClick={remove}
        >
          Delete
        </button>
      </div>
      {tpl.builtin && (
        <p className="text-[10px] text-slate-500">Built-in template. Any edit forks it into your own copy.</p>
      )}

      {tpl.tracks.map((tr, i) => (
        <div key={tr.id} className="rounded border border-slate-800" data-testid={`petro-layout-track-${tr.title}`}>
          <div className="flex items-center gap-1 px-1.5 py-1">
            <button type="button" className="text-slate-400"
              data-testid={`petro-layout-expand-${tr.title}`}
              onClick={() => setOpenTrack(openTrack === tr.id ? null : tr.id)}
            >
              {openTrack === tr.id ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>
            <span className="truncate text-slate-300">{tr.title}</span>
            <span className="text-slate-600 text-[10px]">{tr.type === 'strip' ? 'strip' : `${tr.curves.length} curve${tr.curves.length === 1 ? '' : 's'}`}</span>
            <div className="ml-auto flex items-center gap-0.5">
              <button type="button" title="Move up" className="text-slate-500 hover:text-slate-200" onClick={() => moveTrack(i, -1)}>
                <ArrowUp className="w-3 h-3" />
              </button>
              <button type="button" title="Move down" className="text-slate-500 hover:text-slate-200"
                data-testid={`petro-layout-down-${tr.title}`}
                onClick={() => moveTrack(i, 1)}
              >
                <ArrowDown className="w-3 h-3" />
              </button>
              <button type="button" title="Remove track" className="text-slate-500 hover:text-red-400"
                data-testid={`petro-layout-remove-${tr.title}`}
                onClick={() => edit((t) => ({ ...t, tracks: t.tracks.filter((x) => x.id !== tr.id) }))}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>

          {openTrack === tr.id && (
            <div className="px-1.5 pb-1.5 space-y-1 border-t border-slate-800/60 pt-1">
              <div className="grid grid-cols-2 gap-1">
                <label className="flex items-center gap-1">
                  <span className="text-slate-500 w-9">Title</span>
                  <input className={miniCls} style={{ width: '100%' }} value={tr.title}
                    data-testid="petro-layout-track-title"
                    onChange={(e) => editTrack(tr.id, (x) => ({ ...x, title: e.target.value }))} />
                </label>
                <label className="flex items-center gap-1">
                  <span className="text-slate-500 w-9">Width</span>
                  <input className={miniCls} style={{ width: '100%' }} value={String(tr.width ?? 1)}
                    onChange={(e) => editTrack(tr.id, (x) => ({ ...x, width: numOr(e.target.value, x.width) }))} />
                </label>
                {tr.type !== 'strip' && (
                  <>
                    <label className="flex items-center gap-1">
                      <span className="text-slate-500 w-9">Scale</span>
                      <select className={miniCls} style={{ width: '100%' }} value={tr.scale || 'linear'}
                        onChange={(e) => editTrack(tr.id, (x) => ({ ...x, scale: e.target.value }))}
                      >
                        <option value="linear">linear</option>
                        <option value="log">log</option>
                      </select>
                    </label>
                    <div className="flex items-center gap-1">
                      <span className="text-slate-500 w-9">Range</span>
                      <input className={miniCls} style={{ width: 52 }} value={String(tr.min)}
                        onChange={(e) => editTrack(tr.id, (x) => ({ ...x, min: numOr(e.target.value, x.min) }))} />
                      <input className={miniCls} style={{ width: 52 }} value={String(tr.max)}
                        onChange={(e) => editTrack(tr.id, (x) => ({ ...x, max: numOr(e.target.value, x.max) }))} />
                    </div>
                  </>
                )}
              </div>

              {tr.type !== 'strip' && (
                <>
                  <div className="text-[10px] text-slate-500 pt-0.5">Curves</div>
                  {tr.curves.map((c, ci) => (
                    <div key={`${tr.id}-c${ci}`} className="flex items-center gap-1">
                      <select className={miniCls} style={{ flex: 1 }} value={c.source}
                        data-testid={`petro-layout-curve-source-${ci}`}
                        onChange={(e) => editTrack(tr.id, (x) => ({
                          ...x, curves: x.curves.map((y, yi) => (yi === ci ? { ...y, source: e.target.value, label: e.target.value.split(':')[1] } : y)),
                        }))}
                      >
                        {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <input type="color" className="w-6 h-5 rounded border border-slate-700 bg-transparent" value={c.color || '#0891b2'}
                        title="Curve color"
                        onChange={(e) => editTrack(tr.id, (x) => ({
                          ...x, curves: x.curves.map((y, yi) => (yi === ci ? { ...y, color: e.target.value } : y)),
                        }))} />
                      <input className={miniCls} style={{ width: 44 }} placeholder="min" value={c.min ?? ''}
                        title="Curve min (overrides track)"
                        onChange={(e) => editTrack(tr.id, (x) => ({
                          ...x, curves: x.curves.map((y, yi) => (yi === ci ? { ...y, min: e.target.value === '' ? undefined : numOr(e.target.value, y.min) } : y)),
                        }))} />
                      <input className={miniCls} style={{ width: 44 }} placeholder="max" value={c.max ?? ''}
                        title="Curve max (overrides track)"
                        onChange={(e) => editTrack(tr.id, (x) => ({
                          ...x, curves: x.curves.map((y, yi) => (yi === ci ? { ...y, max: e.target.value === '' ? undefined : numOr(e.target.value, y.max) } : y)),
                        }))} />
                      <select className={miniCls} value={c.style || 'solid'}
                        title="Line style"
                        onChange={(e) => editTrack(tr.id, (x) => ({
                          ...x, curves: x.curves.map((y, yi) => (yi === ci ? { ...y, style: e.target.value } : y)),
                        }))}
                      >
                        <option value="solid">solid</option>
                        <option value="dash">dash</option>
                        <option value="dot">dot</option>
                      </select>
                      <button type="button" className="text-slate-500 hover:text-red-400" title="Remove curve"
                        onClick={() => editTrack(tr.id, (x) => ({ ...x, curves: x.curves.filter((_, yi) => yi !== ci) }))}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <button type="button" data-testid="petro-layout-add-curve"
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-700 text-slate-400 hover:bg-slate-800"
                    onClick={() => editTrack(tr.id, (x) => ({
                      ...x, curves: [...x.curves, { source: 'input:GR', label: 'GR', color: '#059669' }],
                    }))}
                  >
                    <Plus className="w-3 h-3" /> Curve
                  </button>

                  <div className="text-[10px] text-slate-500 pt-0.5">Fills</div>
                  {(tr.fills || []).map((f, fi) => (
                    <div key={`${tr.id}-f${fi}`} className="flex items-center gap-1 flex-wrap">
                      <select className={miniCls} value={f.mode}
                        onChange={(e) => editTrack(tr.id, (x) => ({
                          ...x,
                          fills: x.fills.map((y, yi) => (yi === fi
                            ? (e.target.value === 'crossover'
                              ? { mode: 'crossover', a: y.a, b: y.b || x.curves[0]?.source, positiveColor: '#fbbf24', negativeColor: '#64748b', opacity: 0.3 }
                              : { mode: 'threshold', a: y.a, threshold: { param: 'cutPhi' }, side: 'above', color: '#fde047', opacity: 0.25 })
                            : y)),
                        }))}
                      >
                        <option value="threshold">threshold</option>
                        <option value="crossover">crossover</option>
                      </select>
                      <select className={miniCls} value={f.a}
                        title="Curve A"
                        onChange={(e) => editTrack(tr.id, (x) => ({
                          ...x, fills: x.fills.map((y, yi) => (yi === fi ? { ...y, a: e.target.value } : y)),
                        }))}
                      >
                        {tr.curves.map((c) => <option key={c.source} value={c.source}>{c.source}</option>)}
                      </select>
                      {f.mode === 'crossover' ? (
                        <select className={miniCls} value={f.b}
                          title="Curve B"
                          onChange={(e) => editTrack(tr.id, (x) => ({
                            ...x, fills: x.fills.map((y, yi) => (yi === fi ? { ...y, b: e.target.value } : y)),
                          }))}
                        >
                          {tr.curves.map((c) => <option key={c.source} value={c.source}>{c.source}</option>)}
                        </select>
                      ) : (
                        <>
                          <select className={miniCls} value={f.threshold?.param ?? '__value'}
                            title="Threshold source"
                            onChange={(e) => editTrack(tr.id, (x) => ({
                              ...x,
                              fills: x.fills.map((y, yi) => (yi === fi
                                ? { ...y, threshold: e.target.value === '__value' ? { value: 0 } : { param: e.target.value } }
                                : y)),
                            }))}
                          >
                            {THRESHOLD_PARAMS.map((prm) => <option key={prm} value={prm}>{prm}</option>)}
                            <option value="__value">fixed value</option>
                          </select>
                          {f.threshold?.param == null && (
                            <input className={miniCls} style={{ width: 48 }} value={String(f.threshold?.value ?? 0)}
                              onChange={(e) => editTrack(tr.id, (x) => ({
                                ...x, fills: x.fills.map((y, yi) => (yi === fi ? { ...y, threshold: { value: numOr(e.target.value, 0) } } : y)),
                              }))} />
                          )}
                          <select className={miniCls} value={f.side || 'above'}
                            onChange={(e) => editTrack(tr.id, (x) => ({
                              ...x, fills: x.fills.map((y, yi) => (yi === fi ? { ...y, side: e.target.value } : y)),
                            }))}
                          >
                            <option value="above">above</option>
                            <option value="below">below</option>
                          </select>
                        </>
                      )}
                      <button type="button" className="text-slate-500 hover:text-red-400" title="Remove fill"
                        onClick={() => editTrack(tr.id, (x) => ({ ...x, fills: x.fills.filter((_, yi) => yi !== fi) }))}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <button type="button" data-testid="petro-layout-add-fill" disabled={!tr.curves.length}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-700 text-slate-400 hover:bg-slate-800 disabled:opacity-40"
                    onClick={() => editTrack(tr.id, (x) => ({
                      ...x,
                      fills: [...(x.fills || []), { mode: 'threshold', a: x.curves[0].source, threshold: { param: 'cutPhi' }, side: 'above', color: '#fde047', opacity: 0.25 }],
                    }))}
                  >
                    <Plus className="w-3 h-3" /> Fill
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      ))}

      <button type="button" data-testid="petro-layout-add-track"
        className="w-full flex items-center justify-center gap-1 px-2 py-1 rounded border border-slate-700 text-slate-300 hover:bg-slate-800"
        onClick={addTrack}
      >
        <Plus className="w-3.5 h-3.5" /> Add track
      </button>
    </div>
  );
}
