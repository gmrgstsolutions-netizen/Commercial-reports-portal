# Attached Portal Source Review

Reviewed upload: `andhra-cements-portal-source(1).zip`

## Finding
This is a Vite + React starter/replacement project, not a full source export of the current live ChatGPT Site portal.

## Included
- React/Vite application shell and CSS.
- Supabase email/password sign-in.
- Reads `profiles`, `packing_bag_types`, `packing_bag_opening_balances`, and `packing_bag_receipts`.
- Packing Plant reports shell, local Excel/CSV preview, and receipt listing.

## Not included / not complete
- Original Dispatch Reports implementation.
- Original Weighbridge Reports implementation.
- Server-side import/write workflow; the UI explicitly disables Confirm and Submit.
- Dedicated import audit/history tables.
- Consumption and damages transaction tables/calculation.
- SQL migrations or RLS policy definitions.
- Hosting/deployment configuration.

The README inside the uploaded ZIP states Dispatch and Weighbridge are placeholders and the current live portal is not modified by this starter.

## Safety decision
The source has been placed under `starter/andhra-cements-portal/` on an isolated Git branch. It must not be deployed as a replacement for the live portal until the original Dispatch and Weighbridge behavior is recovered and regression-tested, and the Packing Plant import/security work is completed.

## Build validation
Dependency installation was attempted in the working environment but did not complete before timeout. A production build has therefore **not** been verified yet.
