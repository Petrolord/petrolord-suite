// Organisation sharing of saved records: one implementation for every app.
// Rules: ./rules. Store: ./store. In-memory mirror of the database: ./memoryDb.
// React: ./useRecordSharing and src/components/recordSharing.

import { makeSharingStore } from './store';
import { supabaseTransport } from './supabaseTransport';

export * from './rules';
export { makeSharingStore, memoryTransport } from './store';
export { makeSharingDb } from './memoryDb';

let real = null;
/** The store over the signed-in user's Supabase session (one per page). */
export function supabaseSharingStore() {
  if (!real) real = makeSharingStore(supabaseTransport);
  return real;
}
