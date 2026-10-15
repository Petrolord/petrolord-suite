
## QI Studio round 3 (owner OK 2026-10-15, without Volve or client data)

Owner, 2026-10-15: "Can we proceed with the remaining feature developments of QI Studio without the Volve data? ... before then I want to see some more progress." The same day the owner dropped the rule that tabs, default views and test ids stay unchanged ("Further development and improvements will be a constant in this platform"); demo-account data stays untouched.

### R3.1 Prestack conditioning (the Q5 remainder; closes U2-001 in part and U2-005)
- **Engines #377 `qi/prestackConditioning.js`:**
  - `radonDemultiple`: parabolic Radon (Hampson 1986) with AVO terms, so each moveout carries an intercept and a gradient (Ng and Perz 2004). High resolution by sparse reweighting along q (Sacchi and Ulrych 1995), solved by warm-started conjugate gradients on the block Toeplitz normal equations (Levinson for the plain least-squares case). Overlapping 300 ms windows at 75 percent overlap, normalised to sum to one. The multiples (q at or above the cut, in ms at the far offset) are rebuilt and subtracted, so the primaries never pass through the transform.
  - `fxDecon`: f-x prediction (Canales 1984), forward and backward, in 200 ms windows.
  - `shapingOperator` / `applyShaping` / `meanAmplitudeSpectrum`: one zero-phase operator per stack, from its mean spectrum to a target (another stack's, or flat in a band), with the boost capped and the stack's band energy kept.
- **Gates (16; synthetic gather with 31 offsets, three AVO primaries and three parabolic multiples, one starting on a primary):**
  - over 20 dB of multiple energy removed;
  - isolated primaries: A within 2 percent, B within 5;
  - the primary under a multiple: A within 6 percent, B within 14 (over 40 percent before);
  - negative controls: plain least-squares Radon biases B by over 25 percent; a cut below q = 0 removes the primaries; re-breaking the gradient term fails 2 gates;
  - f-x: noise-free A within 1 percent; S/N gain of 4.5 dB or more with intercept bias within 4 percent over 10 realisations; an over-damped filter loses over 20 percent (negative control);
  - shaping: a 20 Hz far stack given the 35 Hz near bandwidth raises its correlation with the truth from under 0.75 to over 0.94; a trace twice as bright stays exactly twice as bright; per-trace balancing equalises it (negative control).
- **Worker kinds (#1169):**
  - `radon_demultiple` and `fx_denoise` (`conditionGathers.js`): each NMO-corrected gather of a store is conditioned across its offset bins into a new store beside the input. Options: the removed part as a third store, and an inline and crossline area (CDPs outside are left out). The result gives the energy removed per quarter of the trace and the seconds per gather.
  - `spectral_balance` (`balanceStacks.js`): derived volumes `qi_balanced_stack`, offered as study stacks.
  - Gated through the real `ingest_gathers` on a synthetic prestack SEG-Y:
    - over 15 dB of multiples removed;
    - isolated primaries: A within 2 percent, B within 5;
    - the primary under a multiple: A within 6, B within 14;
    - input = output + removed, sample by sample;
    - negative control: a cut above the multiples removes under 3 dB;
    - f-x at S/N about 6 dB: over 4 dB of gain, intercepts within 7 percent;
    - balancing: correlation with the truth from under 0.8 to over 0.93, the centroid closes over 80 percent of the gap, the bright trace stays twice as bright; negative control: a narrow flat band misses the truth.
- **QI Studio:**
  - Prestack tab: Conditioning: multiples and noise (Radon or f-x, the settings, an area, keep what was removed, a table of the runs per quarter of the trace).
  - AVO tab: Balance the spectra, before Match the stacks (a table of band centroid and half-power band, and a chart of the operators).
  - Gathers tab: a store's conditioned copies, or its source, can sit beside it.
  - The report gets both tables, the decision register lists the runs, and the help covers both.
- **Live check (worker suite-ac2f18e13, QA account, 576 synthetic CDPs uploaded through Seismolord's upload path):** `radon_demultiple` took 0.79 s per gather (7.7 minutes in all). It removed 49 and 53 percent of the energy in the two windows holding the multiples, and under 1 percent in the windows with primaries only. Panel read-back: see R3.6.
- **Decisions:**
  - Conditioning writes new stores and never changes the input.
  - f-x works across offsets within a gather. Common-offset f-x across CDPs, and structure-oriented filtering, are deferred.
  - Radon is about a second per gather, so the area option is the pilot.
  - Balancing keeps each stack's band energy; Match the stacks then sets time, phase and scale.

### R3.4 Tie quality: Phase along the tie (engines #378, Suite #1170)
- `seismolord/tiePhase.js`: the constant phase in 300 ms windows (every 100 ms; exact window correlations from the whole-trace Hilbert transform, in the tieWarp convention), a correlation-weighted straight-line drift, the time-variant rotation, and the check: offered when the drift reaches 30 degrees and the correlation rises by 0.03 or more.
- Seismolord Synthetics has a Phase along the tie button, with an option to apply the time-variant phase to the display. The committed tie's QC keeps `phase_trend`. In QI Studio, Ties gets a Phase drift column, and a drift of 45 degrees or more is a medium issue.
- Gates: a known 10 to 70 degree drift is measured within 6 degrees per window. The time-variant phase gains over 0.03 of correlation for 60 degrees of drift and over 0.12 for 120. Negative controls: a constant phase is not offered; noise offers nothing; flipping the Hilbert sign fails the gates.
- **Decision:** a display and QC aid. Inversion keeps one wavelet per well or stack; a drifting tie is flagged so the target window is tied on its own.

### R3.6 Worker links for the browser (#1172; found by the live check)
- The worker signed the links it hands to the browser (the gather panel, the SEG-Y export) for its internal endpoint, http://seaweedfs:8333. The browser cannot resolve that host, so the Gathers tab and the SEG-Y export download never opened in production.
- `makeLinkSigner` signs those two links for `S3_PUBLIC_ENDPOINT` (storage.petrolord.com); the worker's own reads and writes stay internal. They are the only signed URLs the worker returns: report PDFs and wavelet text are made in the browser, zone maps and pilot volumes are read through Supabase storage, and uploads are presigned by the edge function for the public host.
