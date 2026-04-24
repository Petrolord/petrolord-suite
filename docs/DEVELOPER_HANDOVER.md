
# DEVELOPER HANDOVER DOCUMENTATION: Petrolord Suite
**READY FOR HANDOVER: 2026-04-18**

---

## SECTION 1: EXECUTIVE SUMMARY

### Application Name & Purpose
**Petrolord Suite** is the "Digital Operating System for the Modern Energy Enterprise." It serves as a unified SaaS platform connecting subsurface intelligence, operational efficiency, and commercial strategy. It centralizes over 70+ highly specialized applications across Geoscience, Reservoir Engineering, Drilling, Production, Economics, Facilities, and Assurance (HSE).

### Current Status
- **Environment:** Production / Active Development
- **Version:** `4.0.0` (Refer to `package.json`)
- **Recent Activity:** Implementation of advanced modules (EarthModel Pro Phase 4, Casing & Tubing Design Pro, Facility Network Hydraulics, and extensive HSE/Assurance modules).
- **Deployments:** Continuous deployments via custom Vite build scripts (`npm run build:fast`, `npm run deploy:phase4`).

### Key Statistics
- **Applications:** 70+ core apps registered in `master_apps`.
- **Active Tenants/Organizations:** 50+ Global Companies.
- **Reliability Target:** 99.9% Uptime.
*(Note: Live counts for users, orgs, and module usage can be viewed dynamically in the `/admin/system-health` and `/dashboard/analytics` routes).*

### Critical Systems
1. **Supabase Auth & RLS:** Core security perimeter determining tenant data isolation.
2. **Master App Registry:** Dictates access and module visibility (`master_apps` & `purchased_modules`).
3. **Petrolord HSE:** A tightly integrated suite for Assurance & Compliance.
4. **Quote & Billing Engine:** Handles enterprise quoting, Paystack integration, and subscription lifecycles.

---

## SECTION 2: TECHNOLOGY STACK

### Frontend Core
- **Framework:** React `^18.2.0`
- **Routing:** React Router DOM `^6.16.0`
- **Build Tool:** Vite `^4.4.5`
- **State Management:** React Context API (Auth, Impersonation, Integration, multiple app-specific contexts)

### UI & Styling
- **CSS Framework:** TailwindCSS `^3.3.3`
- **Component Library:** shadcn/ui (Radix UI Primitives)
- **Icons:** Lucide React `0.292.0`
- **Animations:** Framer Motion `^10.16.4`
- **Data Visualization:** Recharts, Chart.js, D3.js, ECharts
- **Mapping/3D:** Leaflet, MapLibre, Deck.gl, vtk.js

### Backend & Platform
- **Database:** PostgreSQL 15+ (Hosted on Supabase)
- **Authentication:** Supabase Auth (JWT, Row Level Security)
- **Serverless/API:** Supabase Edge Functions (Deno)
- **Storage:** Supabase Storage (S3-compatible buckets like `seismic`, `ss-assets`, `quotes`)

### Integrations & Tooling
- **Email Provider:** Brevo (SMTP) & Resend (API) via Supabase Secrets and `send-email` Edge Function.
- **Payment Gateway:** Paystack (`react-paystack`)
- **Linting:** ESLint (`eslint-config-react-app`)
- **PDF Generation:** jsPDF, html2canvas

---

## SECTION 3: USER REGISTRATION & ONBOARDING FLOW

### The Flow Step-by-Step
1. **Signup (`/signup`):** User provides Organization Name, Full Name, Email, and Password.
2. **Auth Creation:** App calls `supabase.auth.signUp`. User metadata includes `role: 'owner'` and `organization_name`.
3. **Database Trigger:** A PostgreSQL trigger (`handle_new_user`) intercepts the creation, automatically provisioning records in `organizations`, `users`, `organization_users`, and `user_profiles`.
4. **Email Verification:** Supabase sends a confirmation email.
5. **Confirmation (`/auth/confirm`):** User clicks link, authenticates, and is routed to login or dashboard.
6. **Profile Completion (`/set-password`):** For invited users, they set their password and display name here.

### Logic Snippet (`src/pages/Signup.jsx`)
