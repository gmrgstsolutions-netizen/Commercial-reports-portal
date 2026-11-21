# Module Preservation Checklist

Before every release, verify the following against the current live portal baseline.

## Dispatch Reports

- Existing login and role behavior remains intact.
- Existing upload types, validation, preview, confirmation, and report calculations remain intact.
- Existing report layouts, filters, downloads, and date behavior remain intact.
- No Dispatch data is deleted, rewritten, or reclassified by the Packing Plant changes.

## Weighbridge Reports

- Existing upload types and replacement/append rules remain intact.
- Existing Datewise Report, Pending Report, and Card Issue Details remain intact.
- Existing filters, totals, downloads, and date behavior remain intact.
- No Weighbridge data is deleted or modified by the Packing Plant changes.

## Packing Plant Reports

- Keep receipt import disabled until the actual workbook is mapped and duplicate rules are approved.
- Validate Opening + Receipts - Consumption - Damages = Closing.
- Preserve import preview, row-level validation, audit trail, and rollback requirements.
- Verify category/product/channel mappings against approved business rules.

## Release gate

Do not deploy if any existing Dispatch or Weighbridge regression test fails, if role enforcement is only client-side, or if production secrets appear in the built assets or repository.
