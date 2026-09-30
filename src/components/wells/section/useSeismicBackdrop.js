// Seismic backdrop for a well section (Seismolord U2-002, WC-U2-017): the
// host picks a Seismolord volume, the backend reads a traverse through the
// section wells (read only), and CrossSection paints it between the
// columns. Optional backend methods: listSeismicVolumes() and
// loadSeismicBackdrop(volume, wells); without them there is no backdrop.

import { useEffect, useMemo, useRef, useState } from 'react';

export function describeBackdrop(bd) {
  if (!bd) return '';
  if (bd.error) return `Seismic backdrop: ${bd.error}${bd.skipped?.length ? ` Not on it: ${bd.skipped.map((s) => `${s.name} (${s.reason})`).join(', ')}.` : ''}`;
  const km = bd.stepM > 0 ? ` (${((bd.nTraces - 1) * bd.stepM / 1000).toFixed(2)} km)` : '';
  const off = bd.skipped?.length ? `; not on it: ${bd.skipped.map((s) => `${s.name} (${s.reason})`).join(', ')}` : '';
  return `Seismic backdrop from ${bd.volumeName} through ${bd.anchors.length} wells, ${bd.nTraces} traces${km}${off}. Read only.`;
}

/**
 * @param {Object} backend
 * @param {Array} sectionWells section order
 * @param {(msg: string) => void} [onStatus]
 */
export function useSeismicBackdrop(backend, sectionWells, onStatus = () => {}) {
  const can = typeof backend?.listSeismicVolumes === 'function' && typeof backend?.loadSeismicBackdrop === 'function';
  const [volumes, setVolumes] = useState([]);
  const [volumeId, setVolumeId] = useState(null);
  const [backdrop, setBackdrop] = useState(null);
  const [loading, setLoading] = useState(false);
  const reqRef = useRef(0);

  useEffect(() => {
    if (!can) return undefined;
    let live = true;
    backend.listSeismicVolumes().then((v) => { if (live) setVolumes(v || []); })
      .catch((e) => { if (live) onStatus(`Seismic volumes could not be listed: ${e.message}`); });
    return () => { live = false; };
  }, [backend, can]); // eslint-disable-line react-hooks/exhaustive-deps

  // the wells that shape the path: order and location only
  const wellKey = useMemo(() => JSON.stringify(sectionWells.map((w) => [w.id, w.surface_x, w.surface_y, w.crs || null])), [sectionWells]);

  useEffect(() => {
    const req = ++reqRef.current;
    if (!can || !volumeId) { setBackdrop(null); setLoading(false); return; }
    const vol = volumes.find((v) => v.id === volumeId);
    if (!vol) { setBackdrop(null); return; }
    const wells = JSON.parse(wellKey).map(([id, x, y, crs]) => ({
      id, name: sectionWells.find((w) => w.id === id)?.name || id, surface_x: x, surface_y: y, crs,
    }));
    setLoading(true);
    backend.loadSeismicBackdrop(vol, wells).then((bd) => {
      if (req !== reqRef.current) return;
      const out = bd?.error ? bd : { ...bd, volumeName: bd.volumeName || vol.name };
      setBackdrop(out.error ? null : out);
      onStatus(describeBackdrop(out));
    }).catch((e) => {
      if (req !== reqRef.current) return;
      setBackdrop(null);
      onStatus(`Seismic backdrop from ${vol.name} failed: ${e.message}`);
    }).finally(() => { if (req === reqRef.current) setLoading(false); });
  }, [can, volumeId, volumes, wellKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    can, volumes, volumeId, setVolumeId, backdrop, loading,
  };
}
