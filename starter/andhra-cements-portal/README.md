# Commercial Reports – Andhra Cements (replacement portal starter)

This is a **separate, non-production starter project** for rebuilding the portal while leaving the existing ChatGPT Site untouched.

## Current scope in this starter
- Supabase email/password sign-in.
- Reads the existing `profiles`, `packing_bag_types`, `packing_bag_opening_balances`, and `packing_bag_receipts` tables.
- Adds a Packing Plant module shell with Reports, Upload Data and Upload History.
- Shows the FY 2026–27 opening balances and recorded receipts.
- Provides a local Excel/CSV preview only. It does **not** write uploaded rows to Supabase.
- Keeps Dispatch and Weighbridge as clearly marked placeholders; the original portal source was not recovered, so their existing live behavior is not copied or replaced here.

## Important data limitation
The current database schema inspected for this project has tables for bag types, opening balances and receipts. It does not yet have confirmed transaction tables for consumption, damages, import audit history, or a complete stock-statement calculation. Therefore the dashboard labels its balance as **Opening + Receipts**, not physical closing stock. Do not treat it as final stock until consumption and damages are implemented and reconciled.

## Setup
1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env`.
3. Set:
   - `VITE_SUPABASE_URL=https://arimgpcocnbuumwfxkmp.supabase.co`
   - `VITE_SUPABASE_ANON_KEY=<public anon/publishable key from Supabase>`
4. Never use a Supabase `service_role` key in this browser app.
5. Run `npm install`, then `npm run dev`.
6. Run `npm run build` to create `dist/`.

## Security gate before enabling writes
The inspected Packing Plant tables currently have RLS enabled with active-user SELECT policies only. No INSERT/UPDATE/DELETE policies were found for these tables. The upload submit button is therefore deliberately disabled.

Before enabling imports, design and review server-side RLS policies and an import/audit schema:
- Admin: manage all Packing Plant records.
- Uploader: insert permitted transactions and edit/replace only their permitted records; no delete-all or admin functions.
- Viewer: read-only.
- Keep role checks in database policies/functions, not just the UI.
- Do not broaden Dispatch or Weighbridge permissions.
- Store source file name, uploader, timestamp, validation summary and import status.
- Implement duplicate detection and explicit preview/confirmation.
- Keep original files and preserve all existing historical transactions.

## Deploying
This project has not been deployed. Configure a hosting provider and environment variables only after the database security changes and acceptance tests are reviewed. The current ChatGPT Site URL is not modified by this project.
