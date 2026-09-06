// Core photographs panel (Stratigraphy Studio ST1). ONE component, two
// hosts: the Well Data Manager Core tab and the Stratigraphy Studio Core
// view. Upload a JPEG, PNG or WebP with its top and base depth (5 MB per
// image, 200 MB per well, refused before upload), list the photos of the
// well shallow to deep with their depth span, edit depths and caption,
// delete, and a depth-registered strip that stacks the photos in
// proportion to their spans (the core column beside the logs).

import React, { useEffect, useMemo, useState } from 'react';
import { Upload, Trash2, Loader2, Save } from 'lucide-react';
import { CORE_IMAGE_MAX_BYTES } from '@/lib/stratRegistry';

const cellCls = 'bg-slate-950 border border-slate-700 rounded px-1 py-0.5 text-xs text-slate-100';
const btnCls = 'flex items-center gap-1 px-2 py-1 text-xs rounded border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40';

/** Read an image file's pixel size in the browser; null when it cannot be decoded. */
function imageSize(file) {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
      img.onerror = () => { resolve(null); URL.revokeObjectURL(url); };
      img.src = url;
    } catch (e) { resolve(null); }
  });
}

/**
 * @param {Object} p
 * @param {Object} p.well
 * @param {Array} p.images geo_wells_core_images rows of the well
 * @param {boolean} p.canEdit
 * @param {(file: File, meta: {top_md_m, base_md_m, caption, width, height}) => Promise<void>} p.onUpload
 * @param {(image: Object, patch: Object) => Promise<void>} p.onUpdate
 * @param {(image: Object) => Promise<void>} p.onDelete
 * @param {(image: Object) => Promise<string>} p.urlOf signed URL to display a photo
 * @param {(msg: string) => void} p.onStatus
 * @param {string} [p.testIdPrefix]
 */
export default function CoreImagesPanel({ well, images, canEdit = true, onUpload, onUpdate, onDelete, urlOf, onStatus, testIdPrefix = 'wdm-core' }) {
  const [file, setFile] = useState(null);
  const [top, setTop] = useState('');
  const [base, setBase] = useState('');
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [urls, setUrls] = useState({});
  const [edits, setEdits] = useState({});

  const sorted = useMemo(() => [...(images || [])].sort((a, b) => a.top_md_m - b.top_md_m), [images]);
  const used = useMemo(() => sorted.reduce((s, r) => s + (r.bytes || 0), 0), [sorted]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const next = {};
      for (const img of sorted) {
        if (urls[img.id]) { next[img.id] = urls[img.id]; continue; }
        try { next[img.id] = await urlOf(img); } catch (e) { next[img.id] = null; }
      }
      if (alive) setUrls(next);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted, urlOf]);

  const upload = async () => {
    setBusy(true);
    try {
      const size = file ? await imageSize(file) : null;
      await onUpload(file, { top_md_m: top, base_md_m: base, caption, width: size?.width || null, height: size?.height || null });
      onStatus?.(`Core photo added to ${well.name} (${top} to ${base} m).`);
      setFile(null); setTop(base); setBase(''); setCaption('');
    } catch (e) {
      onStatus?.(e.message);
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async (img) => {
    const e = edits[img.id];
    if (!e) return;
    try {
      await onUpdate(img, { top_md_m: e.top ?? img.top_md_m, base_md_m: e.base ?? img.base_md_m, caption: e.caption ?? img.caption });
      setEdits((m) => { const n = { ...m }; delete n[img.id]; return n; });
      onStatus?.('Core photo updated.');
    } catch (err) { onStatus?.(err.message); }
  };

  const remove = async (img) => {
    try { await onDelete(img); onStatus?.('Core photo removed.'); } catch (err) { onStatus?.(err.message); }
  };

  // depth-registered strip: photos stacked in proportion to their spans
  const strip = useMemo(() => {
    if (!sorted.length) return null;
    const lo = sorted[0].top_md_m; const hi = Math.max(...sorted.map((r) => r.base_md_m));
    const span = hi - lo || 1;
    return { lo, hi, span };
  }, [sorted]);

  return (
    <div className="space-y-3 text-xs" data-testid={`${testIdPrefix}-panel`}>
      {canEdit && (
        <div className="flex items-center gap-2 flex-wrap" data-testid={`${testIdPrefix}-upload-form`}>
          <input type="file" accept="image/jpeg,image/png,image/webp" className="text-slate-400 text-xs" data-testid={`${testIdPrefix}-file`}
            onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <label className="flex items-center gap-1 text-slate-400">Top (m) <input className={cellCls} style={{ width: 72 }} value={top} inputMode="decimal" onChange={(e) => setTop(e.target.value)} data-testid={`${testIdPrefix}-top`} /></label>
          <label className="flex items-center gap-1 text-slate-400">Base (m) <input className={cellCls} style={{ width: 72 }} value={base} inputMode="decimal" onChange={(e) => setBase(e.target.value)} data-testid={`${testIdPrefix}-base`} /></label>
          <input className={cellCls} style={{ width: 200 }} value={caption} placeholder="Caption (optional)" onChange={(e) => setCaption(e.target.value)} data-testid={`${testIdPrefix}-caption`} />
          <button type="button" className={btnCls} disabled={!file || busy} onClick={upload} data-testid={`${testIdPrefix}-upload`}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Add photo
          </button>
          <span className="text-slate-500">JPEG, PNG or WebP up to {CORE_IMAGE_MAX_BYTES / 1048576} MB; {(used / 1048576).toFixed(1)} of 200 MB used on this well.</span>
        </div>
      )}
      {!sorted.length ? (
        <div className="text-slate-500" data-testid={`${testIdPrefix}-empty`}>No core photos on {well?.name} yet.</div>
      ) : (
        <div className="flex gap-4 items-start">
          <div className="shrink-0 w-24" data-testid={`${testIdPrefix}-strip`} title="Depth-registered core strip">
            <div className="text-[10px] text-slate-500 mb-0.5">{strip.lo} m</div>
            <div className="relative bg-slate-950 border border-slate-800 rounded" style={{ height: 320 }}>
              {sorted.map((img) => {
                const y = ((img.top_md_m - strip.lo) / strip.span) * 320;
                const h = Math.max(2, ((img.base_md_m - img.top_md_m) / strip.span) * 320);
                return urls[img.id]
                  ? <img key={img.id} src={urls[img.id]} alt={img.caption || `${img.top_md_m} to ${img.base_md_m} m`} className="absolute left-0 right-0 object-cover w-full" style={{ top: y, height: h }} data-testid={`${testIdPrefix}-strip-img-${img.id}`} />
                  : <div key={img.id} className="absolute left-0 right-0 bg-slate-800" style={{ top: y, height: h }} />;
              })}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">{strip.hi} m</div>
          </div>
          <table className="text-xs">
            <thead>
              <tr>{['', 'Top (m)', 'Base (m)', 'Caption', 'Size', ''].map((h, i) => <th key={`${h}-${i}`} className="text-left font-medium text-slate-500 pr-3 pb-1">{h}</th>)}</tr>
            </thead>
            <tbody>
              {sorted.map((img) => {
                const e = edits[img.id] || {};
                return (
                  <tr key={img.id} data-testid={`${testIdPrefix}-row-${img.id}`} className="align-top">
                    <td className="pr-3 py-0.5">{urls[img.id] ? <img src={urls[img.id]} alt="" className="w-12 h-12 object-cover rounded border border-slate-800" /> : <div className="w-12 h-12 rounded bg-slate-800" />}</td>
                    <td className="pr-3 py-0.5"><input className={cellCls} style={{ width: 72 }} disabled={!canEdit} value={e.top ?? img.top_md_m} onChange={(ev) => setEdits((m) => ({ ...m, [img.id]: { ...m[img.id], top: ev.target.value } }))} /></td>
                    <td className="pr-3 py-0.5"><input className={cellCls} style={{ width: 72 }} disabled={!canEdit} value={e.base ?? img.base_md_m} onChange={(ev) => setEdits((m) => ({ ...m, [img.id]: { ...m[img.id], base: ev.target.value } }))} /></td>
                    <td className="pr-3 py-0.5"><input className={cellCls} style={{ width: 200 }} disabled={!canEdit} value={e.caption ?? (img.caption || '')} onChange={(ev) => setEdits((m) => ({ ...m, [img.id]: { ...m[img.id], caption: ev.target.value } }))} /></td>
                    <td className="pr-3 py-0.5 text-slate-500">{img.width && img.height ? `${img.width}×${img.height}, ` : ''}{((img.bytes || 0) / 1024).toFixed(0)} KB</td>
                    <td className="py-0.5 flex gap-1">
                      {canEdit && edits[img.id] && <button type="button" className={btnCls} onClick={() => saveEdit(img)} title="Save" data-testid={`${testIdPrefix}-save-${img.id}`}><Save className="w-3 h-3" /></button>}
                      {canEdit && <button type="button" className="text-slate-500 hover:text-red-400" onClick={() => remove(img)} title="Delete" data-testid={`${testIdPrefix}-del-${img.id}`}><Trash2 className="w-3 h-3" /></button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
