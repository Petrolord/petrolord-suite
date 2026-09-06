// Production surveillance analytics (P2, Production Surveillance
// Studio). THE MATH LIVES IN THE ENGINE, not here: this module is the
// Suite's door onto engines/production/surveillance.js, vendored at
// packages/engines and re-exported through ./engine/surveillance.js.
//
// It used to be a second implementation. The engine's copy was
// extracted from this one and then carried eleven of the owner's 4
// September decisions (items 19, 20, 21 and 74 to 80 in Wave 1, items
// 18, 73 and 79 in Wave 2), none of which reached a user while the
// studio imported the older copy from here. This file re-exports rather
// than reimplements so that cannot happen again.
//
// Units are the ledger convention throughout: liquids stb, gas Mscf,
// rates stb/d and Mscf/d, GOR scf/stb, watercut a 0-1 fraction. Dates
// are ISO yyyy-mm-dd read as UTC midnight. Nothing here reads the wall
// clock: every window anchors on the field's own latest ledger date,
// and `summarizeDeferments` takes its anchor as an argument.
//
// The decline overlays call the CANONICAL Arps engine
// (packages/engines/engines/dca/arps), which is the same module
// utils/declineCurve/dcaEngine re-exports; the engine's surveillance
// imports it directly. Nothing anywhere re-derives decline math.
export * from './engine/surveillance.js';
