-- Drop the read-only membership compat views organization_users /
-- org_members — the pre-approved follow-up to the membership
-- consolidation (20260713300000, PR #63 second-engineer review), which
-- kept them alive only for the then-deployed prod SPA. The 2026-07-14
-- prod upload (main 7bdb7601c) removed the last frontend readers.
--
-- Verified live before drafting: no dependent view rules or policies;
-- the only textual references left are comments inside
-- handle_new_user()/handle_new_user_profile(), and the drilling
-- module's own petrolord.org_members table (a real table, explicitly
-- out of scope — every policy qualifies it petrolord.org_members).
--
-- Also clears PR #63 review finding R2: the admin pages'
-- users(email) embed 404'd through the view on old prod code.

drop view if exists public.organization_users;
drop view if exists public.org_members;
