# Attached Source and Database Integration Review

Review date: 21-Nov-2026

## Uploaded source package
The user-provided ZIP is a Vite + React starter. It includes:
- `src/main.jsx`
- `src/style.css`
- `package.json`
- `vite.config.js`
- `index.html`
- `.env.example`
- `README.md`
- an empty `supabase/` directory

It is not a full export of the existing live ChatGPT Site. The uploaded README identifies Dispatch and Weighbridge as placeholders. The app includes sign-in, Packing Plant shell, a local spreadsheet preview and a receipt listing. It has no active upload submit flow.

## Live database inspection
Project: `arimgpcocnbuumwfxkmp` (ACTIVE_HEALTHY, PostgreSQL 17.6.1)

Confirmed public tables: `profiles`, `packing_bag_types`, `packing_bag_opening_balances`, and `packing_bag_receipts`; RLS is enabled on these tables.

Confirmed report function:
- `public.get_packing_bag_stock_statement(p_date date)`
- Returns JSONB with report date, FY start, month start, per-bag rows and totals.
- Computes OD/MTD/YTD receipts, consumption and damages plus opening and closing balance.
- Uses configured bag product codes and sales-channel mappings, private saved dispatch lines, receipt rows, and the private stock baseline.
- Requires an active profile with an allowed role (the function body includes admin, viewer, uploader and dispatch_uploader).
- Is SECURITY DEFINER and executable by authenticated users.

Confirmed receipt save function:
- `public.save_packing_bag_receipts(p_entries jsonb)`
- Is SECURITY DEFINER and executable by authenticated users.
- Internally calls `private.can_manage_packing_bags()`, which currently checks only `is_active = true` and `role = 'admin'`.
- Validates JSON array shape, row count (max 2,000), bag type, date and positive quantity.
- Inserts receipt rows and ignores duplicates on the existing unique key when source_ref is non-null.
- It does not currently record source-file metadata or an import batch audit record.

## Changes made in this branch
- The Packing Bags Stock Statement now calls `get_packing_bag_stock_statement(p_date)` and displays the database-calculated OD/MTD/YTD fields.
- Added a report date selector.
- Displays `Not Set` when the database indicates an opening balance has not been set, rather than presenting null as zero.
- Receipt history still reads from `packing_bag_receipts`.
- Updated the README to reflect the actual database functions and current Admin-only receipt-write restriction.

## Still blocked / not deployed
- Admin + Uploader receipt upload needs a carefully scoped database change and import audit design.
- The current UI only previews files; it does not submit.
- Dispatch and Weighbridge original implementations are not included in the ZIP.
- A production build has not yet completed in the local environment because dependency installation timed out. A GitHub Actions build check is being added.
- No production database schema/data changes and no live portal deployment were performed.
