# Petrolord HSE — Standalone Application

**Scope document maintained at:** `docs/scope/HSE.md`

**Last meaningful update:** 2026-05-13 (initial scope, post-diagnostic)

**Repository:** `/opt/petrolord-studio/workspaces/dev1/projects/petrolord-hse` (standalone repo, separate from Suite)

**Deployment:** Production at https://hse.petrolord.com. Development container `plstudio-hse-dev` at port 8202.

**Status:** In active production use. Substantial codebase with feature gaps identified pre-Petrolord. Active development through Days 1-7 of rescue sprint (early May 2026); no work since May 9.

---

## 1. What this app is

Petrolord HSE is a comprehensive Health, Safety, and Environment management platform for industrial operations — primarily targeting Nigerian oil & gas operators and their contractors. It is a multi-tenant SaaS application supporting incident reporting, hazard observation, work permit management, risk register, audit tracking, compliance monitoring, contractor management, and HSE analytics.

**Target users:** HSE managers, safety supervisors, field operators, contractors, and executive leadership at upstream oil & gas operators, EPCs, and service companies.

**Key differentiator vs the Suite:** HSE is a **standalone deployable application** with its own marketing site, pricing page, signup flow, and authentication — designed to be sold and deployed independently of the Petrolord Suite engineering tools. Users can adopt HSE without adopting the Suite (and vice versa), though both share the same Supabase project and authentication.

**What it is not:** It is not a native mobile app (responsive web only). It is not currently an offline-capable PWA. It is not yet a workflow customization platform — workflows are largely hardcoded. It does not yet provide predictive analytics or ML-based safety insights, though these are marketing-claimed features.

---

## 2. Scale and scope

**Codebase size:** 57,247 lines of code across 523 files (`src/` only, excluding `node_modules`, build artifacts, and dependencies).

**Component module count:** 28 top-level component categories in `src/components/`. The core HSE feature surface in `src/components/hse/` contains 18 specialized module directories.

**Edge Functions:** 4 deployed (analyze-quick-report, invite-user, log-audit-event, submit-public-observation), with additional shared functions noted in architecture docs (send-email, analyze-image, transcribe-audio, chat-with-petrolord, admin-create-user).

**Architecture pattern:** Single-page application with dynamic module switching. PetrolordHSE.jsx (145 lines) is the authenticated layout shell. The active module is driven by context state (`HSEContext.activeModule`), not URL paths. MainContent component renders whichever module is currently active.

**Public-facing pages:** Full marketing site (HomePage, PricingPage, BenefitPage, TermsOfServicePage, PrivacyPolicyPage, SecurityPage) accessible without authentication.

**Authentication:** SignIn, OrganizationSignup, ForgotPassword, AuthCallback, InvitationAcceptance, SetPassword, ConfirmationPage, RegistrationConfirmation. Public observation tokenized path `/observe/:token` allows non-authenticated submissions.

**Suite integration:** `/suite/*` route mounts SuiteDashboard inside the HSE app, allowing HSE users to access Suite features. Conversely, the Suite app has an HSE route that redirects externally to hse.petrolord.com.

---

## 3. Architecture (per ARCHITECTURAL_ANALYSIS.md, dated Jan 30, 2026)

### 3.1 Multi-tenancy model

**HSE domain is organization-centric:** All HSE data tables (incidents, observations, work_permits, risks, safety_audits, actions, contractors, environment_*) have RLS policies that check `organization_id`. Data is owned by the organization, not the individual user. Pattern: `organization_id IN (SELECT organization_users.organization_id WHERE user_id = auth.uid())`.

**Suite domain (shared database) is user-centric:** Engineering tools tables (econ_*, mem_*, ss_*, petrophysics_*) use ownership-based RLS, with explicit team-access tables for sharing.

**Single Supabase project, two domains.** Both apps share `auth.users`, `organizations`, `organization_users`, `invitations`, `notifications`. Apps are logically separated by table prefixes and RLS patterns.

### 3.2 Authorization

- **Roles:** owner, admin, member, supervisor (HSE-specific)
- **Module access:** Controlled via `modules` array in `organization_users` — checks for 'HSE', 'HSE Premium' for HSE features
- **A user can be admin in one org for HSE and have no Suite access, or vice versa**

### 3.3 Routing (HSE app)

| Route | Component | Purpose |
|---|---|---|
| `/` | HomePage | Public marketing landing |
| `/pricing` | PricingPage | Pricing/plans |
| `/benefits/:slug` | BenefitPage | Feature benefit pages |
| `/privacy-policy`, `/terms-of-service`, `/security` | Legal/info pages | Static |
| `/login` | SignIn | Authentication entry |
| `/signup` | OrganizationSignup | New organization signup flow |
| `/forgot-password`, `/auth/reset-password` | Password flow | Auth lifecycle |
| `/auth/confirm`, `/auth/callback`, `/auth/registration-confirmation` | Email/OAuth callbacks | Auth lifecycle |
| `/accept-invite/:token` | InvitationAcceptance | Team invitation flow |
| `/observe/:token` | PublicObservation | **Public, tokenized observation submission (no auth needed)** |
| `/dashboard/*` | PetrolordHSE (protected) | Main authenticated app shell |
| `/dashboard/analytics/advanced` | AdvancedAnalyticsDashboard (protected) | Premium analytics |
| `/dashboard/super-admin/branding` | SuperAdminBrandingPage (protected) | White-label customization |
| `/suite/*` | SuiteDashboard (protected) | Suite integration view |
| `/organization` | OrganizationSettings (protected) | Org settings |
| `/auditor` | SafetyContentAuditor (protected) | Safety content audit tool |

### 3.4 Module switching pattern

The 18+ HSE modules are not separate routes. They are switched via `HSEContext.setActiveModule()`. State is persisted in `AppStateContext` to survive page refreshes. LeftNav component drives module selection. MainContent renders the active module.

**Architectural tradeoff:** This pattern is good for app-feel UX (no page reload, smooth transitions) but bad for shareable deep links (you can't link directly to "incident #1234 detail page" without additional work).

---

## 4. Feature modules (18 in `src/components/hse/`)

### 4.1 Core reporting flow
| Module | Status from audit | Notes |
|---|---|---|
| IncidentsModule | Mostly developed (85%) | Core submission works; offline mode missing |
| ObservationsModule | Implied via reports | Observation submission feature |
| QuickReport | Built | Streamlined reporting flow |
| QuickReportSteps (subdir) | Built | Step-by-step wizard for quick reports |
| QuickReportPreview | Built (rescue sprint touch — backup May 9) | Touched during Days 1-7 |
| QuickReportSuccess | Built | Success page after report submission |
| ReportWizard | Built (778 lines, technical debt) | Full report wizard; flagged for refactoring |
| ReportTemplates | Built | Pre-defined report templates |
| MyReportsModule | Built | User's own report history |

### 4.2 Hazard management
| Module | Status | Notes |
|---|---|---|
| Risk (subdir) | Fully developed (90%) | Risk register, matrix, probability/impact scoring |
| WorkPermitsModule | Built | Permit-to-work system |
| Permits (subdir) | Built | Permit-related sub-components |
| ActionTrackingModule | Built | Corrective/preventive actions tracking |
| Actions (subdir) | Built | Action-related sub-components |
| SecurityModule | Built | Security-related HSE module |

### 4.3 Specialized hazards (likely partial implementations)
| Module | Status | Notes |
|---|---|---|
| Fire (subdir) | Unknown | Fire safety module |
| Spill (subdir) | Unknown | Spill management |
| Health (subdir) | Unknown | Occupational health |
| Environment (subdir) | Unknown | Environmental monitoring |

### 4.4 Team and contractor
| Module | Status | Notes |
|---|---|---|
| Contractor (subdir) | Built | Contractor management |
| SupervisorDashboardModule | Built (rescue sprint focus — backup v1, v2, v3) | Heavy iteration during Days 1-7 |
| Supervisor (subdir) | Built | Supervisor-specific sub-components |
| Team (subdir) | Built | Team management |
| Training (subdir) | Unknown | Training tracking |

### 4.5 Compliance and audit
| Module | Status | Notes |
|---|---|---|
| Audit (subdir) | Built | Internal audit module |
| Admin (subdir) | Built | HSE admin features |
| ComplianceTab (in compliance/) | Partial (40%) | Rules defined; no auto-checking logic |

### 4.6 Engagement
| Module | Status | Notes |
|---|---|---|
| LeaderboardModule | Built | Gamified safety leaderboard |
| Leaderboard (subdir) | Built | Sub-components |
| Safety-moments (subdir) | Built | Daily safety moments feature |

### 4.7 Analytics
| Module | Status | Notes |
|---|---|---|
| HSEDashboard | Built | Main HSE dashboard |
| HSEDashboardClean | Built | Alternative dashboard view |
| Analytics (subdir + IncidentsAnalytics) | Partial (60%) | Basic Recharts visualizations; predictive AI is aspirational |
| AdvancedAnalyticsDashboard (page-level) | Built | Premium analytics view |

### 4.8 Onboarding
| Module | Status | Notes |
|---|---|---|
| OrganizationSetup | Built | Initial org setup flow |
| OrganizationSetupAdvisory | Built | Setup guidance |
| SetupRequiredModal | Built | Setup completion prompt |

---

## 5. Known gaps (per AUDIT_REPORT.md, December 2025)

The pre-Petrolord audit identified specific gaps between marketing claims and technical reality. The accuracy of these gap percentages should be re-verified, but the categories likely still apply.

| Feature claimed in marketing | Actual status | Gap |
|---|---|---|
| **Real-time incident reporting** | 85% | Offline mode missing. "Real-time" uses useEffect polling, not WebSocket subscriptions. |
| **Comprehensive risk assessment** | 90% | Mostly complete. Template Library is hardcoded options vs database-driven. |
| **Automated compliance tracking** | 40% | `compliance_rules` table exists but no scanning logic. No Edge Function or DB trigger to auto-flag violations. |
| **Team collaboration** | 50% | User roles work; real-time chat/feed missing. |
| **Data-driven safety analytics** | 60% | Basic charts work; "predictive AI" is marketing-only, no ML implementation. Custom dashboard widgets (drag-and-drop) don't exist. |
| **Mobile-first accessibility** | 70% | Responsive Tailwind works; no PWA, no Service Worker, no offline. Native camera/GPS access not integrated beyond HTML5. |
| **Customizable workflows** | 20% | Hardcoded workflows in ReportWizard. No drag-and-drop workflow editor. |
| **Integration capabilities** | 30% | `integration_connections` table exists; frontend configuration minimal. |

---

## 6. What Days 1-7 rescue sprint (early May 2026) accomplished

**Confirmed touches based on backup file evidence:**

| File | Backup timestamps | Inference |
|---|---|---|
| App.jsx | 2026-05-09 backup | Routing or core app changes |
| HSEDashboard.jsx | 2026-05-09 (orgsetup) | Organization setup flow integration |
| QuickReportPreview.jsx | 2026-05-09 | Quick report preview iteration |
| SupervisorDashboardModule.jsx | 2026-05-07 v1, 2026-05-09 v2, 2026-05-09 v3 | Heavy iteration — three backup versions in three days indicates intensive work |

**Important uncertainty:** The exact nature of these changes (what was fixed, what was added, what broke) is not captured in this scope document because the context isn't currently available. **A future session should reconcile this** — ideally by reading git history or comparing the May 9 versions against the April 18 baseline backup.

**Tar.gz backup at parent level:** `hse-pre-wipe-backup-2026-05-06.tar.gz` (58 MB) indicates a significant restoration event around May 6. This should be investigated — the name "pre-wipe" suggests data loss preceded the rescue sprint.

**No development activity since May 9, 2026.** All files in `src/` have May 9 or earlier timestamps.

---

## 7. Operational risks (current state)

### 7.1 Schema not version-controlled in repo
`supabase/migrations/` directory is empty. Schema lives only in the Supabase project. This means:
- No way to recreate the database from the repo
- No easy onboarding for new developers
- Schema drift between environments is silent
- Rollback requires Supabase point-in-time recovery

**Priority for remediation:** Medium-high. Should be addressed before production marketing push.

### 7.2 Multiple .backup files in working tree
SupervisorDashboardModule has THREE backups (v1, v2, v3) sitting in the source directory. This indicates a workflow without proper version control discipline during the rescue sprint. These should be cleaned up — they confuse readers and add noise to file searches.

### 7.3 "Lordsway Energy" branding in production
PetrolordHSE.jsx footer: `© 2025 Lordsway Energy. All Rights Reserved.` This is white-label branding for a specific customer. If the production deployment serves multiple orgs, this hardcoded footer is wrong. Check whether SuperAdminBrandingPage allows per-org footer customization that's reading from somewhere else.

### 7.4 Marketing claims that don't match technical reality
The audit identified this clearly. **Live marketing pages should be reviewed against actual feature status before any external marketing push.** Specifically:
- Offline mode claims (not implemented)
- AI/Predictive Safety claims (not implemented)
- Drag-and-drop dashboards (not implemented)
- Workflow customization (not implemented)

Misleading marketing is a legal and reputational risk.

---

## 8. Architectural decisions worth preserving

These choices reflect deliberate design that should not be casually reversed:

1. **Standalone deployment.** HSE is its own app with its own URL (hse.petrolord.com), its own marketing site, its own signup. This lets it be sold independently of the Suite, expanding the addressable market.

2. **Multi-tenant org-centric data model.** RLS via `organization_id` is the right pattern for B2B HSE (companies share safety data internally; not across companies).

3. **Public observation pathway.** `/observe/:token` enabling non-authenticated submissions is a real industry differentiator — contractor crews on a worksite don't have time to sign up. This must be preserved and protected against abuse (rate limiting, spam prevention).

4. **Dynamic module switching over URL routes.** Tradeoff acknowledged in §3.4. The pattern matches SaaS dashboards (Salesforce, Hubspot, Intercom). Don't restructure to URL-routed modules unless there's a clear deep-linking requirement.

5. **Shared Supabase auth with the Suite.** A user can use both apps with one login. Don't fork this.

6. **Super-admin branding (SuperAdminBrandingPage).** White-label capability for resellers/large customers. Strategically valuable for sales conversations.

7. **Gamification module (Leaderboard, Safety Moments).** HSE engagement is a known industry problem. Gamification differentiates from sterile competitors.

---

## 9. What to build / fix / decide

### 9.1 High priority (production correctness)
- **Schema-as-code:** Export current schema as migration files, version-control them. Establish ongoing migration discipline.
- **Cleanup .backup files** in working tree. Move to `archive/` or delete.
- **Investigate May 6 "pre-wipe" tar.gz:** What event preceded it? Is there data loss to recover?
- **Reconcile marketing claims vs reality:** Either build the missing features or correct the marketing.

### 9.2 Conference-relevant (May 19 Ghana AETC)
- **Verify production deployment health** at hse.petrolord.com. Are there bugs in supervisor dashboard or other rescue-sprint-touched areas?
- **Prepare demo flow** that emphasizes what genuinely works (incident reporting, risk register, public observations) and skirts what doesn't (predictive AI, offline mode).
- **Lordsway Energy footer in PetrolordHSE.jsx** — confirm whether this is the right branding for the conference demo or needs to be generalized.

### 9.3 Closing gaps from December 2025 audit (post-conference)
In priority order from the original DEVELOPMENT_PLAN.md, with current applicability:

**Sprint 1 — PWA & live data (likely still relevant):**
- Add `manifest.json`, configure Vite PWA plugin, "Add to Home Screen"
- Replace useEffect polling with `supabase.channel` realtime subscriptions on IncidentsList
- Mobile UI polish: bigger touch targets, direct camera access (`capture="environment"`)

**Sprint 2 — Automation & compliance (highest value):**
- Edge Function `handle-new-incident` for auto-notifying safety managers on high-severity incidents (Resend/Brevo)
- DB trigger to check `compliance_rules` on work permit creation
- This is the gap most likely to embarrass the team during sales conversations

**Sprint 3 — Analytics & trust:**
- PDF/Excel export from IncidentsList (jsPDF or csv-downloader)
- Simple linear regression for trend lines (minimal "predictive" feature)

**Sprint 4 — Customizable workflows (long-term):**
- `workflow_definitions` table
- Refactor ReportWizard (778 lines) into JSON-driven dynamic steps

### 9.4 Open strategic questions
1. **Should the schema-as-code work happen NOW (pre-conference) or AFTER?** Trading off short-term risk against time pressure.
2. **What's the production deployment cadence?** Days 1-7 work — was it deployed? Or is it still on staging?
3. **Pricing page accuracy:** Does the pricing page match what's actually sellable today, or does it list features that don't work?
4. **Should compliance automation be the post-conference priority?** It's the highest-leverage gap (40% complete on a "high priority" feature per the audit).
5. **PWA / offline mode:** Field operators in oil & gas regularly work in zones with poor connectivity. Offline is genuinely important to the value proposition. Should it be the priority?

---

## 10. Validation status

| Component | Validation status |
|---|---|
| Core CRUD on incidents, observations, risks | ✓ Works (used in production) |
| Multi-tenant RLS isolation | ✓ Designed correctly per architecture doc |
| Authentication and invitation flows | ✓ Used in production |
| Public observation tokenized submission | ✓ Endpoint exists |
| Automated compliance checking | ✗ Not implemented |
| Realtime updates | ✗ Polling, not subscriptions |
| Offline / PWA | ✗ Not implemented |
| AI / Predictive analytics | ✗ Marketing-only |
| Mobile native features | ✗ Browser-default only |
| Workflow customization | ✗ Hardcoded |
| Schema version control | ✗ Not in repo |

---

## 11. Quick orientation for future-us

If you're picking up HSE work:

1. **Read this document end-to-end** (~15 minutes)
2. **Read the three Horizons-era docs** in `src/ARCHITECTURAL_ANALYSIS.md`, `src/AUDIT_REPORT.md`, `src/DEVELOPMENT_PLAN.md`. They predate Petrolord but the architectural analysis is still accurate.
3. **Check production health** at https://hse.petrolord.com before touching anything. Confirm at least the core flow (signup → create incident → view dashboard) works.
4. **Check the dev container** at port 8202 (`plstudio-hse-dev`). Confirm it boots cleanly with `docker logs plstudio-hse-dev`.
5. **For new feature work:** Start with the December 2025 audit gaps in priority order (compliance automation is highest leverage). Don't add features without first closing the gap between marketing claims and reality.
6. **For schema work:** Step zero is exporting current schema to versioned migration files. Don't make schema changes via Supabase Studio without simultaneously committing a migration.
7. **For routing/URL work:** Decide consciously whether to keep the module-switching pattern or move to URL-routed modules. Both are valid; switching costs are high.

---

## 12. Why this matters

HSE is the only Petrolord application that is currently sold and deployed externally. It pays the bills. Reservoir Balance and EPE are credibility-builders for the Suite; HSE is the revenue-generating product. Therefore:

- Production correctness matters more than for the other apps
- Marketing accuracy matters more (legal/reputational risk)
- Sales-readiness matters more (conference demos, customer onboarding)
- Schema discipline matters more (real customer data lives here)

A misleading marketing claim on EPE costs us credibility. A misleading marketing claim on HSE could cost us a customer or worse.

When the December 2025 audit gaps are closed, when schema is version-controlled, when the marketing matches reality, **HSE becomes a credible Nigerian-market alternative to Intelex, EHS Insight, or Velocity EHS** — at a fraction of the cost, with localization advantages (regulatory familiarity, contractor management patterns matching local practice).

That's the strategic prize. Worth doing right.

---

## 13. Document maintenance

- After each closure of a gap from §5/§9, mark complete in §10 and add to "What is BUILT" sections
- After conference, update with feedback received
- Quarterly review minimum
- Schema-as-code milestone should trigger a rewrite of §3 to reference specific tables

---

_Document maintained by the active development team. Last full review: 2026-05-13. Significant context uncertainty in §6 (Days 1-7 work nature) — should be reconciled in a future session with git history available._
