// Per-user daily cap on AI scan reads (AppUpgrade PETRO-U2-018, the PT7 cost
// note). The pure half, so jest can test it; index.ts does the I/O.
//
// No new table: each read is logged in dai_llm_calls (Data & AI D5 metering
// log, migrations 20260925200000 and 20260926120000) under function_name
// petro-scan-read, and a person's reads since 00:00 UTC that did not fail
// are counted before the model runs. The count and the insert are two
// statements (the D5 reserve RPC counts every function of an organization
// together, which would share this cap with the AI Evaluation helper), so
// two reads racing at the cap can both pass: a soft cap, stated as such.
// Where the metering log is missing the read still runs and the reply says
// the cap is not active, so the digitizer never breaks over metering.

/** Scan reads per person per UTC day. The client mirror SCAN_USER_DAILY_CAP must equal it. */
export const SCAN_USER_DAILY_CAP = 25;
export const SCAN_FUNCTION_NAME = 'petro-scan-read';

/** 00:00 UTC of the day `now` falls in, as an ISO string. */
export function utcDayStart(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

/** Whether one more read is allowed with `used` reads already today. */
export function capAllows(used: number, cap: number = SCAN_USER_DAILY_CAP): boolean {
  return Number.isFinite(used) && used < cap;
}

/** The 429 sentence. */
export function capMessage(used: number, cap: number = SCAN_USER_DAILY_CAP): string {
  return `You have used ${used} of your ${cap} scan reads for today (the count resets at 00:00 UTC). Calibrate this scan by hand, or read it tomorrow.`;
}
