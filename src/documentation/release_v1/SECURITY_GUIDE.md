# Security Guide

## Authentication
*   **Supabase Auth**: Handles identity management.
*   **MFA**: Multi-Factor Authentication is supported and can be enforced via Enterprise settings.
*   **Session Management**: Tokens utilize short lifespans with auto-refresh logic.

## Authorization
*   **Row Level Security (RLS)**: All data access is gated at the database level. Even if the API is exposed, users can only retrieve rows permitted by `auth.uid()` policies.
*   **Project Membership**: Access is controlled via the `project_members` table (Owner, Editor, Viewer roles).

## Data Protection
*   **Encryption at Rest**: PostgreSQL data is encrypted on disk.
*   **Encryption in Transit**: All traffic is strictly HTTPS (TLS 1.2+).
*   **Storage**: Files are stored in private S3 buckets with signed URL access only.

## Compliance
*   **Audit Trails**: Critical actions (delete, permission change) are logged to `audit_logs`.
*   **GDPR / NDPR**: Data portability is implemented: organization admins can export all organization data from Dashboard → Data Export (`org-export` edge function; catalog-driven, covers every org-scoped table plus member-owned technical data and a storage manifest). Right to erasure is currently handled by support on request; a self-service deletion pipeline (grace period + certificate of deletion) is planned. Note the `delete_organization` RPC only removes billing tables and the org row; it is NOT a full erasure (see docs/scope/OrgDataExport-STATUS.md).