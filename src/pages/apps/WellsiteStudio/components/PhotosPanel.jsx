// Photographs (spec section 22): from the camera, a microscope camera or
// a file, attached once to the well and, when chosen, a sample; the
// thumbnail and working image are made on the device and the depth,
// user and both times ride along. Everything shows from the local blob.

import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { fmtDepth } from '../services/units';
import { toRigLocal } from '@/lib/wellsite/time';

export default function PhotosPanel({ backend, well, photos, samples, sampleId = '', onSampleChange, unit, offsetMin, onChanged, onStatus, compact = false }) {
  const [caption, setCaption] = useState('');
  const [tags, setTags] = useState('');
  const [busy, setBusy] = useState(false);
  const [urls, setUrls] = useState({});
  const [large, setLarge] = useState(null);
  const fileRef = useRef(null);
  const sel = 'bg-slate-950 border border-slate-700 rounded px-1 py-0.5 text-xs text-slate-100';
  const local = (iso) => toRigLocal(Date.parse(iso), offsetMin).hhmm;

  useEffect(() => {
    let alive = true;
    (async () => {
      const next = {};
      for (const p of photos) next[p.id] = await backend.photoUrl(p, 'thumb');
      if (alive) setUrls(next);
    })();
    return () => { alive = false; };
  }, [photos, backend]);

  const onFiles = async (files) => {
    if (!files || !files.length) return;
    setBusy(true);
    try {
      for (const file of files) {
        const { row, warnings } = await backend.addPhoto(well.id, file, { sampleId: sampleId || null, caption: caption || null, tags: tags.split(',').map((t) => t.trim()).filter(Boolean) });
        onStatus?.(warnings && warnings.length ? warnings[0] : `Photo attached${row.sample_id ? ' to the sample' : ''}${Number.isFinite(row.md_calc_m) ? ` at ${fmtDepth(row.md_calc_m, unit)}` : ''}.`);
      }
      setCaption(''); setTags('');
      onChanged?.();
    } catch (e) { onStatus?.(e.message); } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  return (
    <div className={compact ? 'space-y-2' : 'p-4 space-y-4'} data-testid="ws-photos">
      {!compact && <h2 className="text-sm font-semibold text-slate-100">Photographs</h2>}
      <div className="flex items-end gap-2 flex-wrap">
        {onSampleChange && (
          <label className="text-[10px] text-slate-400">Sample<br />
            <select value={sampleId} onChange={(e) => onSampleChange(e.target.value)} data-testid="ws-photo-sample" className={sel}>
              <option value="">none, current depth</option>
              {[...samples].sort((a, b) => b.md_calc_m - a.md_calc_m).slice(0, 40).map((s) => <option key={s.id} value={s.id}>No {s.sample_no}, {fmtDepth(s.md_calc_m, unit)}</option>)}
            </select>
          </label>
        )}
        <label className="text-[10px] text-slate-400">Caption<br /><input value={caption} onChange={(e) => setCaption(e.target.value)} data-testid="ws-photo-caption" className={`${sel} w-48`} /></label>
        <label className="text-[10px] text-slate-400">Tags (comma separated)<br /><input value={tags} onChange={(e) => setTags(e.target.value)} data-testid="ws-photo-tags" className={`${sel} w-40`} /></label>
        <input ref={fileRef} type="file" accept="image/*" multiple capture="environment" onChange={(e) => onFiles(Array.from(e.target.files || []))} data-testid="ws-photo-file" className="text-xs text-slate-400" disabled={busy} />
        <Button size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current && fileRef.current.click()} data-testid="ws-photo-pick">{busy ? 'Working' : 'Add photo'}</Button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2" data-testid="ws-photo-grid">
        {[...photos].reverse().map((p) => {
          const smp = samples.find((s) => s.id === p.sample_id);
          return (
            <button type="button" key={p.id} data-testid={`ws-photo-${p.id}`} data-upload={p.upload_state || 'local'} onClick={async () => setLarge({ photo: p, url: await backend.photoUrl(p, 'working') })}
              className="text-left rounded border border-slate-800 bg-slate-900/60 overflow-hidden">
              {urls[p.id] ? <img src={urls[p.id]} alt={p.caption || 'photo'} className="w-full h-24 object-cover" /> : <div className="w-full h-24 bg-slate-800" />}
              <div className="px-1.5 py-1 text-[10px] text-slate-400">
                <div className="text-slate-200 truncate">{p.caption || (smp ? `Sample ${smp.sample_no}` : 'Photo')}</div>
                <div>{local(p.captured_at)}{Number.isFinite(p.md_calc_m) ? `, ${fmtDepth(p.md_calc_m, unit)}` : ''}{smp ? `, No ${smp.sample_no}` : ''}</div>
                <div>{Math.round((p.variants.working.bytes + p.variants.thumb.bytes) / 1024)} KB{p.variants.original ? ' + original' : ''}, {p.upload_state === 'complete' ? 'backed up' : 'on this device'}</div>
              </div>
            </button>
          );
        })}
      </div>
      {photos.length === 0 && <div className="text-xs text-slate-500" data-testid="ws-photos-empty">No photographs yet.</div>}
      {large && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={() => setLarge(null)} data-testid="ws-photo-large">
          <div className="max-w-4xl max-h-full p-4">
            {large.url ? <img src={large.url} alt={large.photo.caption || 'photo'} className="max-h-[80vh] max-w-full" /> : <div className="text-slate-300 text-sm">Working image not held on this device.</div>}
            <div className="text-xs text-slate-300 mt-2">{large.photo.caption || ''} {local(large.photo.captured_at)} {Number.isFinite(large.photo.md_calc_m) ? fmtDepth(large.photo.md_calc_m, unit) : ''}</div>
          </div>
        </div>
      )}
    </div>
  );
}
