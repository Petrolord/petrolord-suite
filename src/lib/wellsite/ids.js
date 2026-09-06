// Client-minted identifiers for the local-first record (plan section 4).
// UUID v4 from the platform; the device id is minted once per browser
// profile and rides on every row so the office can tell two laptops apart.

import { v4 as uuidv4 } from 'uuid';

export const newId = () => uuidv4();

const DEVICE_KEY = 'ws.device_id';
let cached = null;
export function deviceId(storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  if (cached) return cached;
  let id = null;
  try { id = storage?.getItem(DEVICE_KEY) || null; } catch { id = null; }
  if (!id) {
    id = uuidv4();
    try { storage?.setItem(DEVICE_KEY, id); } catch { /* private mode: a per-session id is fine */ }
  }
  cached = id;
  return id;
}
export function _resetDeviceId() { cached = null; }
