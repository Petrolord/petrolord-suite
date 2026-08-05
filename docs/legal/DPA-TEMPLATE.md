# Data Processing Agreement — DRAFT TEMPLATE

> STATUS: INTERNAL DRAFT for owner and legal-counsel review. Do NOT send to
> customers or publish until reviewed by a lawyer. Bracketed fields are
> placeholders. This draft reflects what the platform actually does as of
> 2026-08-05 (see docs/scope/OrgDataExport-STATUS.md); keep it in sync with
> the product or it becomes a liability like the old Privacy Policy claim.

This Data Processing Agreement ("DPA") forms part of the agreement between
**Lordsway Energy** ("Processor", operating the Petrolord platform) and
**[CUSTOMER LEGAL NAME]** ("Controller") for the services described at
petrolord.com (the "Service").

## 1. Subject matter and roles

The Controller determines the purposes of processing the data it uploads to
or creates on the Service ("Customer Data"). The Processor processes Customer
Data only to provide the Service, on the Controller's documented instructions
as expressed through the Service's features and configuration.

## 2. Categories of data and data subjects

- Account data of the Controller's personnel: names, work email addresses,
  roles, authentication records.
- Technical and project data: geoscience, reservoir, drilling, production,
  economics and HSE data uploaded to or produced within the Service.
- Billing records related to the Controller's subscription.

## 3. Confidentiality and isolation

Customer Data is logically isolated per organization through database-level
row security. Personnel of the Processor access Customer Data only for
support or operations, and access is limited to what the task requires.

## 4. Security measures

- Encryption in transit (TLS) and at rest.
- Row-level security enforced in the database for every organization-scoped
  table; private storage buckets with per-user path policies and time-limited
  signed links.
- Credentials and security tokens are excluded from all data exports.

## 5. Sub-processors

The Processor uses the following sub-processors: [Supabase (database, storage,
authentication), hosting provider(s), email delivery provider(s) (Resend,
Brevo), payment providers (Paystack, Stripe)]. The Processor will inform the
Controller of intended changes to sub-processors [notice period and objection
mechanism to be defined by counsel].

## 6. Data portability

Administrators of the Controller's organization may export a complete copy of
Customer Data at any time from the Service (Dashboard, Data Export), covering
all database records and an inventory of stored files with secure download
links.

## 7. Deletion and return

The Controller may schedule account closure from the Service. Closure takes
effect after a 30 day grace period during which the export remains available
and the closure can be cancelled. On completion the Processor permanently
deletes all Customer Data from live systems, verified programmatically, and
issues a Certificate of Data Deletion that can be independently verified at
petrolord.com/legal/verify-deletion. Copies within encrypted backups age out
automatically as backups rotate [state the provider's maximum backup
retention window here once confirmed].

## 8. Personal data requests and breach notice

The Processor will assist the Controller with data-subject requests relating
to Customer Data and will notify the Controller without undue delay after
becoming aware of a personal-data breach affecting Customer Data
[notification window to be defined by counsel].

## 9. Applicable law

[To be completed by counsel: NDPR (Nigeria) as baseline; GDPR standard
contractual clauses if the Controller is subject to EU law.]

## 10. Term

This DPA applies for as long as the Processor processes Customer Data and
survives termination until deletion under section 7 completes.

---
Signatures: [Controller] / [Processor], date.
