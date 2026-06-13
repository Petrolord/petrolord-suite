#!/usr/bin/env node
/**
 * Petrolord Suite — Phase 5 third chunk
 * =========================================================================
 *
 * File: tools/patches/2026-05-17_mbal_validation_dake_carter_tracy.cjs
 *
 * Purpose
 *   Add Dake (1978) Exercise 9.2 as the Carter-Tracy aquifer validation.
 *   This case has a strong natural water drive with a finite radial aquifer
 *   and is solved in Dake by Hurst-van Everdingen unsteady-state theory.
 *   The Petrolord engine uses Carter-Tracy (the standard simplification of
 *   HvE). Validation tolerance is wider (±10% on OOIP) to absorb the
 *   well-documented CT vs HvE method spread (1-5% on We typically).
 *
 *   Numbered CASE 2C ("oil + Carter-Tracy") to match the existing CASE 2
 *   family (oil + pot), 2D (oil + depletion), 2G (oil + gas cap).
 *
 *   On pass, promotes oil + carter_tracy path from published_method →
 *   benchmark_verified.
 *
 * Reference
 *   Dake, L.P. (1978), "Fundamentals of Reservoir Engineering," Elsevier,
 *   Chapter 9, Exercise 9.2 "Aquifer fitting using the unsteady state
 *   theory of Hurst and van Everdingen", pp. 310-319.
 *
 * Pre-flight verification (Python)
 *   • F values (11 timesteps) match Dake Table 9.6 to < 0.01%
 *   • Eo values match Dake Table 9.6 to < 0.01% (after OCR-error correction
 *     in Table 9.3: year-9 Rs is 371, not the OCR'd 381 — verified by
 *     reverse-engineering from Dake's published Eo and by monotonicity)
 *   • Hurst-van Everdingen We reproduces Dake Table 9.7 to 0.04%
 *   • LSQ on (F, Eo, Dake's exact HvE We) gives N = 310.2 MMSTB
 *     (Dake reports 312 MMSTB; 0.6% difference is numerical precision)
 *   • Carter-Tracy We expected to differ from HvE by 1-5% (a few percent
 *     on N propagates from this)
 *
 * What the patch does
 *   1. Idempotency check (skip if runCarterTracyOilCase already defined).
 *   2. Sentinel-based insertion of "await runCarterTracyOilCase()" call
 *      in main(), AFTER the Dake gas-cap case call.
 *   3. Append the new constants + function at end of file.
 *   4. Back up the original to .bak-{timestamp}.
 *
 *   No MD5 pre-flight (file has had multiple harness patches; sentinel
 *   uniqueness and idempotency markers provide stronger safety).
 *
 * Risk note on engine API
 *   The harness assumes the engine accepts these Carter-Tracy fields on the
 *   inputs object: aquifer_radius_ft, aquifer_dim_radius_ratio,
 *   aquifer_thickness_ft, aquifer_permeability_md, aquifer_porosity,
 *   aquifer_water_viscosity_cp, aquifer_encroachment_angle_deg,
 *   aquifer_total_compressibility_psi. If any field name is different,
 *   the engine will throw a clear error and we iterate on the field names.
 *
 * Run
 *   cd /opt/petrolord-studio/workspaces/dev1/projects/petrolord-suite
 *   node tools/patches/2026-05-17_mbal_validation_dake_carter_tracy.cjs
 *
 * Then verify
 *   npx tsx tools/validation/mbal-validation.ts
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO_ROOT = path.resolve(__dirname, '../..');
const TARGET    = path.join(REPO_ROOT, 'tools/validation/mbal-validation.ts');

const INSERT_AFTER = '  await runGasCapDriveOilCase();\n';
const IDEMPOTENCY_MARKER = 'async function runCarterTracyOilCase';

const VALIDATION_CASE_B64 = [
    'Ly8g4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ',
    '4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ',
    '4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ',
    '4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ',
    '4pWQCi8vIENBU0UgMkMg4oCUIERha2UgRXhlcmNpc2UgOS4yOiBPaWwgcmVzZXJ2b2lyIHdpdGgg',
    'Q2FydGVyLVRyYWN5IGFxdWlmZXIKLy8g4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ',
    '4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ',
    '4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ',
    '4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ',
    '4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQCi8vIFJlZmVyZW5jZTogRGFrZSwgTC5QLiAoMTk3OCks',
    'ICJGdW5kYW1lbnRhbHMgb2YgUmVzZXJ2b2lyIEVuZ2luZWVyaW5nLCIKLy8gRWxzZXZpZXIsIENo',
    'YXB0ZXIgOSAiTmF0dXJhbCBXYXRlciBJbmZsdXgiLCBFeGVyY2lzZSA5LjIgIkFxdWlmZXIgZml0',
    'dGluZwovLyB1c2luZyB0aGUgdW5zdGVhZHkgc3RhdGUgdGhlb3J5IG9mIEh1cnN0IGFuZCB2YW4g',
    'RXZlcmRpbmdlbiIsIHBwLiAzMTAtMzE5LgovLwovLyBSZXNlcnZvaXI6IHdlZGdlLXNoYXBlZCBy',
    'ZXNlcnZvaXIgKDE0MMKwIGVuY3JvYWNobWVudCBhbmdsZSkgd2l0aCBhIGZpbml0ZQovLyByYWRp',
    'YWwgYXF1aWZlciBwcm9kdWNpbmcgYSBzdHJvbmcgbmF0dXJhbCB3YXRlciBkcml2ZS4gMTAgYW5u',
    'dWFsIHRpbWVzdGVwcwovLyBmcm9tIDI3NDAgcHNpYSAoaW5pdGlhbCkgZG93biB0byAxNDYwIHBz',
    'aWEgYXQgeWVhciAxMC4gfjI0JSByZWNvdmVyeS4KLy8KLy8gTm90ZSBvbiBtZXRob2RzIChpbXBv',
    'cnRhbnQpOgovLyAgIOKAoiBEYWtlJ3Mgd29ya2VkIGV4YW1wbGUgdXNlcyBIdXJzdCBhbmQgdmFu',
    'IEV2ZXJkaW5nZW4gKDE5NDkpIHVuc3RlYWR5LQovLyAgICAgc3RhdGUgd2F0ZXIgaW5mbHV4IHRo',
    'ZW9yeSB3aXRoIHRhYmxlIGxvb2stdXAgb2YgV19EIHZhbHVlcyBhbmQgZXhwbGljaXQKLy8gICAg',
    'IHByZXNzdXJlLXN0ZXAgY29udm9sdXRpb24uCi8vICAg4oCiIFRoZSBQZXRyb2xvcmQgZW5naW5l',
    'IHVzZXMgQ2FydGVyLVRyYWN5ICgxOTYwKSwgd2hpY2ggaXMgdGhlIHN0YW5kYXJkCi8vICAgICBz',
    'aW1wbGlmaWNhdGlvbiBvZiBIdXJzdC12YW4gRXZlcmRpbmdlbiB0aGF0IGF2b2lkcyB0aGUgY29u',
    'dm9sdXRpb24gYnkKLy8gICAgIHVzaW5nIGRpbWVuc2lvbmxlc3MgcHJlc3N1cmUgcEQodEQsIHJl',
    'RCkgaW5zdGVhZCBvZiBkaW1lbnNpb25sZXNzCi8vICAgICBpbmZsdXggV19EKHRELCByZUQpLCBp',
    'biBhIHJlY3Vyc2l2ZSB0aW1lc3RlcCBmb3JtLgovLyAgIOKAoiBUaGUgdHdvIG1ldGhvZHMgcHJv',
    'ZHVjZSBzaW1pbGFyIGJ1dCBub3QgaWRlbnRpY2FsIFdlIHZhbHVlcy4gU3RhbmRhcmQKLy8gICAg',
    'IGxpdGVyYXR1cmUgcmVwb3J0cyAxLTUlIG1ldGhvZCBzcHJlYWQsIHdvcnNlIGF0IGVhcmx5IHRp',
    'bWUsIGJldHRlciBhdAovLyAgICAgbGF0ZSB0aW1lLiBPbiBEYWtlJ3MgZXhhY3QgZGF0YXNldCwg',
    'UHl0aG9uIHByZS1mbGlnaHQgcXVhbnRpZmllZCB0aGUKLy8gICAgIG1ldGhvZCBzcHJlYWQgYXMg',
    'fjUtMTglIG9uIFdlIGVhcmx5LXRpbWUsIHNldHRsaW5nIHRvIDEtMiUgYnkgeWVhciAxMC4KLy8g',
    'ICDigKIgVGhpcyBwcm9wYWdhdGVzIHRvIGEgMi01JSBzcHJlYWQgb24gdGhlIGZpbmFsIE9PSVAg',
    'ZXN0aW1hdGUgdmlhIHRoZQovLyAgICAgSGF2bGVuYS1PZGVoIEYgdnMgKE5FbyArIFdlKSByZWdy',
    'ZXNzaW9uLgovLwovLyAgIFRoaXMgdmFsaWRhdGlvbiB0aGVyZWZvcmUgdXNlcyBhIHdpZGVyIE9P',
    'SVAgdG9sZXJhbmNlICjCsTEwJSkgdGhhbiB0aGUKLy8gICBUYXJlayBhbmQgRGFrZSBnYXMtY2Fw',
    'IGNhc2VzLiBUaGUgbG9vc2VyIHRvbGVyYW5jZSBpcyBob25lc3QgYWJvdXQgdGhlCi8vICAgQ2Fy',
    'dGVyLVRyYWN5IHZzIEh1cnN0LXZhbiBFdmVyZGluZ2VuIG1ldGhvZCBnYXAgYW5kIG5vdCBlbmdp',
    'bmUgZXJyb3IuCi8vICAgVGlnaHRlciBhc3NlcnRpb25zIHN0aWxsIGFwcGx5IHRvIGRyaXZlLWlu',
    'ZGV4IHBoeXNpY3MgYW5kIHJlZ3Jlc3Npb24gUsKyLgovLwovLyBUcnV0aCB2YWx1ZXMgZnJvbSBE',
    'YWtlJ3Mgc29sdXRpb246Ci8vICAg4oCiIE4gKGdpdmVuIGlucHV0ICsgTFNRIGNvbmZpcm1hdGlv',
    'bik6IDMxMiBNTVNUQgovLyAgIOKAoiBWb2x1bWV0cmljIGVzdGltYXRlOiAzMTIgTU1TVEIgKHNh',
    'bWUgYXMgdHJ1dGgpCi8vICAg4oCiIHJlRCAoY29ycmVjdCB2YWx1ZSBmb3VuZCBieSB0cmlhbC1h',
    'bmQtZXJyb3IpOiA1Ci8vICAg4oCiIFByZS1mbGlnaHQgTFNRIG9uIERha2UncyBleGFjdCBIdkUg',
    'V2UgdmFsdWVzOiBOID0gMzEwLjIgTU1TVEIKLy8KLy8gSW50ZXJuYWwgY29uc2lzdGVuY3kgdmVy',
    'aWZpZWQgaW4gcHJlLWZsaWdodDoKLy8gICDigKIgQWxsIDEwIEYgdmFsdWVzIG1hdGNoIERha2Ug',
    'VGFibGUgOS42IHRvIDwgMC4wMSUKLy8gICDigKIgQWxsIDEwIEVvIHZhbHVlcyBtYXRjaCBEYWtl',
    'IFRhYmxlIDkuNiB0byA8IDAuMDElCi8vICAgICAoYWZ0ZXIgY29ycmVjdGluZyBPQ1IgZXJyb3Ig',
    'aW4gVGFibGUgOS4zOiB5ZWFyLTkgUnMgaXMgMzcxLCBub3QgMzgxIOKAlAovLyAgICAgIG1vbm90',
    'b25pY2l0eSBjaGVjayArIHJldmVyc2UtZW5naW5lZXJpbmcgZnJvbSBEYWtlJ3MgRW8gY29uZmly',
    'bXMpCi8vICAg4oCiIEh1cnN0LXZhbiBFdmVyZGluZ2VuIFdlIGNvbXB1dGF0aW9uIG1hdGNoZXMg',
    'RGFrZSBUYWJsZSA5LjcgdG8gMC4wNCUKLy8KLy8gQXNzZXJ0aW9uczoKLy8gICBDLTE6IE9PSVAg',
    'd2l0aGluIMKxMTAlIG9mIERha2UncyAzMTIgTU1TVEIKLy8gICAgICAgICh3aWRlIHRvIGFic29y',
    'YiBDVCB2cyBIdkUgbWV0aG9kIHNwcmVhZCkKLy8gICBDLTI6IERyaXZlIGluZGV4IHN1bSBhdCBm',
    'aW5hbCB0aW1lc3RlcCA9IDEuMDAgwrEgMC4wNQovLyAgIEMtMzogV0RJIHN1YnN0YW50aWFsIOKA',
    'lCB3YXRlciBkcml2ZSBzaG91bGQgYmUgZG9taW5hbnQgKOKJpSAwLjMwKQovLyAgIEMtNDogRERJ',
    'IHByZXNlbnQgYnV0IG5vdCBkb21pbmFudCDigJQgb2lsIGV4cGFuc2lvbiBjb250cmlidXRlcyAo',
    '4omlIDAuMDUpCi8vICAgQy01OiBHREkgPSAwIChubyBnYXMgY2FwKQovLyAgIEMtNjogRHJpdmUg',
    'bWVjaGFuaXNtIGNsYXNzaWZpY2F0aW9uIHJlYXNvbmFibGUKLy8gICAgICAgIEFjY2VwdDogd2F0',
    'ZXJfZHJpdmVfd2l0aF9kZXBsZXRpb24sIHN0cm9uZ193YXRlcl9kcml2ZSwKLy8gICAgICAgICAg',
    'ICAgICAgbWl4ZWRfZHJpdmUsIHdhdGVyX2RyaXZlCi8vICAgICAgICBSZWplY3Q6IGRlcGxldGlv',
    'bl9kcml2ZSwgZ2FzX2NhcF9kcml2ZSAobm8gd2F0ZXIgcmVzcG9uc2UpCi8vICAgQy03OiBSwrIg',
    '4omlIDAuODUgKERha2UncyAic2xpZ2h0IHNjYXR0ZXIiICsgQ1QgbWV0aG9kIG5vaXNlIGdpdmVz',
    'IHdpZGVyCi8vICAgICAgICB0b2xlcmFuY2UgdGhhbiB0aGUgbT0wIGNhc2VzKQoKY29uc3QgREFL',
    'RV9DVF9SRVNFUlZPSVIgPSB7CiAgaW5pdGlhbF9wcmVzc3VyZV9wc2lhOiAyNzQwLAogIGJ1YmJs',
    'ZV9wb2ludF9wc2lhOiAyNzQwLCAgICAgICAgICAgIC8vIE5vIG1lbnRpb24gb2YgcGI7IGFzc3Vt',
    'ZSBwaSA9IHBiIGlzIE9LCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8v',
    'IGJlY2F1c2UgUFZUIGlzIHByb3ZpZGVkIHBlci1wcmVzc3VyZQogICAgICAgICAgICAgICAgICAg',
    'ICAgICAgICAgICAgICAgICAgICAvLyAoZW5naW5lIHVzZXMgdGFibGUsIG5vdCBjb3JyZWxhdGlv',
    'bnMpCiAgcmVzZXJ2b2lyX3RlbXBlcmF0dXJlX2Y6IDIwMCwgICAgICAgIC8vIE5vdCBnaXZlbiBi',
    'eSBEYWtlOyBub21pbmFsIHZhbHVlCiAgaW5pdGlhbF93YXRlcl9zYXR1cmF0aW9uOiAwLjA1LCAg',
    'ICAgIC8vIERha2UgY2FsbHMgaXQgU3djIChjb25uYXRlKQogIGZvcm1hdGlvbl9jb21wcmVzc2li',
    'aWxpdHlfcHNpOiA0ZS02LAogIHdhdGVyX2NvbXByZXNzaWJpbGl0eV9wc2k6IDNlLTYsCiAgb2ls',
    'X2dyYXZpdHlfYXBpOiAzNSwgICAgICAgICAgICAgICAgIC8vIE5vbWluYWw7IGVuZ2luZSB1c2Vz',
    'IGxhYiB0YWJsZQogIGdhc19zcGVjaWZpY19ncmF2aXR5OiAwLjcsICAgICAgICAgICAvLyBOb21p',
    'bmFsOyBlbmdpbmUgdXNlcyBsYWIgdGFibGUKICBnYXNfY2FwX3JhdGlvX206IDAsICAgICAgICAg',
    'ICAgICAgICAgLy8gTm8gZ2FzIGNhcCBpbiB0aGlzIGV4ZXJjaXNlCgogIC8vIENhcnRlci1UcmFj',
    'eSBhcXVpZmVyIHBhcmFtZXRlcnMgZnJvbSBEYWtlCiAgYXF1aWZlcl9yYWRpdXNfZnQ6IDkyMDAs',
    'ICAgICAgICAgICAgICAvLyBEYWtlJ3Mgcl9vIChyZXNlcnZvaXIgcmFkaXVzIGF0IE9XQykKICBh',
    'cXVpZmVyX2RpbV9yYWRpdXNfcmF0aW86IDUsICAgICAgICAgICAvLyBEYWtlJ3Mgcl9lRCAodGhl',
    'IGNvcnJlY3QgdmFsdWUpCiAgYXF1aWZlcl90aGlja25lc3NfZnQ6IDEwMCwgICAgICAgICAgICAv',
    'LyBEYWtlJ3MgaAogIGFxdWlmZXJfcGVybWVhYmlsaXR5X21kOiAyMDAsICAgICAgICAgLy8gRGFr',
    'ZSdzIGsKICBhcXVpZmVyX3Bvcm9zaXR5OiAwLjI1LCAgICAgICAgICAgICAgIC8vIERha2UncyDP',
    'hgogIGFxdWlmZXJfd2F0ZXJfdmlzY29zaXR5X2NwOiAwLjU1LCAgICAgLy8gRGFrZSdzIM68dwog',
    'IGFxdWlmZXJfZW5jcm9hY2htZW50X2FuZ2xlX2RlZzogMTQwLCAgLy8gV2VkZ2UgYW5nbGUgKGYg',
    'PSAxNDDCsC8zNjDCsCkKICBhcXVpZmVyX3RvdGFsX2NvbXByZXNzaWJpbGl0eV9wc2k6IDdlLTYs',
    'ICAvLyBjdyArIGNmCgogIC8vIFRydXRoIHZhbHVlcyBmcm9tIERha2UKICBkYWtlX05fdHJ1dGhf',
    'bW1zdGI6IDMxMiwKICBkYWtlX05fbHNxX2h2ZV9tbXN0YjogMzEwLjIsCiAgZGFrZV9yZURfY29y',
    'cmVjdDogNSwKICByc2lfc2NmX3N0YjogNjUwLAp9OwoKLy8gVGFibGUgOS4zIOKAlCBQcm9kdWN0',
    'aW9uIGFuZCBQVlQgZGF0YQovLyAxMSByb3dzICh5ZWFyIDAuLjEwKS4gTm90ZTogeWVhci05IFJz',
    'IGNvcnJlY3RlZCBmcm9tIE9DUi1lcnJvciAzODEgdG8gMzcxLgpjb25zdCBEQUtFX0NUX1BFUkZP',
    'Uk1BTkNFID0gWwogIHsgeXI6ICAwLCBwOiAyNzQwLCBOcF9tbXN0YjogIDAuMDAsIFJwOiAgNjUw',
    'LCBCbzogMS40MDQsIFJzOiA2NTAsIEJnOiAwLjAwMDkzIH0sCiAgeyB5cjogIDEsIHA6IDI2MjAs',
    'IE5wX21tc3RiOiAgNy44OCwgUnA6ICA3NjAsIEJvOiAxLjM3NCwgUnM6IDU5MiwgQmc6IDAuMDAw',
    'OTggfSwKICB7IHlyOiAgMiwgcDogMjM5NSwgTnBfbW1zdGI6IDE4LjQyLCBScDogIDg0NSwgQm86',
    'IDEuMzQ5LCBSczogNTQ1LCBCZzogMC4wMDEwNyB9LAogIHsgeXI6ICAzLCBwOiAyMTk5LCBOcF9t',
    'bXN0YjogMjkuMTUsIFJwOiAgOTIwLCBCbzogMS4zMjksIFJzOiA1MDcsIEJnOiAwLjAwMTE3IH0s',
    'CiAgeyB5cjogIDQsIHA6IDIwMjksIE5wX21tc3RiOiA0MC42OSwgUnA6ICA5NzUsIEJvOiAxLjMx',
    'NiwgUnM6IDQ3MSwgQmc6IDAuMDAxMjggfSwKICB7IHlyOiAgNSwgcDogMTg4MywgTnBfbW1zdGI6',
    'IDUwLjE0LCBScDogMTAyNSwgQm86IDEuMzAzLCBSczogNDQyLCBCZzogMC4wMDEzOSB9LAogIHsg',
    'eXI6ICA2LCBwOiAxNzYwLCBOcF9tbXN0YjogNTguNDIsIFJwOiAxMDY1LCBCbzogMS4yOTQsIFJz',
    'OiA0MTgsIEJnOiAwLjAwMTUwIH0sCiAgeyB5cjogIDcsIHA6IDE2NTUsIE5wX21tc3RiOiA2NS4z',
    'OSwgUnA6IDEwOTUsIEJvOiAxLjI4NywgUnM6IDM5OCwgQmc6IDAuMDAxNjAgfSwKICB7IHlyOiAg',
    'OCwgcDogMTU3MSwgTnBfbW1zdGI6IDcwLjc0LCBScDogMTEyMCwgQm86IDEuMjgwLCBSczogMzgz',
    'LCBCZzogMC4wMDE3MCB9LAogIHsgeXI6ICA5LCBwOiAxNTA3LCBOcF9tbXN0YjogNzQuNTQsIFJw',
    'OiAxMTQ1LCBCbzogMS4yNzYsIFJzOiAzNzEsIEJnOiAwLjAwMTc2IH0sICAvLyBScyBjb3JyZWN0',
    'ZWQKICB7IHlyOiAxMCwgcDogMTQ2MCwgTnBfbW1zdGI6IDc3LjQzLCBScDogMTE2MCwgQm86IDEu',
    'MjczLCBSczogMzY0LCBCZzogMC4wMDE4MiB9LApdOwoKYXN5bmMgZnVuY3Rpb24gcnVuQ2FydGVy',
    'VHJhY3lPaWxDYXNlKCk6IFByb21pc2U8dm9pZD4gewogIGNvbnN0IHByb2R1Y3Rpb25fZGF0YSA9',
    'IERBS0VfQ1RfUEVSRk9STUFOQ0UubWFwKChyb3csIGlkeCkgPT4gewogICAgY29uc3QgTnBfc3Ri',
    'ID0gcm93Lk5wX21tc3RiICogMWU2OwogICAgY29uc3QgR3Bfc2NmID0gTnBfc3RiICogcm93LlJw',
    'OyAgLy8gY3VtdWxhdGl2ZSBHT1Igw5cgY3VtIG9pbCA9IGN1bSBnYXMKICAgIHJldHVybiB7CiAg',
    'ICAgIHRpbWVzdGVwX2luZGV4OiBpZHgsCiAgICAgIHByZXNzdXJlX3BzaWE6IHJvdy5wLAogICAg',
    'ICBjdW1fb2lsX3N0YjogTnBfc3RiLAogICAgICBjdW1fZ2FzX3NjZjogR3Bfc2NmLAogICAgICBj',
    'dW1fd2F0ZXJfc3RiOiAwLAogICAgICBib19yYl9zdGI6IHJvdy5CbywKICAgICAgcnNfc2NmX3N0',
    'Yjogcm93LlJzLAogICAgICBiZ19yYl9zY2Y6IHJvdy5CZywKICAgICAgYndfcmJfc3RiOiAxLjAs',
    'CiAgICB9OwogIH0pOwoKICBjb25zdCBpbnB1dHMgPSB7CiAgICBmbHVpZF9zeXN0ZW06ICdvaWwn',
    'IGFzIGNvbnN0LAogICAgaW5pdGlhbF9wcmVzc3VyZV9wc2lhOiBEQUtFX0NUX1JFU0VSVk9JUi5p',
    'bml0aWFsX3ByZXNzdXJlX3BzaWEsCiAgICBidWJibGVfcG9pbnRfcHNpYTogREFLRV9DVF9SRVNF',
    'UlZPSVIuYnViYmxlX3BvaW50X3BzaWEsCiAgICByZXNlcnZvaXJfdGVtcGVyYXR1cmVfZjogREFL',
    'RV9DVF9SRVNFUlZPSVIucmVzZXJ2b2lyX3RlbXBlcmF0dXJlX2YsCiAgICBpbml0aWFsX3dhdGVy',
    'X3NhdHVyYXRpb246IERBS0VfQ1RfUkVTRVJWT0lSLmluaXRpYWxfd2F0ZXJfc2F0dXJhdGlvbiwK',
    'ICAgIGZvcm1hdGlvbl9jb21wcmVzc2liaWxpdHlfcHNpOiBEQUtFX0NUX1JFU0VSVk9JUi5mb3Jt',
    'YXRpb25fY29tcHJlc3NpYmlsaXR5X3BzaSwKICAgIHdhdGVyX2NvbXByZXNzaWJpbGl0eV9wc2k6',
    'IERBS0VfQ1RfUkVTRVJWT0lSLndhdGVyX2NvbXByZXNzaWJpbGl0eV9wc2ksCiAgICBvaWxfZ3Jh',
    'dml0eV9hcGk6IERBS0VfQ1RfUkVTRVJWT0lSLm9pbF9ncmF2aXR5X2FwaSwKICAgIGdhc19zcGVj',
    'aWZpY19ncmF2aXR5OiBEQUtFX0NUX1JFU0VSVk9JUi5nYXNfc3BlY2lmaWNfZ3Jhdml0eSwKICAg',
    'IGdhc19jYXBfcmF0aW9fbTogREFLRV9DVF9SRVNFUlZPSVIuZ2FzX2NhcF9yYXRpb19tLAoKICAg',
    'IC8vIENhcnRlci1UcmFjeSBhcXVpZmVyIHBhcmFtZXRlcnMKICAgIGFxdWlmZXJfbW9kZWw6ICdj',
    'YXJ0ZXJfdHJhY3knIGFzIGNvbnN0LAogICAgYXF1aWZlcl9yYWRpdXNfZnQ6IERBS0VfQ1RfUkVT',
    'RVJWT0lSLmFxdWlmZXJfcmFkaXVzX2Z0LAogICAgYXF1aWZlcl9kaW1fcmFkaXVzX3JhdGlvOiBE',
    'QUtFX0NUX1JFU0VSVk9JUi5hcXVpZmVyX2RpbV9yYWRpdXNfcmF0aW8sCiAgICBhcXVpZmVyX3Ro',
    'aWNrbmVzc19mdDogREFLRV9DVF9SRVNFUlZPSVIuYXF1aWZlcl90aGlja25lc3NfZnQsCiAgICBh',
    'cXVpZmVyX3Blcm1lYWJpbGl0eV9tZDogREFLRV9DVF9SRVNFUlZPSVIuYXF1aWZlcl9wZXJtZWFi',
    'aWxpdHlfbWQsCiAgICBhcXVpZmVyX3Bvcm9zaXR5OiBEQUtFX0NUX1JFU0VSVk9JUi5hcXVpZmVy',
    'X3Bvcm9zaXR5LAogICAgYXF1aWZlcl93YXRlcl92aXNjb3NpdHlfY3A6IERBS0VfQ1RfUkVTRVJW',
    'T0lSLmFxdWlmZXJfd2F0ZXJfdmlzY29zaXR5X2NwLAogICAgYXF1aWZlcl9lbmNyb2FjaG1lbnRf',
    'YW5nbGVfZGVnOiBEQUtFX0NUX1JFU0VSVk9JUi5hcXVpZmVyX2VuY3JvYWNobWVudF9hbmdsZV9k',
    'ZWcsCiAgICBhcXVpZmVyX3RvdGFsX2NvbXByZXNzaWJpbGl0eV9wc2k6IERBS0VfQ1RfUkVTRVJW',
    'T0lSLmFxdWlmZXJfdG90YWxfY29tcHJlc3NpYmlsaXR5X3BzaSwKCiAgICBzb2x2ZXJfbWV0aG9k',
    'OiAnaGF2bGVuYV9vZGVoJyBhcyBjb25zdCwKICAgIHB2dF9zb3VyY2U6ICdsYWJfdGFibGUnIGFz',
    'IGNvbnN0LAogICAgcHZ0X2NvcnJlbGF0aW9uczogewogICAgICBwYl9yc19ibzogJ3N0YW5kaW5n',
    'JyBhcyBjb25zdCwKICAgICAgb2lsX3Zpc2Nvc2l0eTogJ2JlZ2dzX3JvYmluc29uJyBhcyBjb25z',
    'dCwKICAgICAgel9mYWN0b3I6ICdoYWxsX3lhcmJvcm91Z2gnIGFzIGNvbnN0LAogICAgICB3YXRl',
    'cjogJ21jY2FpbicgYXMgY29uc3QsCiAgICAgIGdhc192aXNjb3NpdHk6ICdsZWVfZ29uemFsZXpf',
    'ZWFraW4nIGFzIGNvbnN0LAogICAgfSwKICAgIGV4Y2x1ZGVkX3RpbWVzdGVwczogW10gYXMgbnVt',
    'YmVyW10sCiAgICBwcm9kdWN0aW9uX2RhdGEsCiAgfTsKCiAgY29uc3QgcmVzdWx0ID0gY29tcHV0',
    'ZU1hdGVyaWFsQmFsYW5jZShpbnB1dHMpOwoKICAvLyDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIDilIDilIDilIDilIAKICAvLyBBU1NFUlRJT04gQy0xOiBPT0lQIHdpdGhpbiDCsTEwJSBvZiBE',
    'YWtlJ3MgMzEyIE1NU1RCCiAgLy8gV2lkZSB0b2xlcmFuY2UgdG8gYWJzb3JiIENUIHZzIEh2RSBt',
    'ZXRob2Qgc3ByZWFkLgogIC8vIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gAogIGNvbnNvbGUubG9nKCfilIDilIDilIAgQXNzZXJ0aW9uIEMtMTogT09JUCBmcm9tIEhhdmxl',
    'bmEtT2RlaCArIENUIHJlZ3Jlc3Npb24g4pSA4pSA4pSA4pSA4pSA4pSA4pSAJyk7CiAgY29uc3Qg',
    'b29pcF9tbXN0YiA9IChyZXN1bHQuZXN0aW1hdGVkX29vaXBfc3RiID8/IDApIC8gMWU2OwogIGNo',
    'ZWNrKAogICAgJ09PSVAgd2l0aCBDYXJ0ZXItVHJhY3kgYXF1aWZlcicsCiAgICBvb2lwX21tc3Ri',
    'LAogICAgREFLRV9DVF9SRVNFUlZPSVIuZGFrZV9OX3RydXRoX21tc3RiLAogICAgMC4xMCwKICAg',
    'IHsgdW5pdDogJ01NIFNUQicsIGZvcm1hdDogKG4pID0+IG4udG9GaXhlZCgxKSB9LAogICk7Cgog',
    'IC8vIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgAogIC8vIEFTU0VSVElP',
    'TiBDLTI6IERyaXZlIGluZGV4IHN1bQogIC8vIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgAogIGNvbnNvbGUubG9nKCfilIDilIDilIAgQXNzZXJ0aW9uIEMtMjogRHJpdmUg',
    'aW5kZXggc3VtIGF0IGZpbmFsIHRpbWVzdGVwIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgCcpOwogIGNoZWNrUmFuZ2UoJ0RyaXZlIGluZGV4IHN1bSAoYWxsIGRyaXZlcyknLCBy',
    'ZXN1bHQuZmluYWxfZHJpdmVfaW5kZXhfc3VtID8/IDAsIDAuOTUsIDEuMDUpOwoKICAvLyDilIDi',
    'lIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIAKICAvLyBBU1NFUlRJT04gQy0zOiBX',
    'YXRlciBkcml2ZSBpbmRleCBzdWJzdGFudGlhbAogIC8vIERha2UncyBjYXNlIGlzIGEgImZhaXJs',
    'eSBzdHJvbmcgbmF0dXJhbCB3YXRlciBkcml2ZSIgcGVyIHByb2JsZW0gc3RhdGVtZW50LgogIC8v',
    'IOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgAogIGNvbnNvbGUubG9nKCfi',
    'lIDilIDilIAgQXNzZXJ0aW9uIEMtMzogV2F0ZXIgZHJpdmUgaW5kZXggc3Vic3RhbnRpYWwg4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAJyk7CiAgY2hlY2tS',
    'YW5nZSgnV0RJICh3YXRlciBkcml2ZSBpbmRleCknLCByZXN1bHQuZmluYWxfd2RpID8/IDAsIDAu',
    'MzAsIDAuOTApOwoKICAvLyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIAK',
    'ICAvLyBBU1NFUlRJT04gQy00OiBEZXBsZXRpb24gZHJpdmUgaW5kZXggbWVhbmluZ2Z1bCBidXQg',
    'bm90IGRvbWluYW50CiAgLy8g4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    'CiAgY29uc29sZS5sb2coJ+KUgOKUgOKUgCBBc3NlcnRpb24gQy00OiBEREkgcHJlc2VudCBhbmQg',
    'bm90IGRvbWluYW50IOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgCcpOwogIGNoZWNrUmFuZ2UoJ0RESSAoZGVwbGV0aW9uIGRyaXZlIGluZGV4KScsIHJl',
    'c3VsdC5maW5hbF9kZGkgPz8gMCwgMC4wNSwgMC42NSk7CgogIC8vIOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgAogIC8vIEFTU0VSVElPTiBDLTU6IE5vIGdhcyBjYXAgZHJp',
    'dmUKICAvLyDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIAKICBjb25zb2xl',
    'LmxvZygn4pSA4pSA4pSAIEFzc2VydGlvbiBDLTU6IE5vIGdhcyBjYXAgZHJpdmUg4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSAJyk7CiAgY2hlY2tSYW5nZSgnR0RJIChnYXMgY2FwIGRyaXZl',
    'IGluZGV4KScsIHJlc3VsdC5maW5hbF9nZGkgPz8gMCwgLTAuMDEsIDAuMDEpOwoKICAvLyDilIDi',
    'lIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIAKICAvLyBBU1NFUlRJT04gQy02OiBE',
    'cml2ZSBtZWNoYW5pc20gaXMgc29tZSBmb3JtIG9mIHdhdGVyLWRyaXZlCiAgLy8g4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSACiAgY29uc29sZS5sb2coJ+KUgOKUgOKUgCBB',
    'c3NlcnRpb24gQy02OiBEcml2ZSBtZWNoYW5pc20gY2xhc3NpZmljYXRpb24g4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAJyk7CiAgY29uc3QgYWNjZXB0ZWRNZWNo',
    'YW5pc21zID0gWwogICAgJ3dhdGVyX2RyaXZlX3dpdGhfZGVwbGV0aW9uJywKICAgICdzdHJvbmdf',
    'd2F0ZXJfZHJpdmUnLAogICAgJ21vZGVyYXRlX3dhdGVyX2RyaXZlJywKICAgICdtaXhlZF9kcml2',
    'ZScsCiAgICAnd2F0ZXJfZHJpdmUnLAogIF07CiAgY29uc3QgbWVjaCA9IHJlc3VsdC5kcml2ZV9t',
    'ZWNoYW5pc20gPz8gJyc7CiAgY29uc3QgbWVjaE9rID0gYWNjZXB0ZWRNZWNoYW5pc21zLmluY2x1',
    'ZGVzKG1lY2gpOwogIGlmIChtZWNoT2spIHsKICAgIGNvbnNvbGUubG9nKGAgIOKckyBQQVNTICBE',
    'cml2ZSBtZWNoYW5pc20gPSAnJHttZWNofScgKGFjY2VwdGFibGUgZm9yIHdhdGVyLWRyaXZlIGNh',
    'c2UpYCk7CiAgfSBlbHNlIHsKICAgIGNvbnNvbGUubG9nKGAgIOKclyBGQUlMICBEcml2ZSBtZWNo',
    'YW5pc20gPSAnJHttZWNofScgKGV4cGVjdGVkIG9uZSBvZiAke2FjY2VwdGVkTWVjaGFuaXNtcy5q',
    'b2luKCcsICcpfSlgKTsKICAgIEZBSUxVUkVTLnB1c2goewogICAgICBuYW1lOiBgRHJpdmUgbWVj',
    'aGFuaXNtIGNsYXNzaWZpY2F0aW9uIChnb3QgJyR7bWVjaH0nOyBleHBlY3RlZCB3YXRlci1kcml2',
    'ZSB2YXJpYW50KWAsCiAgICAgIGFjdHVhbDogMCwKICAgICAgcmFuZ2U6IFsxLCAxXSBhcyBbbnVt',
    'YmVyLCBudW1iZXJdLAogICAgfSk7CiAgfQoKICAvLyDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDilIDi',
    'lIDilIDilIDilIDilIAKICAvLyBBU1NFUlRJT04gQy03OiBSZWdyZXNzaW9uIFLCsiDiiaUgMC44',
    'NQogIC8vIExvd2VyIHRoYW4gZ2FzLWNhcCBjYXNlICgwLjk1KSBiZWNhdXNlIENUIHZzIEh2RSBt',
    'ZXRob2Qgbm9pc2UgaW4gV2UKICAvLyBhZGRzIHNjYXR0ZXIgdG8gdGhlIEYvRW8gdnMgV2UvRW8g',
    'cmVncmVzc2lvbiBsaW5lLgogIC8vIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgAogIGNvbnNvbGUubG9nKCfilIDilIDilIAgQXNzZXJ0aW9uIEMtNzogUmVncmVzc2lvbiBS',
    'wrIg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSAJyk7CiAgY2hlY2tSYW5n',
    'ZSgnUsKyIG9mIEYvRW8gdnMgV2UvRW8gcmVncmVzc2lvbicsIHJlc3VsdC5yX3NxdWFyZWQgPz8g',
    'MCwgMC44NSwgMS4wKTsKCiAgLy8g4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA',
    '4pSACiAgLy8gSU5GT1JNQVRJT05BTAogIC8vIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgAogIGNvbnNvbGUubG9nKCfilIDilIDilIAgQ3Jvc3MtY2hlY2sgYWdhaW5zdCBw',
    'dWJsaXNoZWQgcmVmZXJlbmNlcyAoaW5mb3JtYXRpb25hbCkg4pSA4pSA4pSA4pSAJyk7CiAgY29u',
    'c29sZS5sb2coYCAgRW5naW5lIE9PSVAgKENUIGFxdWlmZXIgKyBIYXZsZW5hLU9kZWgpOiAke29v',
    'aXBfbW1zdGIudG9GaXhlZCgxKX0gTU0gU1RCYCk7CiAgY29uc29sZS5sb2coYCAgRGFrZSB0cnV0',
    'aCAoZ2l2ZW4gaW5wdXQgKyB2ZXJpZmllZCk6ICAgICAke0RBS0VfQ1RfUkVTRVJWT0lSLmRha2Vf',
    'Tl90cnV0aF9tbXN0Yn0gTU0gU1RCYCk7CiAgY29uc29sZS5sb2coYCAgRGFrZSBMU1Egb24gaGlz',
    'IGV4YWN0IEh2RSBXZSB2YWx1ZXM6ICAgICAke0RBS0VfQ1RfUkVTRVJWT0lSLmRha2VfTl9sc3Ff',
    'aHZlX21tc3RifSBNTSBTVEJgKTsKICBjb25zdCBkYWtlX2VyciA9IE1hdGguYWJzKG9vaXBfbW1z',
    'dGIgLSBEQUtFX0NUX1JFU0VSVk9JUi5kYWtlX05fdHJ1dGhfbW1zdGIpCiAgICAgICAgICAgICAg',
    'ICAgICAvIERBS0VfQ1RfUkVTRVJWT0lSLmRha2VfTl90cnV0aF9tbXN0YiAqIDEwMDsKICBjb25z',
    'b2xlLmxvZyhgICBFbmdpbmUgdnMgRGFrZSB0cnV0aDogICAgICAgICAgICAgICAgICAgICR7ZGFr',
    'ZV9lcnIudG9GaXhlZCgyKX0lIGRldmlhdGlvbmApOwogIGNvbnNvbGUubG9nKGAgIEV4cGVjdGVk',
    'IENUIHZzIEh2RSBtZXRob2Qgc3ByZWFkOiAgICAgICAgMi01JSBvbiBPT0lQIChtb3JlIGF0IGVh',
    'cmx5IHRpbWUgb24gV2UpYCk7CiAgY29uc29sZS5sb2coJycpOwoKICBjb25zb2xlLmxvZygn4pSA',
    '4pSA4pSAIERyaXZlIEluZGV4IEJyZWFrZG93biBhdCBmaW5hbCB0aW1lc3RlcCAoaW5mb3JtYXRp',
    'b25hbCkg4pSA4pSA4pSA4pSA4pSAJyk7CiAgY29uc29sZS5sb2coYCAgRERJOiAkeyhyZXN1bHQu',
    'ZmluYWxfZGRpID8/IDApLnRvRml4ZWQoMyl9ICAgIChkZXBsZXRpb24gZHJpdmUg4oCUIG9pbCBl',
    'eHBhbnNpb24pYCk7CiAgY29uc29sZS5sb2coYCAgV0RJOiAkeyhyZXN1bHQuZmluYWxfd2RpID8/',
    'IDApLnRvRml4ZWQoMyl9ICAgICh3YXRlciBkcml2ZSDigJQgcHJpbWFyeSBmb3IgdGhpcyBjYXNl',
    'KWApOwogIGNvbnNvbGUubG9nKGAgIFNESTogJHsocmVzdWx0LmZpbmFsX3NkaSA/PyAwKS50b0Zp',
    'eGVkKDMpfSAgICAocm9jayt3YXRlciBjb21wcmVzc2liaWxpdHkg4oCUIHNtYWxsKWApOwogIGNv',
    'bnNvbGUubG9nKGAgIEdESTogJHsocmVzdWx0LmZpbmFsX2dkaSA/PyAwKS50b0ZpeGVkKDMpfSAg',
    'ICAoZ2FzIGNhcCDigJQgZXhwZWN0ZWQgMClgKTsKICBjb25zb2xlLmxvZyhgICBTdW06ICR7KHJl',
    'c3VsdC5maW5hbF9kcml2ZV9pbmRleF9zdW0gPz8gMCkudG9GaXhlZCgzKX1gKTsKICBjb25zb2xl',
    'LmxvZygnJyk7CgogIGNvbnNvbGUubG9nKCfilIDilIDilIAgUmVncmVzc2lvbiBhbmQgQXF1aWZl',
    'ciBPdXRwdXRzIOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgCcpOwogIGNvbnNvbGUu',
    'bG9nKGAgIFLCsiAocmVncmVzc2lvbik6ICAgICAgICAgICAke3Jlc3VsdC5yX3NxdWFyZWQ/LnRv',
    'Rml4ZWQoNikgPz8gJ24vYSd9YCk7CiAgY29uc29sZS5sb2coYCAgRGF0YSBwb2ludHMgdXNlZDog',
    'ICAgICAgICAgJHtyZXN1bHQubl9kYXRhX3BvaW50cyA/PyAnbi9hJ31gKTsKICBjb25zb2xlLmxv',
    'ZyhgICBDdW11bGF0aXZlIFdlIChmaW5hbCk6ICAgICAkeygocmVzdWx0LmZpbmFsX2N1bXVsYXRp',
    'dmVfd2VfcmIgPz8gMCkvMWU2KS50b0ZpeGVkKDIpfSBNTSByYiAgKERha2UgcmVEPTU6IDg5LjIg',
    'TU0gcmIpYCk7CiAgY29uc29sZS5sb2coYCAgRW5naW5lIHJlRCBpbnB1dDogICAgICAgICAgJHtE',
    'QUtFX0NUX1JFU0VSVk9JUi5hcXVpZmVyX2RpbV9yYWRpdXNfcmF0aW99YCk7CiAgY29uc29sZS5s',
    'b2coYCAgRW5naW5lIGVuY3JvYWNobWVudDogICAgICAgJHtEQUtFX0NUX1JFU0VSVk9JUi5hcXVp',
    'ZmVyX2VuY3JvYWNobWVudF9hbmdsZV9kZWd9wrBgKTsKICBjb25zb2xlLmxvZygnJyk7CgogIGNv',
    'bnNvbGUubG9nKCfilIDilIDilIAgRW5naW5lIFdhcm5pbmdzIOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gCcpOwogIGlmIChyZXN1bHQud2FybmluZ3MubGVuZ3RoID09PSAwKSB7CiAgICBjb25zb2xlLmxv',
    'ZygnICAobm9uZSknKTsKICB9IGVsc2UgewogICAgcmVzdWx0Lndhcm5pbmdzLmZvckVhY2goKHcp',
    'ID0+IGNvbnNvbGUubG9nKGAgIOKAoiAke3d9YCkpOwogIH0KICBjb25zb2xlLmxvZygnJyk7Cgog',
    'IGNvbnNvbGUubG9nKCfilIDilIDilIAgRW5naW5lIERpYWdub3N0aWNzIOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKU',
    'gOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgOKUgCcp',
    'OwogIGNvbnNvbGUubG9nKGAgIERyaXZlIG1lY2hhbmlzbTogICAgICAgJHtyZXN1bHQuZHJpdmVf',
    'bWVjaGFuaXNtfWApOwogIGNvbnNvbGUubG9nKGAgIEFxdWlmZXIgc3RyZW5ndGg6ICAgICAgJHty',
    'ZXN1bHQuYXF1aWZlcl9zdHJlbmd0aH1gKTsKICBjb25zb2xlLmxvZyhgICBWYWxpZGF0aW9uIHRp',
    'ZXI6ICAgICAgICR7cmVzdWx0LnZhbGlkYXRpb25fdGllciA/PyAnbi9hJ31gKTsKICBjb25zb2xl',
    'LmxvZygnJyk7Cn0K'
  ].join('');

function md5(buf) {
  return crypto.createHash('md5').update(buf).digest('hex');
}

function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' Dake Exercise 9.2 — oil + Carter-Tracy aquifer validation');
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

  // Idempotency
  if (original.includes(IDEMPOTENCY_MARKER)) {
    console.log('');
    console.log('✓ Already patched (runCarterTracyOilCase found in file).');
    console.log('  No changes made.');
    process.exit(0);
  }

  // Sentinel uniqueness
  const occurrences = original.split(INSERT_AFTER).length - 1;
  console.log('Sentinel "  await runGasCapDriveOilCase();" occurrences: ' + occurrences);

  if (occurrences === 0) {
    console.error('');
    console.error('✗ Sentinel not found.');
    console.error('  This patch requires the Dake gas-cap patch to have been applied.');
    console.error('  Run 2026-05-17_mbal_validation_dake_gascap.cjs first.');
    process.exit(1);
  }
  if (occurrences > 1) {
    console.error('');
    console.error('✗ Sentinel matched ' + occurrences + ' times. Aborting.');
    process.exit(1);
  }

  const validationCase = Buffer.from(VALIDATION_CASE_B64, 'base64').toString('utf-8');

  const insertionInMain = [
    '',
    '  // ─────────────────────────────────────────────────────────────────────',
    '  // CASE 2C — Dake Exercise 9.2: oil + Carter-Tracy aquifer',
    '  // (Wedge-shaped reservoir, 140° encroachment, strong natural water drive)',
    '  // Engine uses Carter-Tracy; Dake uses Hurst-van Everdingen. Method spread',
    '  // is well-known (1-5% on We); validation tolerance widened to ±10% on OOIP.',
    '  // ─────────────────────────────────────────────────────────────────────',
    "  console.log('');",
    "  console.log('═══════════════════════════════════════════════════════════════════');",
    "  console.log('  CASE 2C — Oil + Carter-Tracy aquifer (Dake Exercise 9.2)');",
    "  console.log('═══════════════════════════════════════════════════════════════════');",
    "  console.log('');",
    '  await runCarterTracyOilCase();',
  ].join('\n');

  const patched = original.replace(
    INSERT_AFTER,
    INSERT_AFTER + insertionInMain + '\n'
  );

  if (patched === original) {
    console.error('✗ str_replace produced no change. Aborting.');
    process.exit(1);
  }

  // Append at end of file
  const fileEnd = patched.endsWith('\n') ? '' : '\n';
  const finalContent =
    patched +
    fileEnd +
    '\n' +
    '// ═══════════════════════════════════════════════════════════════════════════\n' +
    '// Phase 5 third chunk addition (2026-05-17):\n' +
    '// Dake Exercise 9.2 — oil + Carter-Tracy aquifer (strong water drive)\n' +
    '// ═══════════════════════════════════════════════════════════════════════════\n' +
    '\n' +
    validationCase +
    (validationCase.endsWith('\n') ? '' : '\n');

  // Backup
  const stamp = Date.now();
  const backupPath = TARGET + '.bak-' + stamp;
  fs.writeFileSync(backupPath, original);
  console.log('');
  console.log('Backup written: ' + path.basename(backupPath));

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
  console.log('new C-1..C-7 assertions from CASE 2C (Dake Carter-Tracy aquifer).');
  console.log('');
  console.log('Risk warning:');
  console.log('  This patch uses an inferred Carter-Tracy aquifer parameter schema.');
  console.log('  If the engine throws "unknown field" errors on any aquifer_*');
  console.log('  parameter, capture the error and we will iterate on field names.');
  console.log('');
  console.log('Rollback:');
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
