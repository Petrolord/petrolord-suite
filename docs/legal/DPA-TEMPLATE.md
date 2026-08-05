# Data Processing Agreement — Standard Template

> STATUS: APPROVED by legal 2026-08-05 and published at /legal/dpa
> (src/pages/legal/DataProcessingAgreement.jsx; keep the two in sync).
> Four values were filled at publication and flagged back to legal for
> confirmation: 7-day backup retention (measured on the live project,
> daily backups, no PITR), 72-hour breach notice, 30-day sub-processor
> notice, Nigerian governing law (NDPA 2023 + NDPR) with GDPR/UK-GDPR
> standard contractual clauses incorporated by reference where applicable.
> Executed customer copies name the Controller and are arranged through
> support@petrolord.com. Keep this document in sync with the product
> (docs/scope/OrgDataExport-STATUS.md) or it becomes a liability like the
> old Privacy Policy claim.

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

The Processor uses the following sub-processors: Supabase (database, storage
and authentication; hosted in the eu-west-2, London region), Hostinger (web
hosting), Resend and Brevo (transactional email), and Paystack and Stripe
(payment processing). The Processor will give the Controller at least 30 days
notice by email before adding or replacing a sub-processor that processes
Customer Data, and the Controller may object on reasonable data-protection
grounds within that period.

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
petrolord.com/legal/verify-deletion. Copies within encrypted daily backups
are retained for no more than seven days and age out automatically as
backups rotate.

## 8. Personal data requests and breach notice

The Processor will assist the Controller with data-subject requests relating
to Customer Data, and will notify the Controller without undue delay, and in
any case within 72 hours of becoming aware, of a personal-data breach
affecting Customer Data.

## 9. Applicable law

This DPA is governed by the laws of the Federal Republic of Nigeria,
including the Nigeria Data Protection Act 2023 and the Nigeria Data
Protection Regulation. Where the Controller is subject to the EU or UK GDPR,
the relevant standard contractual clauses are incorporated into the executed
copy by reference.

## 10. Term

This DPA applies for as long as the Processor processes Customer Data and
survives termination until deletion under section 7 completes.

---
Signatures: [Controller] / [Processor], date.
