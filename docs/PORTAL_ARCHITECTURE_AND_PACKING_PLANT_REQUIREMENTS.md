# Portal Architecture and Packing Plant Requirements

## Non-negotiable compatibility rule

The production portal already contains Dispatch Reports and Weighbridge Reports. They must remain available with their current behavior, data, access rules, uploads, filters, and exports. Packing Plant Reports is an additive third module. Do not replace the current portal with a new starter application.

## Navigation

The report-type selector must contain exactly these three modules:
1. Dispatch Reports
2. Weighbridge Reports
3. Packing Plant Reports

Existing Dispatch and Weighbridge flows must be regression-tested before any production release.

## Packing Plant screens

- Packing Bags Stock Statement
- Packing Bags Receipts
- Packing Plant Consumption
- Packing Bags Damages
- Daily Packing Summary
- Bag-wise Monthly Summary
- Bag-wise Financial Year Summary
- Upload Data
- Upload History

## Access model

| Role | Required access |
|---|---|
| Admin | Full access to all Packing Plant screens, master data, imports, audit history, and maintenance controls |
| Uploader | Upload/enter data and edit only records permitted by server-side policy; cannot approve layouts or publish portal changes |
| Viewer | Read and download only approved reports |

Role checks must be enforced by the backend/database policies. Hiding buttons in the browser is not authorization.

## Receipt import safeguards

1. Accept only approved workbook formats and mapped sheets/columns.
2. Show selected filename, detected sheet, mapped columns, and row counts.
3. Validate dates, bag type, quantity, required fields, and duplicate keys.
4. Show accepted, rejected, and duplicate rows before submission.
5. Require explicit Confirm and Submit.
6. Record uploader identity, timestamp, filename, checksum, row counts, and batch status.
7. Never silently overwrite historical receipts.
8. Keep rejected rows available for review and correction.
9. A retry of the same committed file must not create duplicate receipts.
10. Keep production submission disabled until the real workbook is mapped and staging tests pass.

## Calculation rules

For each bag category and reporting period:

- Consumption (bags) = matching cement dispatch quantity (MT) × 20.
- Damages = consumption × the approved category damage rate, rounded to the nearest whole bag.
- Closing Stock = Opening Stock + Receipts − Consumption − Damages.

Use approved product/channel mapping. OPC53H and PPCH must be split by sales channel using invoice-wise Trade/Non-Trade source data; product totals alone cannot reliably distinguish Yellow and White bags. PPC Laminated mapping and its damage rate must remain separately configured.

## Reporting periods

- On Date: selected date.
- MTD: first day of selected month through selected date.
- YTD: 1 April through selected date for the April–March financial year.

## Admin-only Portal Maintenance

The Admin menu should expose:
- Edit Portal (authenticated repository/editor destination)
- View Source Code (repository)
- Version History (commits/releases and deployed commit)
- Build & Publish (CI/deployment workflow)
- Rollback (approved known-good release)

These controls must invoke real authenticated services. Never place GitHub tokens, deployment secrets, or Supabase service-role keys in browser code.

## Production release gate

No deployment until:
- verified current production source is imported or faithfully reconstructed;
- Dispatch and Weighbridge regression tests pass;
- Packing Plant staging import and calculation tests pass;
- backend role policies are reviewed;
- secret scanning passes;
- an Admin explicitly approves the release.
