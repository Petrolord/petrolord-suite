// "Well projection distance" (tester feedback 2026-09-22): how far from a
// section, in metres, a well path and its tops still draw on it. null =
// the engine default of 1.5 lattice cells. Persisted per browser under a
// session snapshot key so named sessions carry it.

import { useCallback, useEffect, useState } from 'react';

export const WELL_PROJECTION_KEY = 'seismolord.wellProjection.v1';
export const MAX_PROJECTION_M = 100000;

/** Parse a typed distance: positive metres, or null for the default. */
export function parseProjectionM(value) {
  if (value === '' || value == null) return null;
  const v = Number(value);
  if (!Number.isFinite(v) || v <= 0) return null;
  return Math.min(v, MAX_PROJECTION_M);
}

const read = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(WELL_PROJECTION_KEY) || 'null');
    return parseProjectionM(raw?.distanceM);
  } catch {
    return null;
  }
};

/** @param {number} [epoch] bump to re-read after a session restore */
export default function useWellProjection(epoch = 0) {
  const [distanceM, setDistance] = useState(read);
  useEffect(() => { if (epoch) setDistance(read()); }, [epoch]);
  useEffect(() => {
    try {
      localStorage.setItem(WELL_PROJECTION_KEY, JSON.stringify({ distanceM }));
    } catch { /* private mode */ }
  }, [distanceM]);
  const setDistanceM = useCallback((v) => setDistance(parseProjectionM(v)), []);
  return { distanceM, setDistanceM };
}
