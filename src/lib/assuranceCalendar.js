// ASSURANCE CALENDAR RE-EXPORT SHIM (ASC-0, 2026-09-18).
// The calendar rules every Assurance engine shares live in the vendored
// @petrolord/engines package (packages/engines/engines/assurance/calendar.js).
// The domain modules re-export parseDateOnly, daysUntil and
// toDateOnlyString, but not localDateOf (engines #212), which the Suite
// needs to print an instant's local calendar date. Never edit the vendored
// copy from the Suite; change it in the engines repo and vendor it.
export * from '../../packages/engines/engines/assurance/calendar.js';
