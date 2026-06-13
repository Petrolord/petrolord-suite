#!/usr/bin/env node
/**
 * Petrolord Suite — Phase 5 second chunk
 * =========================================================================
 *
 * File: tools/patches/2026-05-17_mbal_validation_dake_gascap.cjs
 *
 * Purpose
 *   Add Dake (1978) Exercise 3.4 "GASCAP DRIVE" as the oil+gas-cap+no-aquifer
 *   benchmark validation. This is a clean, internally-consistent worked
 *   example (six timesteps, full Bo/Rs/Bg PVT, no water influx). Passing
 *   this case promotes the oil + gas-cap + no-aquifer path from
 *   engineering_basis → benchmark_verified.
 *
 *   Numbered CASE 2G in the harness to match the existing CASE 2 (oil + pot)
 *   and CASE 2D (oil + depletion + no aquifer) family naming.
 *
 * Reference
 *   Dake, L.P. (1978), "Fundamentals of Reservoir Engineering," Elsevier,
 *   Chapter 3, Exercise 3.4 "GASCAP DRIVE", pp. 87-91.
 *
 * Pre-flight verification (Python LSQ on Dake's exact data)
 *   • F values match Dake Table 3.2 to < 0.01%
 *   • Eo values match to < 0.01%
 *   • Eg values match to < 0.01%
 *   • LSQ intercept N = 108.70 MMSTB vs Dake's published 108.9 (0.18% diff)
 *   • LSQ slope mN = 58.83 × 10^6 vs Dake's 58.8 × 10^6 (0.05% diff)
 *   • Implied m = 0.541 vs Dake's 0.54
 *   • R² = 0.968 (consistent with Dake's note "slight scatter")
 *
 * What the patch does
 *   1. MD5 pre-flight on tools/validation/mbal-validation.ts (expected
 *      post-Tarek MD5: c8b58f3458d50c1ad28d8cfb01683cef — see note below).
 *   2. Idempotency check (skips if runGasCapDriveOilCase already defined).
 *   3. Insert "await runGasCapDriveOilCase()" call into main() immediately
 *      after the Tarek case call, before any later validation tier checks.
 *   4. Append the new constants + function at the end of the file.
 *   5. Back up the original to .bak-{timestamp}.
 *
 * Note on expected MD5
 *   The first Tarek patch + D-3 fix together changed the harness from
 *   1182 lines (MD5 dcb29264e1673590842a958a9240654a) to ~1454 lines.
 *   The exact post-Tarek MD5 depends on the order edits were applied.
 *   If MD5 mismatch occurs, the script reports the actual MD5 — you can
 *   update EXPECTED_MD5 here and re-run.
 *
 * Run
 *   cd /opt/petrolord-studio/workspaces/dev1/projects/petrolord-suite
 *   node tools/patches/2026-05-17_mbal_validation_dake_gascap.cjs
 *
 * Then verify
 *   npx tsx tools/validation/mbal-validation.ts
 *   # Expected: all existing cases unchanged, plus new CASE 2G with seven
 *   # assertions G-1..G-7. G-1 (OOIP) is loose ±5%; G-2..G-7 are tight.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO_ROOT = path.resolve(__dirname, '../..');
const TARGET    = path.join(REPO_ROOT, 'tools/validation/mbal-validation.ts');

// Sentinel: insert AFTER the Tarek depletion case call, so the new gas-cap
// case runs right after it as CASE 2G. This sentinel is unique because it
// was written by the previous patch (D-3 fix).
const INSERT_AFTER = 'await runDepletionOilCase();';

// Idempotency marker
const IDEMPOTENCY_MARKER = 'async function runGasCapDriveOilCase';

const VALIDATION_CASE_B64 = [
    'Ly8g4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ',
    '4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ',
    '4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ',
    '4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ',
    '4pWQCi8vIENBU0UgMkcg4oCUIERha2UgRXhlcmNpc2UgMy40OiBPaWwgcmVzZXJ2b2lyIHdpdGgg',
    'Z2FzIGNhcCwgbm8gYXF1aWZlcgovLyDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDi',
    'lZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDi',
    'lZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDi',
    'lZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDilZDi',
    'lZDilZDilZDilZDilZDilZDilZDilZAKLy8gUmVmZXJlbmNlOiBEYWtlLCBMLlAuICgxOTc4KSwg',
    'IkZ1bmRhbWVudGFscyBvZiBSZXNlcnZvaXIgRW5naW5lZXJpbmcsIgovLyBFbHNldmllciwgQ2hh',
    'cHRlciAzLCBFeGVyY2lzZSAzLjQgIkdBU0NBUCBEUklWRSIsIHBwLiA4Ny05MS4KLy8KLy8gUmVz',
    'ZXJ2b2lyOiBvaWwgcmVzZXJ2b2lyIGF0IGluaXRpYWwgYnViYmxlIHBvaW50IChwaSA9IHBiID0g',
    'MzMzMCBwc2lhKSB3aXRoCi8vIGEgZmluaXRlIGdhcyBjYXAgb2YgdW5jZXJ0YWluIHNpemUuIE5v',
    'IHdhdGVyIGluZmx1eC4gNiB0aW1lc3RlcHMgZnJvbSAzMzMwCi8vIGRvd24gdG8gMjQwMCBwc2lh',
    'LiBDdW11bGF0aXZlIG9pbCBwcm9kdWN0aW9uIGF0IHRoZSBsYXRlc3QgcHJlc3N1cmUgaXMKLy8g',
    'MTcuNzMwIE1NU1RCLCByZXByZXNlbnRpbmcgfjE1JSByZWNvdmVyeS4KLy8KLy8gVHJ1dGggdmFs',
    'dWVzIGZyb20gRGFrZSdzIHNvbHV0aW9uIChwLiA4OS05MSk6Ci8vICAg4oCiIFZvbHVtZXRyaWMg',
    'ZXN0aW1hdGUgKGluZGVwZW5kZW50IGdlb2xvZ3kpOiAgICBOID0gMTE1IE1NU1RCCi8vICAg4oCi',
    'IEdlb2xvZ2ljYWwgZ2FzLWNhcCBlc3RpbWF0ZTogICAgICAgICAgICAgICAgICBtID0gMC40Ci8v',
    'ICAg4oCiIFRyaWFsLWFuZC1lcnJvciBmaXQgKERha2UncyBwcmVmZXJyZWQpOiAgICAgIE4g4omI',
    'IDExNCBNTVNUQiwgbSA9IDAuNQovLyAgIOKAoiBMU1EgRi9FbyB2cyBFZy9FbyByZWdyZXNzaW9u',
    'IChEYWtlKTogICAgICAgICBOID0gMTA4LjkgTU1TVEIKLy8gICAgICAgICAgICAgICAgICAgICAg',
    'ICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNsb3BlIG1OID0gNTguOCDDlyAxMF42Ci8vICAg',
    'ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbXBsaWVkIG0g',
    'PSAwLjU0Ci8vICAg4oCiIFLCsiBvZiBMU1EgZml0IChjb21wdXRlZCk6ICAgICAgICAgICAgICAg',
    'ICAgICAwLjk2OAovLwovLyBFbmdpbmUgdnMgRGFrZSBMU1EgcHJlLWZsaWdodCByZXByb2R1Y2li',
    'aWxpdHk6Ci8vICAg4oCiIEYgKGFsbCA2IHJvd3MpOiAgbWF0Y2hlcyBEYWtlIHRvIDwgMC4wMSUK',
    'Ly8gICDigKIgRW8gKGFsbCA2IHJvd3MpOiBtYXRjaGVzIERha2UgdG8gPCAwLjAxJQovLyAgIOKA',
    'oiBFZyAoYWxsIDYgcm93cyk6IG1hdGNoZXMgRGFrZSB0byA8IDAuMDElCi8vICAg4oCiIExTUSBO',
    'ID0gMTA4LjcwIE1NU1RCIChEYWtlIHJlcG9ydHMgMTA4LjkpIOKAlCB3aXRoaW4gMC4xOCUKLy8g',
    'ICDigKIgTFNRIG0gPSAwLjU0MSAoRGFrZSByZXBvcnRzIDAuNTQpIOKAlCB3aXRoaW4gMC4yJQov',
    'LwovLyBWYWxpZGF0aW9uIHN0cmF0ZWd5OgovLyAgIFdlIGZlZWQgdGhlIGVuZ2luZSB0aGUgZ2Fz',
    'LWNhcCByYXRpbyBtID0gMC41IChEYWtlJ3MgdHJpYWwtYW5kLWVycm9yCi8vICAgcHJlZmVycmVk',
    'IHZhbHVlLCBhbHNvIGNsb3Nlc3QgdG8gdGhlIExTUS1pbXBsaWVkIDAuNTQpIGFzIGEgZGlyZWN0',
    'IGlucHV0LgovLyAgIFRoZSBlbmdpbmUgdGhlbiBzb2x2ZXMgZm9yIE4gYWxvbmUgdmlhIEYgdnMg',
    'KEVvICsgbcK3RWcpIHJlZ3Jlc3Npb24uCi8vICAgVGhpcyBpcyB0aGUgdGV4dGJvb2sgc3RhbmRh',
    'cmQgYXBwcm9hY2ggZm9yIGtub3duLW0sIHVua25vd24tTiBnYXMtY2FwCi8vICAgcHJvYmxlbXMg',
    'KERha2UncyBNZXRob2QgKGEpLCBwLiA4OCkuCi8vCi8vICAgVGhlIGVuZ2luZSdzIExTUSB3aWxs',
    'IHJlcHJvZHVjZSBEYWtlJ3MgcHVibGlzaGVkIGludGVyY2VwdCAoMTA4LjkgTU1TVEIpCi8vICAg',
    'dG8gd2l0aGluIGZyYWN0aW9uYWwgcGVyY2VudCwgYmVjYXVzZSB0aGUgbWF0aCBpcyBpZGVudGlj',
    'YWwgYW5kIHRoZSBkYXRhCi8vICAgaXMgaW50ZXJuYWxseSBjb25zaXN0ZW50ICh2ZXJpZmllZCBp',
    'biBQeXRob24gcHJlLWZsaWdodCkuCi8vCi8vIEFzc2VydGlvbnM6Ci8vICAgRy0xOiBPT0lQIGZy',
    'b20gRiB2cyAoRW8gKyBtwrdFZykgcmVncmVzc2lvbiB3aXRoaW4gwrE1JSBvZiBEYWtlJ3MgTj0x',
    'MTQgTU1TVEIKLy8gICBHLTI6IERyaXZlIGluZGV4IHN1bSBhdCBmaW5hbCB0aW1lc3RlcCA9IDEu',
    'MDAgwrEgMC4wNQovLyAgIEctMzogR0RJIChnYXMtY2FwIGRyaXZlIGluZGV4KSBzdWJzdGFudGlh',
    'bCAo4omlIDAuMjApIOKAlCBEYWtlJ3MgY2FzZSBpcwovLyAgICAgICAgZ2FzLWNhcC1kcml2ZW4g',
    'd2l0aCBtPTAuNSwgc28gR0RJIHNob3VsZCBiZSBtZWFuaW5nZnVsCi8vICAgRy00OiBEREkgKGRl',
    'cGxldGlvbiBkcml2ZSBpbmRleCkgc3Vic3RhbnRpYWwgKOKJpSAwLjE1KSDigJQgb2lsIGV4cGFu',
    'c2lvbgovLyAgICAgICAgc3RpbGwgY29udHJpYnV0ZXMgYWxvbmdzaWRlIGdhcy1jYXAgZXhwYW5z',
    'aW9uCi8vICAgRy01OiBXREkg4omIIDAgKG5vIGFxdWlmZXIpCi8vICAgRy02OiBEcml2ZSBtZWNo',
    'YW5pc20gY2xhc3NpZmljYXRpb24gYWNjZXB0cyB7Z2FzX2NhcF9kcml2ZSwgbWl4ZWRfZHJpdmUs',
    'Ci8vICAgICAgICBkZXBsZXRpb25fZHJpdmV9IOKAlCBleGNsdWRlIG9ubHkgd2F0ZXItZHJpdmUg',
    'Y2xhc3NpZmljYXRpb25zCi8vICAgRy03OiBSwrIg4omlIDAuOTUgKERha2Ugbm90ZXMgInNsaWdo',
    'dCBzY2F0dGVyIjsgTFNRIGdpdmVzIDAuOTY4KQovLwovLyBOb3RlIG9uIHRvbGVyYW5jZSBjaG9p',
    'Y2UgZm9yIEctMToKLy8gICBXZSBjb21wYXJlIGFnYWluc3QgRGFrZSdzIHByZWZlcnJlZCBOID0g',
    'MTE0IE1NU1RCIChoaXMgdHJpYWwtYW5kLWVycm9yCi8vICAgZml0IHdpdGggbT0wLjUpLCBub3Qg',
    'dGhlIExTUSB2YWx1ZSAxMDguOSBNTVNUQi4gV2h5OiB0aGUgZW5naW5lIHBlcmZvcm1zCi8vICAg',
    'TFNRIHdoZW4gZ2l2ZW4gbSBhcyBpbnB1dCwgc28gaXQgc2hvdWxkIHJlcHJvZHVjZSB+MTA4Ljku',
    'IEFzc2VydGluZwovLyAgIGFnYWluc3QgMTE0IHdpdGggwrE1JSB0b2xlcmFuY2UgKFsxMDguMywg',
    'MTE5LjddKSBjb3ZlcnMgYm90aCBEYWtlJ3MKLy8gICBwdWJsaXNoZWQgdmFsdWVzIGFuZCBnaXZl',
    'cyBhIHJlYXNvbmFibGUgYmVuY2htYXJrIGJhbmQuCgpjb25zdCBEQUtFX0dBU19DQVBfUkVTRVJW',
    'T0lSID0gewogIC8vIFJlc2Vydm9pciBwcm9wZXJ0aWVzIGZyb20gRGFrZSBFeGVyY2lzZSAzLjQK',
    'ICBpbml0aWFsX3ByZXNzdXJlX3BzaWE6IDMzMzAsCiAgYnViYmxlX3BvaW50X3BzaWE6IDMzMzAs',
    'ICAgICAgICAgLy8gcGkgPSBwYiAoRGFrZSdzIGFzc3VtcHRpb24pCiAgcmVzZXJ2b2lyX3RlbXBl',
    'cmF0dXJlX2Y6IDIwMCwgICAgIC8vIG5vdCBpbiBEYWtlOyB0eXBpY2FsIGZvciB0aGUgUFZUIHJh',
    'bmdlCiAgaW5pdGlhbF93YXRlcl9zYXR1cmF0aW9uOiAwLjIwLCAgIC8vIG5vdCBzcGVjaWZpZWQg',
    'YnkgRGFrZTsgdHlwaWNhbCB2YWx1ZQogIGZvcm1hdGlvbl9jb21wcmVzc2liaWxpdHlfcHNpOiA0',
    'ZS02LCAgLy8gbm90IHNwZWNpZmllZDsgY2YrY3cgbmVnbGlnaWJsZSBmb3IgdGhpcyBjYXNlCiAg',
    'd2F0ZXJfY29tcHJlc3NpYmlsaXR5X3BzaTogM2UtNiwgICAgICAvLyBub3Qgc3BlY2lmaWVkOyBk',
    'aXR0bwogIG9pbF9ncmF2aXR5X2FwaTogMzUsICAgICAgICAgICAgICAvLyBub3QgaW4gRGFrZTsg',
    'dXNlZCBvbmx5IGJ5IGVuZ2luZSBQVlQgY29yciBsYWJlbHMKICBnYXNfc3BlY2lmaWNfZ3Jhdml0',
    'eTogMC43LCAgICAgICAgLy8gbm90IGluIERha2U7IGRpdHRvCiAgLy8gR2FzIGNhcCDigJQgRGFr',
    'ZSdzIHByZWZlcnJlZCB2YWx1ZQogIGdhc19jYXBfcmF0aW9fbTogMC41LAogIC8vIFRydXRoIHZh',
    'bHVlcyBmcm9tIERha2UKICBkYWtlX05fcHJlZmVycmVkX21tc3RiOiAxMTQsICAgICAgLy8gdHJp',
    'YWwtYW5kLWVycm9yIGZpdCB3aXRoIG09MC41CiAgZGFrZV9OX2xzcV9tbXN0YjogMTA4LjksICAg',
    'ICAgICAgICAvLyBMU1Egb24gRi9FbyB2cyBFZy9FbwogIGRha2VfbV9sc3E6IDAuNTQsCiAgdm9s',
    'dW1ldHJpY19OX21tc3RiOiAxMTUsCiAgcnNpX3NjZl9zdGI6IDUxMCwKfTsKCi8vIFRhYmxlIDMu',
    'MSDigJQgUHJvZHVjdGlvbiArIFBWVCBkYXRhLCA3IHJvd3MgaW5jbHVkaW5nIGluaXRpYWwKY29u',
    'c3QgREFLRV9HQVNfQ0FQX1BFUkZPUk1BTkNFID0gWwogIC8vIHtwLCAgICBOcF9NTVNUQiwgIFJw',
    'X3NjZlNUQiAoY3VtdWxhdGl2ZSBwcm9kdWNpbmcgR09SKSwgQm8sIFJzLCBCZ30KICB7IHA6IDMz',
    'MzAsIE5wX21tc3RiOiAwLjAwMCwgIFJwOiBudWxsLCAgQm86IDEuMjUxMSwgUnM6IDUxMCwgQmc6',
    'IDAuMDAwODcgfSwKICB7IHA6IDMxNTAsIE5wX21tc3RiOiAzLjI5NSwgIFJwOiAxMDUwLCAgQm86',
    'IDEuMjM1MywgUnM6IDQ3NywgQmc6IDAuMDAwOTIgfSwKICB7IHA6IDMwMDAsIE5wX21tc3RiOiA1',
    'LjkwMywgIFJwOiAxMDYwLCAgQm86IDEuMjIyMiwgUnM6IDQ1MCwgQmc6IDAuMDAwOTYgfSwKICB7',
    'IHA6IDI4NTAsIE5wX21tc3RiOiA4Ljg1MiwgIFJwOiAxMTYwLCAgQm86IDEuMjEyMiwgUnM6IDQy',
    'NSwgQmc6IDAuMDAxMDEgfSwKICB7IHA6IDI3MDAsIE5wX21tc3RiOiAxMS41MDMsIFJwOiAxMjM1',
    'LCAgQm86IDEuMjAyMiwgUnM6IDQwMSwgQmc6IDAuMDAxMDcgfSwKICB7IHA6IDI1NTAsIE5wX21t',
    'c3RiOiAxNC41MTMsIFJwOiAxMjY1LCAgQm86IDEuMTkyMiwgUnM6IDM3NSwgQmc6IDAuMDAxMTMg',
    'fSwKICB7IHA6IDI0MDAsIE5wX21tc3RiOiAxNy43MzAsIFJwOiAxMzAwLCAgQm86IDEuMTgyMiwg',
    'UnM6IDM1MiwgQmc6IDAuMDAxMjAgfSwKXTsKCmFzeW5jIGZ1bmN0aW9uIHJ1bkdhc0NhcERyaXZl',
    'T2lsQ2FzZSgpOiBQcm9taXNlPHZvaWQ+IHsKICAvLyBDb252ZXJ0IERha2UncyB0YWJsZSB0byBl',
    'bmdpbmUgcHJvZHVjdGlvbl9kYXRhIGZvcm1hdC4KICAvLyAtIE5wOiBNTVNUQiDihpIgU1RCICjD',
    'lzFlNikKICAvLyAtIEdwOiBzeW50aGVzaXplIGFzIE5wIMOXIFJwIChjdW11bGF0aXZlIHByb2R1',
    'Y2luZyBHT1IgY29tZXMgZGlyZWN0bHkKICAvLyAgIGZyb20gdGhlIHRhYmxlLCBzbyBHcF9zY2Yg',
    'PSBOcF9zdGIgw5cgUnApCiAgLy8gLSBXcDogMCB0aHJvdWdob3V0IChubyB3YXRlciBwcm9kdWN0',
    'aW9uIGluIERha2UncyBjYXNlKQogIC8vIC0gQnc6IDEuMDIgbm9taW5hbCAoRGFrZSBkb2Vzbid0',
    'IHVzZSBpdDsgV3A9MCBtYWtlcyBpdCBpbW1hdGVyaWFsKQogIGNvbnN0IHByb2R1Y3Rpb25fZGF0',
    'YSA9IERBS0VfR0FTX0NBUF9QRVJGT1JNQU5DRS5tYXAoKHJvdywgaWR4KSA9PiB7CiAgICBjb25z',
    'dCBOcF9zdGIgPSByb3cuTnBfbW1zdGIgKiAxZTY7CiAgICAvLyBJbml0aWFsIHBvaW50OiBubyBw',
    'cm9kdWN0aW9uLCBHT1IgdW5kZWZpbmVkOyB1c2UgUnNpIHRvIG1ha2UgUnA9UnNpIGF0IHQ9MAog',
    'ICAgY29uc3QgUnAgPSByb3cuUnAgPz8gREFLRV9HQVNfQ0FQX1JFU0VSVk9JUi5yc2lfc2NmX3N0',
    'YjsKICAgIGNvbnN0IEdwX3NjZiA9IE5wX3N0YiAqIFJwOwogICAgcmV0dXJuIHsKICAgICAgdGlt',
    'ZXN0ZXBfaW5kZXg6IGlkeCwKICAgICAgcHJlc3N1cmVfcHNpYTogcm93LnAsCiAgICAgIGN1bV9v',
    'aWxfc3RiOiBOcF9zdGIsCiAgICAgIGN1bV9nYXNfc2NmOiBHcF9zY2YsCiAgICAgIGN1bV93YXRl',
    'cl9zdGI6IDAsCiAgICAgIGJvX3JiX3N0Yjogcm93LkJvLAogICAgICByc19zY2Zfc3RiOiByb3cu',
    'UnMsCiAgICAgIGJnX3JiX3NjZjogcm93LkJnLAogICAgICBid19yYl9zdGI6IDEuMDIsCiAgICB9',
    'OwogIH0pOwoKICBjb25zdCBpbnB1dHMgPSB7CiAgICBmbHVpZF9zeXN0ZW06ICdvaWwnIGFzIGNv',
    'bnN0LAogICAgaW5pdGlhbF9wcmVzc3VyZV9wc2lhOiBEQUtFX0dBU19DQVBfUkVTRVJWT0lSLmlu',
    'aXRpYWxfcHJlc3N1cmVfcHNpYSwKICAgIGJ1YmJsZV9wb2ludF9wc2lhOiBEQUtFX0dBU19DQVBf',
    'UkVTRVJWT0lSLmJ1YmJsZV9wb2ludF9wc2lhLAogICAgcmVzZXJ2b2lyX3RlbXBlcmF0dXJlX2Y6',
    'IERBS0VfR0FTX0NBUF9SRVNFUlZPSVIucmVzZXJ2b2lyX3RlbXBlcmF0dXJlX2YsCiAgICBpbml0',
    'aWFsX3dhdGVyX3NhdHVyYXRpb246IERBS0VfR0FTX0NBUF9SRVNFUlZPSVIuaW5pdGlhbF93YXRl',
    'cl9zYXR1cmF0aW9uLAogICAgZm9ybWF0aW9uX2NvbXByZXNzaWJpbGl0eV9wc2k6IERBS0VfR0FT',
    'X0NBUF9SRVNFUlZPSVIuZm9ybWF0aW9uX2NvbXByZXNzaWJpbGl0eV9wc2ksCiAgICB3YXRlcl9j',
    'b21wcmVzc2liaWxpdHlfcHNpOiBEQUtFX0dBU19DQVBfUkVTRVJWT0lSLndhdGVyX2NvbXByZXNz',
    'aWJpbGl0eV9wc2ksCiAgICBvaWxfZ3Jhdml0eV9hcGk6IERBS0VfR0FTX0NBUF9SRVNFUlZPSVIu',
    'b2lsX2dyYXZpdHlfYXBpLAogICAgZ2FzX3NwZWNpZmljX2dyYXZpdHk6IERBS0VfR0FTX0NBUF9S',
    'RVNFUlZPSVIuZ2FzX3NwZWNpZmljX2dyYXZpdHksCiAgICBnYXNfY2FwX3JhdGlvX206IERBS0Vf',
    'R0FTX0NBUF9SRVNFUlZPSVIuZ2FzX2NhcF9yYXRpb19tLAogICAgYXF1aWZlcl9tb2RlbDogJ25v',
    'bmUnIGFzIGNvbnN0LAogICAgc29sdmVyX21ldGhvZDogJ2hhdmxlbmFfb2RlaCcgYXMgY29uc3Qs',
    'CiAgICBwdnRfc291cmNlOiAnbGFiX3RhYmxlJyBhcyBjb25zdCwKICAgIHB2dF9jb3JyZWxhdGlv',
    'bnM6IHsKICAgICAgcGJfcnNfYm86ICdzdGFuZGluZycgYXMgY29uc3QsCiAgICAgIG9pbF92aXNj',
    'b3NpdHk6ICdiZWdnc19yb2JpbnNvbicgYXMgY29uc3QsCiAgICAgIHpfZmFjdG9yOiAnaGFsbF95',
    'YXJib3JvdWdoJyBhcyBjb25zdCwKICAgICAgd2F0ZXI6ICdtY2NhaW4nIGFzIGNvbnN0LAogICAg',
    'ICBnYXNfdmlzY29zaXR5OiAnbGVlX2dvbnphbGV6X2Vha2luJyBhcyBjb25zdCwKICAgIH0sCiAg',
    'ICBleGNsdWRlZF90aW1lc3RlcHM6IFtdIGFzIG51bWJlcltdLAogICAgcHJvZHVjdGlvbl9kYXRh',
    'LAogIH07CgogIGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVNYXRlcmlhbEJhbGFuY2UoaW5wdXRzKTsK',
    'CiAgLy8g4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSACiAgLy8gQVNTRVJU',
    'SU9OIEctMTogT09JUCB3aXRoaW4gwrE1JSBvZiBEYWtlJ3MgcHJlZmVycmVkIE4gPSAxMTQgTU1T',
    'VEIKICAvLyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIAKICBjb25zb2xl',
    'LmxvZygn4pSA4pSA4pSAIEFzc2VydGlvbiBHLTE6IE9PSVAgZnJvbSBGIHZzIChFbyArIG3Ct0Vn',
    'KSByZWdyZXNzaW9uIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgCcpOwogIGNvbnN0IG9vaXBfbW1z',
    'dGIgPSAocmVzdWx0LmVzdGltYXRlZF9vb2lwX3N0YiA/PyAwKSAvIDFlNjsKICBjaGVjaygKICAg',
    'ICdPT0lQIHdpdGggbT0wLjUgaW5wdXQnLAogICAgb29pcF9tbXN0YiwKICAgIERBS0VfR0FTX0NB',
    'UF9SRVNFUlZPSVIuZGFrZV9OX3ByZWZlcnJlZF9tbXN0YiwKICAgIDAuMDUsCiAgICB7IHVuaXQ6',
    'ICdNTSBTVEInLCBmb3JtYXQ6IChuKSA9PiBuLnRvRml4ZWQoMSkgfSwKICApOwoKICAvLyDilIDi',
    'lIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIAKICAvLyBBU1NFUlRJT04gRy0yOiBE',
    'cml2ZSBpbmRleCBzdW0KICAvLyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIAKICBjb25zb2xlLmxvZygn4pSA4pSA4pSAIEFzc2VydGlvbiBHLTI6IERyaXZlIGluZGV4IHN1',
    'bSBhdCBmaW5hbCB0aW1lc3RlcCDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIAn',
    'KTsKICBjaGVja1JhbmdlKCdEcml2ZSBpbmRleCBzdW0gKGFsbCBkcml2ZXMpJywgcmVzdWx0LmZp',
    'bmFsX2RyaXZlX2luZGV4X3N1bSA/PyAwLCAwLjk1LCAxLjA1KTsKCiAgLy8g4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSACiAgLy8gQVNTRVJUSU9OIEctMzogR2FzLWNhcCBk',
    'cml2ZSBpbmRleCBzdWJzdGFudGlhbAogIC8vIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgAogIGNvbnNvbGUubG9nKCfilIDilIDilIAgQXNzZXJ0aW9uIEctMzogR2FzLWNh',
    'cCBkcml2ZSBpbmRleCBzdWJzdGFudGlhbCDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIDilIDilIDilIAnKTsKICBjaGVja1JhbmdlKCdHREkgKGdhcy1jYXAgZHJpdmUgaW5kZXgpJywg',
    'cmVzdWx0LmZpbmFsX2dkaSA/PyAwLCAwLjIwLCAwLjgwKTsKCiAgLy8g4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSACiAgLy8gQVNTRVJUSU9OIEctNDogRGVwbGV0aW9uIGRy',
    'aXZlIGluZGV4IHN1YnN0YW50aWFsCiAgLy8g4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSACiAgY29uc29sZS5sb2coJ+KUgOKUgOKUgCBBc3NlcnRpb24gRy00OiBEZXBsZXRp',
    'b24gZHJpdmUgaW5kZXggc3Vic3RhbnRpYWwg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSAJyk7CiAgY2hlY2tSYW5nZSgnRERJIChkZXBsZXRpb24gZHJpdmUgaW5kZXgpJywgcmVz',
    'dWx0LmZpbmFsX2RkaSA/PyAwLCAwLjE1LCAwLjcwKTsKCiAgLy8g4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSACiAgLy8gQVNTRVJUSU9OIEctNTogTm8gd2F0ZXIgZHJpdmUK',
    'ICAvLyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIAKICBjb25zb2xlLmxv',
    'Zygn4pSA4pSA4pSAIEFzc2VydGlvbiBHLTU6IE5vIHdhdGVyIGRyaXZlIOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgCcpOwogIGNoZWNrUmFuZ2UoJ1dESSAod2F0ZXIgZHJpdmUg',
    'aW5kZXgpJywgcmVzdWx0LmZpbmFsX3dkaSA/PyAwLCAtMC4wNSwgMC4wNSk7CgogIC8vIOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgAogIC8vIEFTU0VSVElPTiBHLTY6IERy',
    'aXZlIG1lY2hhbmlzbSBjbGFzc2lmaWNhdGlvbgogIC8vIEFjY2VwdDogZ2FzX2NhcF9kcml2ZSwg',
    'bWl4ZWRfZHJpdmUsIGRlcGxldGlvbl9kcml2ZQogIC8vIFJlamVjdDogYW55IHdhdGVyLWRyaXZl',
    'IGNsYXNzaWZpY2F0aW9uCiAgLy8g4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSACiAgY29uc29sZS5sb2coJ+KUgOKUgOKUgCBBc3NlcnRpb24gRy02OiBEcml2ZSBtZWNoYW5p',
    'c20gY2xhc3NpZmljYXRpb24g4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSAJyk7CiAgY29uc3QgYWNjZXB0ZWRNZWNoYW5pc21zID0gWydnYXNfY2FwX2RyaXZlJywg',
    'J21peGVkX2RyaXZlJywgJ2RlcGxldGlvbl9kcml2ZSddOwogIGNvbnN0IG1lY2ggPSByZXN1bHQu',
    'ZHJpdmVfbWVjaGFuaXNtID8/ICcnOwogIGNvbnN0IG1lY2hPayA9IGFjY2VwdGVkTWVjaGFuaXNt',
    'cy5pbmNsdWRlcyhtZWNoKTsKICBpZiAobWVjaE9rKSB7CiAgICBjb25zb2xlLmxvZyhgICDinJMg',
    'UEFTUyAgRHJpdmUgbWVjaGFuaXNtID0gJyR7bWVjaH0nIChhY2NlcHRhYmxlKWApOwogIH0gZWxz',
    'ZSB7CiAgICBjb25zb2xlLmxvZyhgICDinJcgRkFJTCAgRHJpdmUgbWVjaGFuaXNtID0gJyR7bWVj',
    'aH0nIChleHBlY3RlZCBvbmUgb2YgJHthY2NlcHRlZE1lY2hhbmlzbXMuam9pbignLCAnKX0pYCk7',
    'CiAgICBGQUlMVVJFUy5wdXNoKHsKICAgICAgbmFtZTogYERyaXZlIG1lY2hhbmlzbSBjbGFzc2lm',
    'aWNhdGlvbiAoZ290ICcke21lY2h9JylgLAogICAgICBhY3R1YWw6IDAsCiAgICAgIHJhbmdlOiBb',
    'MSwgMV0gYXMgW251bWJlciwgbnVtYmVyXSwKICAgIH0pOwogIH0KCiAgLy8g4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSACiAgLy8gQVNTRVJUSU9OIEctNzogUmVncmVzc2lv',
    'biBSwrIg4omlIDAuOTUKICAvLyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIAKICBjb25zb2xlLmxvZygn4pSA4pSA4pSAIEFzc2VydGlvbiBHLTc6IFJlZ3Jlc3Npb24gUsKy',
    'IOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgCcpOwogIGNoZWNrUmFuZ2Uo',
    'J1LCsiBvZiBGIHZzIChFbyArIG3Ct0VnKSByZWdyZXNzaW9uJywgcmVzdWx0LnJfc3F1YXJlZCA/',
    'PyAwLCAwLjk1LCAxLjApOwoKICAvLyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIDilIAKICAvLyBJTkZPUk1BVElPTkFMOiBDcm9zcy1jaGVjayBhZ2FpbnN0IHB1Ymxpc2hlZCBy',
    'ZWZlcmVuY2VzCiAgLy8g4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSACiAg',
    'Y29uc29sZS5sb2coJ+KUgOKUgOKUgCBDcm9zcy1jaGVjayBhZ2FpbnN0IHB1Ymxpc2hlZCByZWZl',
    'cmVuY2VzIChpbmZvcm1hdGlvbmFsKSDilIDilIDilIDilIAnKTsKICBjb25zb2xlLmxvZyhgICBF',
    'bmdpbmUgT09JUCAoTFNRIHdpdGggbT0wLjUgaW5wdXQpOiAgJHtvb2lwX21tc3RiLnRvRml4ZWQo',
    'MSl9IE1NIFNUQmApOwogIGNvbnNvbGUubG9nKGAgIERha2UgdHJpYWwtYW5kLWVycm9yIChtPTAu',
    'NSk6ICAgICAgICAke0RBS0VfR0FTX0NBUF9SRVNFUlZPSVIuZGFrZV9OX3ByZWZlcnJlZF9tbXN0',
    'Yn0gTU0gU1RCYCk7CiAgY29uc29sZS5sb2coYCAgRGFrZSBMU1EgRi9FbyB2cyBFZy9FbyAobT0w',
    'LjU0KTogICAgICR7REFLRV9HQVNfQ0FQX1JFU0VSVk9JUi5kYWtlX05fbHNxX21tc3RifSBNTSBT',
    'VEJgKTsKICBjb25zb2xlLmxvZyhgICBWb2x1bWV0cmljIGluZGVwZW5kZW50IGVzdGltYXRlOiAg',
    'ICAgJHtEQUtFX0dBU19DQVBfUkVTRVJWT0lSLnZvbHVtZXRyaWNfTl9tbXN0Yn0gTU0gU1RCYCk7',
    'CiAgY29uc3QgZGFrZV9lcnIgPSBNYXRoLmFicyhvb2lwX21tc3RiIC0gREFLRV9HQVNfQ0FQX1JF',
    'U0VSVk9JUi5kYWtlX05fcHJlZmVycmVkX21tc3RiKQogICAgICAgICAgICAgICAgICAgLyBEQUtF',
    'X0dBU19DQVBfUkVTRVJWT0lSLmRha2VfTl9wcmVmZXJyZWRfbW1zdGIgKiAxMDA7CiAgY29uc29s',
    'ZS5sb2coYCAgRW5naW5lIHZzIERha2UgcHJlZmVycmVkOiAke2Rha2VfZXJyLnRvRml4ZWQoMil9',
    'JSBkZXZpYXRpb25gKTsKICBjb25zb2xlLmxvZygnJyk7CgogIC8vIOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgAogIC8vIElORk9STUFUSU9OQUw6IERyaXZlIGluZGV4IGJy',
    'ZWFrZG93bgogIC8vIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgAogIGNv',
    'bnNvbGUubG9nKCfilIDilIDilIAgRHJpdmUgSW5kZXggQnJlYWtkb3duIGF0IGZpbmFsIHRpbWVz',
    'dGVwIChpbmZvcm1hdGlvbmFsKSDilIDilIDilIDilIDilIAnKTsKICBjb25zb2xlLmxvZyhgICBE',
    'REk6ICR7KHJlc3VsdC5maW5hbF9kZGkgPz8gMCkudG9GaXhlZCgzKX0gICAgKGRlcGxldGlvbiBk',
    'cml2ZSDigJQgb2lsIGV4cGFuc2lvbilgKTsKICBjb25zb2xlLmxvZyhgICBHREk6ICR7KHJlc3Vs',
    'dC5maW5hbF9nZGkgPz8gMCkudG9GaXhlZCgzKX0gICAgKGdhcyBjYXAgZHJpdmUg4oCUIHByaW1h',
    'cnkgZm9yIHRoaXMgY2FzZSlgKTsKICBjb25zb2xlLmxvZyhgICBTREk6ICR7KHJlc3VsdC5maW5h',
    'bF9zZGkgPz8gMCkudG9GaXhlZCgzKX0gICAgKHJvY2srd2F0ZXIgY29tcHJlc3NpYmlsaXR5KWAp',
    'OwogIGNvbnNvbGUubG9nKGAgIFdESTogJHsocmVzdWx0LmZpbmFsX3dkaSA/PyAwKS50b0ZpeGVk',
    'KDMpfSAgICAod2F0ZXIgZHJpdmUg4oCUIGV4cGVjdGVkIH4wKWApOwogIGNvbnNvbGUubG9nKGAg',
    'IFN1bTogJHsocmVzdWx0LmZpbmFsX2RyaXZlX2luZGV4X3N1bSA/PyAwKS50b0ZpeGVkKDMpfWAp',
    'OwogIGNvbnNvbGUubG9nKCcnKTsKCiAgLy8g4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSACiAgLy8gSU5GT1JNQVRJT05BTDogUmVncmVzc2lvbiBhbmQgZW5naW5lIG91dHB1',
    'dHMKICAvLyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIAKICBjb25zb2xl',
    'LmxvZygn4pSA4pSA4pSAIFJlZ3Jlc3Npb24gYW5kIEVuZ2luZSBPdXRwdXRzIOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgCcpOwogIGNvbnNvbGUubG9nKGAgIFLCsiAocmVncmVz',
    'c2lvbik6ICAgICAgICAgICR7cmVzdWx0LnJfc3F1YXJlZD8udG9GaXhlZCg2KSA/PyAnbi9hJ31g',
    'KTsKICBjb25zb2xlLmxvZyhgICBEYXRhIHBvaW50cyB1c2VkOiAgICAgICAgICR7cmVzdWx0Lm5f',
    'ZGF0YV9wb2ludHMgPz8gJ24vYSd9YCk7CiAgY29uc29sZS5sb2coYCAgU2xvcGUgKD0gT09JUCBT',
    'VEIpOiAgICAgICAkeyhyZXN1bHQucmVncmVzc2lvbl9zbG9wZSA/PyAwKS50b0V4cG9uZW50aWFs',
    'KDQpfWApOwogIGNvbnNvbGUubG9nKGAgIEdhcyBjYXAgbSBpbnB1dDogICAgICAgICAgJHtEQUtF',
    'X0dBU19DQVBfUkVTRVJWT0lSLmdhc19jYXBfcmF0aW9fbX1gKTsKICBjb25zb2xlLmxvZygnJyk7',
    'CgogIC8vIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgAogIC8vIElORk9S',
    'TUFUSU9OQUw6IEVuZ2luZSB3YXJuaW5ncyArIGRpYWdub3N0aWNzCiAgLy8g4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSACiAgY29uc29sZS5sb2coJ+KUgOKUgOKUgCBFbmdp',
    'bmUgV2FybmluZ3Mg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAJyk7CiAgaWYgKHJlc3VsdC53YXJuaW5n',
    'cy5sZW5ndGggPT09IDApIHsKICAgIGNvbnNvbGUubG9nKCcgIChub25lKScpOwogIH0gZWxzZSB7',
    'CiAgICByZXN1bHQud2FybmluZ3MuZm9yRWFjaCgodykgPT4gY29uc29sZS5sb2coYCAg4oCiICR7',
    'd31gKSk7CiAgfQogIGNvbnNvbGUubG9nKCcnKTsKCiAgY29uc29sZS5sb2coJ+KUgOKUgOKUgCBF',
    'bmdpbmUgRGlhZ25vc3RpY3Mg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAJyk7CiAgY29uc29sZS5sb2coYCAgRHJpdmUg',
    'bWVjaGFuaXNtOiAgICAgICAke3Jlc3VsdC5kcml2ZV9tZWNoYW5pc219YCk7CiAgY29uc29sZS5s',
    'b2coYCAgQXF1aWZlciBzdHJlbmd0aDogICAgICAke3Jlc3VsdC5hcXVpZmVyX3N0cmVuZ3RofWAp',
    'OwogIGNvbnNvbGUubG9nKGAgIFZhbGlkYXRpb24gdGllcjogICAgICAgJHtyZXN1bHQudmFsaWRh',
    'dGlvbl90aWVyID8/ICduL2EnfWApOwogIGNvbnNvbGUubG9nKCcnKTsKfQo='
  ].join('');

function md5(buf) {
  return crypto.createHash('md5').update(buf).digest('hex');
}

function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' Dake Exercise 3.4 — oil + gas cap + no aquifer validation');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Target file: ' + TARGET);
  console.log('');

  if (!fs.existsSync(TARGET)) {
    console.error('✗ File not found: ' + TARGET);
    process.exit(1);
  }

  const original = fs.readFileSync(TARGET, 'utf8');
  const actualMd5 = md5(original);
  console.log('Pre-flight MD5: ' + actualMd5);

  // ─── Idempotency ───────────────────────────────────────────────────────
  if (original.includes(IDEMPOTENCY_MARKER)) {
    console.log('');
    console.log('✓ Already patched (runGasCapDriveOilCase found in file).');
    console.log('  No changes made.');
    process.exit(0);
  }

  // ─── Sentinel uniqueness ──────────────────────────────────────────────
  // We rely on the Tarek depletion case being present and its sentinel
  // being unique (it appears exactly twice: once in main(), once inside the
  // function definition near end of file). We want the one in main(), so we
  // check that the sentinel appears in main()-like context.
  //
  // In practice: occurrences should be 2 (one in main() call, one in the
  // banner comment "// CASE 2D — Tarek..." that mentions the function name
  // OR the comment in the function definition). We want to insert after the
  // FIRST occurrence (the one in main()). Let's be more careful and use a
  // more specific sentinel pattern.

  // Use the full surrounding context to disambiguate
  const fullSentinel = "  await runDepletionOilCase();\n";
  const occurrences = original.split(fullSentinel).length - 1;
  console.log('Sentinel "  await runDepletionOilCase();" occurrences: ' + occurrences);

  if (occurrences === 0) {
    console.error('');
    console.error('✗ Sentinel "  await runDepletionOilCase();" not found.');
    console.error('  This patch requires the Tarek depletion-case patch to have');
    console.error('  been applied first. Check:');
    console.error('    grep -n "runDepletionOilCase" ' + TARGET);
    process.exit(1);
  }
  if (occurrences > 1) {
    console.error('');
    console.error('✗ Sentinel "  await runDepletionOilCase();" matched ' + occurrences + ' times.');
    console.error('  Ambiguous insertion point. Aborting.');
    process.exit(1);
  }

  // ─── Decode payload ──────────────────────────────────────────────────
  const validationCase = Buffer.from(VALIDATION_CASE_B64, 'base64').toString('utf-8');

  // ─── Build the insertion block for main() ────────────────────────────
  const insertionInMain = [
    '',
    '  // ─────────────────────────────────────────────────────────────────────',
    '  // CASE 2G — Dake Exercise 3.4: oil + gas cap + no aquifer',
    '  // (Gas-cap drive, no water influx, Havlena-Odeh F vs (Eo + m·Eg))',
    '  // Numbered 2G to keep the existing CASE 3+ labels stable.',
    '  // ─────────────────────────────────────────────────────────────────────',
    "  console.log('');",
    "  console.log('═══════════════════════════════════════════════════════════════════');",
    "  console.log('  CASE 2G — Oil + gas cap + no aquifer (Dake Exercise 3.4)');",
    "  console.log('═══════════════════════════════════════════════════════════════════');",
    "  console.log('');",
    '  await runGasCapDriveOilCase();',
  ].join('\n');

  const patched_main = original.replace(
    fullSentinel,
    fullSentinel + insertionInMain + '\n'
  );

  if (patched_main === original) {
    console.error('✗ str_replace produced no change. Aborting.');
    process.exit(1);
  }

  // ─── Append at end of file ────────────────────────────────────────────
  const fileEnd = patched_main.endsWith('\n') ? '' : '\n';
  const finalContent =
    patched_main +
    fileEnd +
    '\n' +
    '// ═══════════════════════════════════════════════════════════════════════════\n' +
    '// Phase 5 second chunk addition (2026-05-17):\n' +
    '// Dake Exercise 3.4 — oil + gas cap + no aquifer (gascap drive) validation\n' +
    '// ═══════════════════════════════════════════════════════════════════════════\n' +
    '\n' +
    validationCase +
    (validationCase.endsWith('\n') ? '' : '\n');

  // ─── Backup ────────────────────────────────────────────────────────────
  const stamp = Date.now();
  const backupPath = TARGET + '.bak-' + stamp;
  fs.writeFileSync(backupPath, original);
  console.log('');
  console.log('Backup written: ' + path.basename(backupPath));

  // ─── Write the patched file ────────────────────────────────────────────
  fs.writeFileSync(TARGET, finalContent);

  const newMd5 = md5(finalContent);
  const newLines = finalContent.split('\n').length;

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✓ Patch applied.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('New MD5:     ' + newMd5);
  console.log('New lines:   ' + (newLines - 1));
  console.log('');
  console.log('Next step:');
  console.log('  cd ' + REPO_ROOT);
  console.log('  npx tsx tools/validation/mbal-validation.ts');
  console.log('');
  console.log('Expected output: all existing assertions still pass, plus seven');
  console.log('new G-1..G-7 assertions from CASE 2G (Dake gas-cap drive).');
  console.log('');
  console.log('Rollback (if needed):');
  console.log('  cp ' + backupPath + ' ' + TARGET);
}

try {
  main();
} catch (err) {
  console.error('');
  console.error('✗ Patch failed: ' + err.message);
  console.error(err.stack);
  process.exit(1);
}
