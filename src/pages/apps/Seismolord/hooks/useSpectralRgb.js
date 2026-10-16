// Spectral decomposition RGB blend for the Map window: three spectral
// decomposition volumes on the active volume's lattice shown as red
// (low frequency), green (middle) and blue (high), on the time slice and
// along a horizon.
//
// Each channel volume has its own brick source (opened like the co-render
// overlay), so the blend never aborts the primary's fetches. The time
// slice follows the Map's time index (debounced); a horizon is sampled in
// each channel volume at its picks. Ranges are a 2 to 98 percent clip per
// channel of what is shown, so each colour uses its full range.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { channelRange, blendRgb, dominantChannel } from '../engine/spectralBlend';
import { extractHorizonAmplitude } from '../engine/horizonAmplitude';
import { sameLattice } from '../engine/surveyGeometry';
import { isAborted } from '../sources/sliceSource';

export const RGB_CHANNEL_WORDS = ['Red', 'Green', 'Blue'];

/** The frequency of a spectral decomposition volume row, or null. */
export function spectralFreq(row) {
  if (!row || row.kind !== 'attribute' || row.attribute_params?.name !== 'spectral') return null;
  const f = Number(row.attribute_params?.params?.freqHz);
  return Number.isFinite(f) && f > 0 ? f : null;
}

/**
 * Spectral volumes that can blend with the active volume: same lattice,
 * ordered with the active volume's own children first, then by frequency.
 */
export function rgbCandidates(volumes, volume, manifest, isOpenable = () => true) {
  if (!volume || !manifest) return [];
  const pm = { geometry: manifest.geometry };
  return (volumes || [])
    .filter((v) => spectralFreq(v) != null && isOpenable(v)
      && v.survey_meta?.il && sameLattice(pm, { geometry: v.survey_meta }))
    .sort((a, b) => ((b.parent_volume_id === volume.id) - (a.parent_volume_id === volume.id))
      || spectralFreq(a) - spectralFreq(b));
}

/**
 * A low, middle and high pick from the candidates: the active volume's
 * own children first; three distinct frequencies spread across the range.
 * @returns {string[]|null} three ids, or null when fewer than three frequencies exist
 */
export function autoPickTriplet(candidates, volumeId) {
  const own = candidates.filter((c) => c.parent_volume_id === volumeId);
  const pool = own.length >= 3 ? own : candidates;
  const byFreq = new Map();
  for (const c of pool) { const f = spectralFreq(c); if (!byFreq.has(f)) byFreq.set(f, c); }
  const list = [...byFreq.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
  if (list.length < 3) return null;
  return [list[0], list[Math.floor((list.length - 1) / 2)], list[list.length - 1]].map((c) => c.id);
}

/** Blend three grids (or slices) into pixels with per-channel ranges. */
export function blendChannels(r, g, b, { lo = 0.02, hi = 0.98 } = {}) {
  const ranges = [r, g, b].map((c) => channelRange(c, { lo, hi }));
  const { pixels } = blendRgb(r, g, b, { ranges });
  return { pixels, ranges, dominant: dominantChannel(r, g, b, ranges) };
}

/**
 * @param {{volumes: Object[], volume: Object, manifest: Object, geom: Object,
 *   timeOn: boolean, timeIndex: number, openSource: (row: Object) => Promise<{source: Object, manifest: Object}>,
 *   isOpenable?: Function, onError?: (title: string, message: string) => void, debounceMs?: number}} p
 */
export default function useSpectralRgb({
  volumes, volume, manifest, geom, timeOn, timeIndex, openSource,
  isOpenable, onError, debounceMs = 150,
}) {
  const [ids, setIds] = useState([null, null, null]);
  const [ready, setReady] = useState([null, null, null]);   // {row, manifest} per channel
  const [slice, setSlice] = useState(null);
  const sourcesRef = useRef([null, null, null]);
  const reqRef = useRef(0);
  const errRef = useRef(onError);
  errRef.current = onError;

  const candidates = useMemo(
    () => rgbCandidates(volumes, volume, manifest, isOpenable),
    [volumes, volume, manifest, isOpenable],
  );

  const closeChannel = (c) => {
    sourcesRef.current[c]?.close?.();
    sourcesRef.current[c] = null;
  };

  const setChannel = useCallback(async (c, id) => {
    closeChannel(c);
    setIds((cur) => cur.map((x, k) => (k === c ? id || null : x)));
    setReady((cur) => cur.map((x, k) => (k === c ? null : x)));
    setSlice(null);
    if (!id) return;
    const row = (volumes || []).find((v) => v.id === id);
    if (!row) return;
    try {
      const { source, manifest: m } = await openSource(row);
      if (manifest && !sameLattice(manifest, m)) {
        source?.close?.();
        throw new Error('The volumes are not on the same survey lattice.');
      }
      sourcesRef.current[c] = source;
      setReady((cur) => cur.map((x, k) => (k === c ? { row, manifest: m } : x)));
    } catch (e) {
      errRef.current?.('RGB blend unavailable', e.message);
      setIds((cur) => cur.map((x, k) => (k === c ? null : x)));
    }
  }, [volumes, manifest, openSource]);

  const clear = useCallback(() => {
    for (let c = 0; c < 3; c++) closeChannel(c);
    setIds([null, null, null]);
    setReady([null, null, null]);
    setSlice(null);
  }, []);

  /** Pick a low, middle and high spectral volume; false when there are not three. */
  const autoPick = useCallback(async () => {
    const pick = autoPickTriplet(candidates, volume?.id);
    if (!pick) return false;
    await Promise.all(pick.map((id, c) => setChannel(c, id)));
    return true;
  }, [candidates, volume, setChannel]);

  // a volume switch drops the blend (the channels belong to the old lattice)
  useEffect(() => () => clear(), [volume?.id, clear]);

  const active = ready.every(Boolean);
  const info = useMemo(() => (active
    ? ready.map(({ row }) => ({ id: row.id, name: row.name, freqHz: spectralFreq(row) }))
    : null), [active, ready]);

  // time slice of the three channels at the Map's time index
  useEffect(() => {
    if (!active || !timeOn || !geom) { reqRef.current += 1; setSlice(null); return undefined; }
    const idx = Math.min(geom.ns - 1, Math.max(0, timeIndex || 0));
    const req = ++reqRef.current;
    const ac = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const parts = await Promise.all(sourcesRef.current.map((s) => s.getSlice(
          { orientation: 'time', index: idx, prefetch: false }, { signal: ac.signal },
        )));
        if (req !== reqRef.current) return;
        const [r, g, b] = parts.map((p) => p.data);
        const { pixels, ranges, dominant } = blendChannels(r, g, b);
        setSlice({
          r, g, b, pixels, ranges, dominant, width: parts[0].width, height: parts[0].height, index: idx,
          ms: (idx * manifest.geometry.dt_us) / 1000,
        });
      } catch (e) {
        if (!isAborted(e) && req === reqRef.current) errRef.current?.('RGB time slice failed', e.message);
      }
    }, debounceMs);
    return () => { clearTimeout(timer); ac.abort(); };
  }, [active, timeOn, geom, timeIndex, manifest, debounceMs]);

  /** A horizon's picks sampled in the three channel volumes, blended. */
  const horizon = useCallback(async (grid) => {
    if (!active || !geom) throw new Error('Choose three spectral decomposition volumes for the blend first.');
    const out = [];
    // one channel at a time: each walks its own brick columns
    for (const s of sourcesRef.current) {
      out.push(await extractHorizonAmplitude((i, j, k) => s.getBrick(i, j, k), geom, grid, { mode: 'value' }));
    }
    const [r, g, b] = out;
    return { r, g, b, ...blendChannels(r, g, b) };
  }, [active, geom]);

  return {
    candidates, ids, setChannel, autoPick, clear, active, info, slice, horizon,
  };
}
