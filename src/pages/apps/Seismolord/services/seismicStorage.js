// Seismic storage constants, in their own import.meta-free module so
// services that need the bucket name stay parseable under babel-jest
// (ingestService's inline worker URL poisons everything that imports it).

export const SEISMIC_BUCKET = 'seismic';

// Per-user storage quota. This client check is the FRIENDLY layer: it
// fails a job up-front with a clear message before any upload work.
// The AUTHORITATIVE layer is server-side since migration
// 20260712120000_seismic_storage_quota.sql: the 'seismic' bucket's
// INSERT policy refuses new objects once the user's bucket footprint
// reaches the same 20 GiB (updates/deletes stay quota-free so an
// over-quota user can still save work and free space). Keep the two
// constants in lockstep.
export const STORAGE_QUOTA_BYTES = 20 * 1024 ** 3;   // 20 GiB
