# Packing Plant Receipt Import – Implementation Plan

Status: design only; no production database changes have been applied.

## Required role behavior
- Admin: view reports, import receipts, manage bag types and opening balances.
- Uploader: view reports and import receipts only.
- Viewer: read-only.
- Dispatch-only and Weighbridge-only uploader roles must not gain Packing Plant receipt-write access by default.

## Existing database behavior verified 21-Nov-2026
- `get_packing_bag_stock_statement(p_date)` returns the calculated Packing Plant statement.
- `save_packing_bag_receipts(p_entries)` is SECURITY DEFINER and callable by authenticated users, but its internal helper `private.can_manage_packing_bags()` currently permits only active Admin.
- That helper is currently referenced by the receipt save function only. The opening balance and bag-type save functions perform their own Admin checks.
- `packing_bag_receipts` has a unique partial index on (bag_type_id, receipt_date, source_ref), and the current save function ignores duplicates on that key.

## Proposed secure import flow
1. Browser reads Excel/CSV locally and displays sheet name, detected headers, row count and a preview.
2. User maps workbook columns to Bag Type, Receipt Date, Quantity, Source Reference and Remarks. Required columns are validated before enabling confirmation.
3. Browser computes a file checksum and submits the parsed rows plus filename/checksum to one database RPC.
4. Database function verifies `auth.uid()`, active profile and role in ('admin','uploader'); it validates all rows, rejects invalid bag types/dates/non-positive quantities, and applies duplicate handling consistently.
5. Database writes receipt rows and an import-batch audit row atomically. Audit fields: uploader, source filename, checksum, submitted row count, inserted count, duplicate/skipped count, status and timestamp.
6. Portal history reads audit rows through an authenticated RPC; Admin sees all batches, Uploader sees own batches, Viewer has read-only visibility according to the approved policy.
7. The response reports inserted and skipped counts. A duplicate-only upload must not be reported as a successful full insert.

## Authorization boundary
- Do not change `private.is_admin()` or the Admin checks used by bag-type and opening-balance management.
- If the existing helper is reused, update only `private.can_manage_packing_bags()` after verifying it has no other callers. Current inspection found the receipt save function as its only caller.
- Keep the role check inside the database function. UI visibility is not authorization.
- Do not grant direct INSERT/UPDATE/DELETE on receipt tables to browser roles.
- Keep SECURITY DEFINER functions in the non-exposed `private` schema where possible; public RPC entrypoints must explicitly validate the authenticated user and active role, pin search_path, and have deliberate EXECUTE grants.
- Avoid exposing any service-role/secret key to Vite/browser code.

## Acceptance tests before enabling production uploads
- Admin can import valid rows.
- Uploader can import valid rows.
- Viewer cannot import.
- Inactive account cannot import.
- Dispatch-only and Weighbridge-only uploader roles cannot import.
- Invalid bag type, missing date, zero/negative quantity, malformed rows and oversized batch are rejected without partial writes.
- Duplicate source reference is skipped and counted; re-upload does not duplicate rows.
- Audit record is written atomically with receipt inserts.
- Existing opening balances and receipts remain unchanged by failed imports.
- Recalculate the stock statement for dates before, on and after imported receipt dates and reconcile totals.

## Front-end preview implementation (21-Nov-2026)
The portal branch now includes a local-only worksheet selector, automatic column-name suggestions, manual mapping for Bag Type / Receipt Date / Quantity / Source Reference / Remarks, and row-level checks for active bag-type matches, valid dates, positive quantities and duplicate references within the selected workbook. It shows aggregate valid/invalid counts and the first 50 mapped rows. Excel date serials and common day-first date strings are normalized for preview.

This does **not** detect duplicates already stored in Supabase, submit records, or provide an audit trail. The Confirm and Submit control remains disabled. Production import must wait for the database RPC and role tests described above, plus inspection of the actual receipt workbook to confirm its sheet names, column headings and data formats.

## Database migration draft (21-Nov-2026)
A review-only migration is staged at `supabase/migrations/20261121120000_packing_bag_receipt_import_audit.sql`. It adds:
- A receipt import batch audit table with source filename, SHA-256 checksum, user, submitted/inserted/skipped counts, status and timestamp.
- RLS read access for Admins across all batches and Uploaders for their own batches. Viewer history access is not granted by this draft pending a clear visibility decision.
- A single SECURITY DEFINER RPC, `import_packing_bag_receipts(file_name, file_sha256, entries)`, that accepts active Admin and Uploader roles, validates rows and active bag types, caps an upload at 2,000 rows, inserts receipts and writes the audit result in one transaction.
- A transaction advisory lock and unique file checksum so retrying the exact same workbook does not insert it twice. Existing receipt-row uniqueness is also honored through `ON CONFLICT DO NOTHING`.

The migration has **not** been applied to Supabase. The existing `save_packing_bag_receipts(jsonb)` remains unchanged and Admin-only. Do not enable the new UI submit action until the migration is reviewed and applied in a controlled environment.

### Required pre-production tests
1. Active Admin import succeeds and creates an audit row.
2. Active Uploader import succeeds and creates an audit row.
3. Viewer, inactive profile, unauthenticated caller and dispatch-only/weighbridge-only roles are denied.
4. Missing/invalid checksum, empty or non-array payload, over-2,000 rows, invalid/inactive bag type, missing date and non-positive quantity are rejected without partial receipt inserts.
5. Repeating the same file checksum returns the prior batch result and does not insert additional receipts.
6. A row conflict is counted as skipped; inserted + skipped equals submitted.
7. Admin can read all audit batches; Uploader can read only their own; Viewer cannot read audit rows under this draft.
8. Existing opening-balance and bag-type save functions remain Admin-only; stock statement results reconcile before and after imports.
9. Confirm the actual receipt workbook's column mapping and whether it contains a stable source reference. If no stable reference exists, exact-file checksum idempotency protects repeated whole-file uploads, but it cannot identify semantically duplicate rows across different workbooks.
