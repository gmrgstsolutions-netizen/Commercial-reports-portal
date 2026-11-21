# Commercial Reports – Andhra Cements (replacement portal starter)

This is a **separate, non-production starter project**. It is not connected to the live ChatGPT Site and has not been deployed.

## Current scope
- Supabase email/password sign-in.
- Reads the authenticated user's profile and active Packing Plant bag types.
- Calls the existing `get_packing_bag_stock_statement(p_date)` database RPC for the stock statement. The database function calculates opening balance, receipts (OD/MTD/YTD), consumption (OD/MTD/YTD), damages (OD/MTD/YTD), and closing balance.
- Shows recorded receipt rows in the Upload History view.
- Provides a local Excel/CSV preview only. It does **not** submit uploaded rows to the database.
- Dispatch and Weighbridge remain explicitly marked placeholders because the original live portal implementation was not part of the uploaded source package.

## Existing database integration verified on 21-Nov-2026
The Supabase project `arimgpcocnbuumwfxkmp` is active. The following public tables exist and have RLS enabled:
- `profiles`
- `packing_bag_types`
- `packing_bag_opening_balances`
- `packing_bag_receipts`

The stock statement RPC is `public.get_packing_bag_stock_statement(p_date date)`. It uses the configured bag-type product/channel mappings, saved dispatch lines, receipt rows, and the private stock baseline. The UI now calls this RPC instead of adding opening stock and receipts itself. When the database marks an opening balance as unset, the UI displays **Not Set**, not zero.

The receipt save RPC `public.save_packing_bag_receipts(p_entries jsonb)` exists and is executable by authenticated users, but its internal authorization helper currently permits **active Admin only**. The UI therefore remains preview-only. The requested Uploader write access is not yet enabled. Do not infer that EXECUTE permission alone grants a user permission to submit data: the function performs its own role check.

## Security and import work still required
Before enabling Admin + Uploader receipt uploads:
1. Keep database-side authorization. Do not rely on hiding/showing UI buttons.
2. Extend receipt-import authorization to the approved role set only; do not broaden opening-balance or bag-type administration.
3. Add an import batch/audit record with source filename, checksum, submitted/inserted/skipped row counts, uploader and timestamp.
4. Validate bag type, receipt date, positive quantity, source reference and duplicates before commit.
5. Preserve original receipt rows and historical data; duplicate handling must be explicit and visible.
6. Test Admin, Uploader, Viewer, inactive user and unrelated uploader roles against the actual database policies/RPCs.
7. Run Supabase security and performance advisors after any database migration.

## Setup
1. Use Node.js 22 or newer.
2. Copy `.env.example` to `.env`.
3. Set `VITE_SUPABASE_URL=https://arimgpcocnbuumwfxkmp.supabase.co`.
4. Set `VITE_SUPABASE_ANON_KEY` to the project's public anon/publishable key.
5. Never place a Supabase service-role or secret key in this browser application.
6. Run `npm install`, then `npm run dev`.
7. Run `npm run build` to create `dist/`.

## Deployment
No hosting configuration or production deployment is included. Do not publish this starter as a replacement until the original Dispatch and Weighbridge functionality has been recovered/rebuilt and regression-tested, and the Packing Plant upload permissions/import audit workflow is complete.
