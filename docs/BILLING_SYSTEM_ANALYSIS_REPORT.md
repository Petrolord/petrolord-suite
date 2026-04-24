# Comprehensive Billing & Subscription System Analysis Report

**Date:** 2026-02-03
**Scope:** Quote Builder, Payment Processing, Verification, App Assignment, Billing & Subscriptions, Customer Portal, Database Schema.

---

## 1. File Map & Architecture Overview

This section maps functional areas to specific files in the codebase, explaining their roles.

### **A. Quote Builder & Configuration**
*   **Frontend Page:** `src/pages/QuoteBuilder.jsx`
    *   *Role:* Main interface for selecting modules, apps, seats, and billing terms. Handles catalog fetching, pricing calculation, and quote generation logic.
*   **Utilities:**
    *   `src/utils/billingEngine.js`: Core logic for calculating subscription costs (tiers, discounts, VAT).
    *   `src/utils/quotePdfGenerator.js`: Generates the PDF document for quotes using `jspdf` or `pdf-lib`.
    *   `src/lib/pdfUtils.js`: Helper functions for PDF generation (headers, footers, tables).
    *   `src/data/pricingModels.js`: Static configuration for pricing tiers, base fees, and billing periods.
*   **Database:**
    *   `quotes` table: Stores generated quotes (status: 'PENDING', 'ACCEPTED', etc.).
    *   `master_apps` table: Source of truth for application catalog and pricing.
    *   `modules` table: Defines core domains (Geoscience, Reservoir, etc.).

### **B. Payment Processing & Verification**
*   **Frontend Pages:**
    *   `src/pages/Payment.jsx`: UI for collecting payment details (mock or integrated).
    *   `src/pages/PaymentVerification.jsx`: Handles the redirect from payment gateway (Paystack), verifying transaction reference.
*   **Backend / Edge Functions:**
    *   `verify-paystack-payment` (Edge Function): Server-side logic to verify payment with Paystack API and trigger provisioning.
    *   `process-paystack-payment` (Edge Function): Initiates payment transactions.
*   **Database:**
    *   `payments` table: Records transaction details, references, and status.
    *   `transactions` table: Ledger of financial movements linked to invoices.

### **C. App Assignment & Entitlements**
*   **Frontend Components:**
    *   `src/pages/SubscriptionManagement.jsx`: Admin UI to view active apps and manage seat assignments.
    *   `src/components/ReassignSeatModal.jsx`: Modal for transferring admin seats.
    *   `src/utils/seatUtils.js`: Logic to calculate available vs. used seats.
*   **Backend / Edge Functions:**
    *   `assign-app-to-user`: Edge function to grant access.
    *   `remove-member-from-app`: Edge function to revoke access.
    *   `get-app-seat-usage`: Logic to count active seats per app/org.
*   **Database:**
    *   `purchased_modules`: Tracks entitlements at the org level (expiry, seat limits).
    *   `app_seat_assignments`: Maps specific users to specific apps (the "seat").
    *   `organization_users`: Defines user membership in the org.

### **D. Billing & Subscription Management**
*   **Frontend Pages:**
    *   `src/pages/SubscriptionHistory.jsx`: View past invoices and payment history.
    *   `src/pages/RenewSubscription.jsx`: Workflow for renewing expiring modules.
    *   `src/pages/SubscriptionUsageAnalytics.jsx`: Visualizations of usage vs. limits.
*   **Components:**
    *   `src/components/SubscriptionStatusBadge.jsx`: Visual indicator of active/expired states.
    *   `src/components/RenewalReminderBanner.jsx`: Alert for upcoming expirations.
*   **Database:**
    *   `subscriptions`: High-level contract terms (start/end dates, overall status).
    *   `invoices`: Generated bills linked to subscriptions.
    *   `billing_reports`: Aggregated data for admin reporting.

### **E. Customer Self-Service Portal**
*   **Frontend:**
    *   `src/pages/dashboard/`: Various dashboard views (Geoscience, Reservoir, etc.) act as the portal entry.
    *   `src/components/UpgradeSuiteButton.jsx`: CTA for upselling/cross-selling.
*   **Logic:**
    *   `src/contexts/SupabaseAuthContext.jsx`: Handles user authentication state.
    *   `src/hooks/useAppAccess.js` / `src/hooks/usePurchasedModules.js`: Hooks to check what a user can access.

---

## 2. Feature Inventory & Status

| Feature | Status | Implementation Details | Issues / Missing |
| :--- | :--- | :--- | :--- |
| **Quote Generation** | **High** | `QuoteBuilder.jsx` has robust logic for tiers, bundles, and discounts. PDF generation is implemented. | "Contact Sales" is a modal, not fully integrated with CRM. Catalog fetching relies on a mix of DB and static files. |
| **Payment Gateway** | **Partial** | Paystack integration references exist (`verify-paystack-payment`), UI exists (`PaymentVerification.jsx`). | Actual payment *initiation* flow often relies on external links. Stripe/others not found. |
| **Verification Logic** | **Partial** | `PaymentVerification.jsx` handles success/error states. | Edge function implementation details (`src/utils/paymentVerificationLogic.js`) is documentation-only; actual code might be missing in `supabase/functions`. |
| **Seat Management** | **Partial** | `SubscriptionManagement.jsx` shows seats. `ReassignSeatModal` exists. | "Add Member" button is disabled/placeholder. Bulk assignment is missing. |
| **Entitlement Check** | **High** | `purchased_modules` table is central. `useAppAccess` hook checks this. | Complexity with "Module" vs "App" access (purchasing 'Geoscience' vs just 'Well Log Viewer'). |
| **Invoicing** | **Medium** | `invoices` table and PDF generation (`renderInvoicePDF`) exist. | Automated invoice generation on renewal/recurring billing is not clearly visible (cron jobs?). |
| **Renewals** | **Low** | `RenewSubscription.jsx` and banners exist. | Automated dunning/retries for failed payments are missing. |

---

## 3. Integration Flow Diagram

### **1. Quote to Payment Flow**