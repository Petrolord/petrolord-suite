-- rb_results: fill final_cdi from the deprecated final_sdi mirror.
--
-- Background: until engines #167 (2026-09-11) the oil path published the rock
-- and connate water expansion term in a field called `sdi`, a name that means
-- gas cap segregation. The rename made `cdi` that term on both fluid systems
-- and left `final_sdi` as a mirror the edge function keeps writing, so a
-- browser still running an older bundle renders.
--
-- The close-out assumed every oil row carried the same number in both columns.
-- It does not: a live probe on 2026-09-11 found 16 result rows, of which ONE
-- has final_sdi set and final_cdi NULL (0 rows disagree where both are set).
-- That row predates the mirror being written. So dropping final_sdi today would
-- lose a drive index rather than a duplicate, and the studio's per-row fallback
-- (plot.cdi ?? plot.sdi) is doing real work for it, not just belt and braces.
--
-- This migration is the FIRST of the two steps that retire the column:
--   1. (here) copy the value across, so the columns genuinely are duplicates.
--   2. (later, separate migration) drop rb_results.final_sdi and stop the edge
--      function writing it — but only once stale service-worker shells have
--      aged out, since an older bundle reads final_sdi and would show a blank
--      drive-index row without it.
--
-- Touches only rows where final_cdi IS NULL, so it cannot overwrite a computed
-- value, and it is idempotent: a second run matches nothing.

update public.rb_results
   set final_cdi = final_sdi
 where final_cdi is null
   and final_sdi is not null;
