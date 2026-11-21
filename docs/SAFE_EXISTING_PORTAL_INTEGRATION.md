# Safe integration plan — preserve the existing live portal

## Non-negotiable production boundary

The active ChatGPT Site at https://commercial-reports-andhra-cements.gmrgstsolutions.chatgpt.site remains the production portal. Do not edit, overwrite, republish, or change its source while building the Packing Plant module in this repository.

The existing Dispatch Reports and Weighbridge Reports remain authoritative and must continue to be used in production. This repository is a separate staging implementation, not a deployment of the live site's source.

## What is currently available

- The supplied ZIP is a Vite/React starter package.
- It contains a Packing Plant starter and a preview-only receipt import workflow.
- Its Dispatch Reports and Weighbridge Reports views are placeholders; it does not contain the original portal implementations.
- The Library item named `Commercial Reports - Andhra Cements.txt` is a rendered site snapshot, not editable source code.
- The Android source repository contains the APK's dispatch/weighbridge client and SQL/reporting assets. It is not the original web portal source and must not be substituted for it.

## Integration shape

1. Keep the current live portal as the production entry point until a complete source-level migration is possible.
2. Keep Packing Plant changes isolated in this repository and on the feature branch `source-import/starter-portal-2026-11-21`.
3. Recover the actual editable source for the live portal, including its upload pages, Dispatch and Weighbridge screens, role checks, and any route-specific assets.
4. Create a separate integration branch based on that recovered source. Add Packing Plant as a third report type/module without rewriting the existing Dispatch or Weighbridge modules.
5. Keep existing routes, report calculations, upload mappings, access rules, and Supabase objects unchanged unless a reviewed migration explicitly requires an additive change.
6. Test the three report types side-by-side in staging using Admin, Uploader, and Viewer accounts.
7. Verify Dispatch and Weighbridge regression tests before any production release.
8. Deploy only after staging sign-off and an explicit production release decision. Keep a rollback copy of the current production source and deployment.

## Database boundary

- The Packing Plant receipt-import migration in this branch is a draft only.
- Do not apply it to the production Supabase project until it has been reviewed and tested in a non-production environment.
- Do not rename, drop, truncate, or repurpose existing Dispatch/Weighbridge tables, views, RPCs, storage buckets, or policies.
- Prefer additive, namespaced Packing Plant objects and explicit grants/RLS policies.

## Release acceptance checklist

- [ ] Complete original live portal source recovered and version identified.
- [ ] Existing Dispatch Reports routes and upload flow unchanged.
- [ ] Existing Weighbridge Reports routes and upload flow unchanged.
- [ ] Packing Plant appears as the third report type.
- [ ] Existing user roles and permissions continue to work.
- [ ] Admin, Uploader, and Viewer tested separately.
- [ ] Existing report outputs compared against production for matching test periods.
- [ ] No production database mutation occurred during staging.
- [ ] Rollback source and release procedure documented.
- [ ] User approves production deployment.

## Current status

**Staging only.** The live portal and production Supabase database have not been modified by this integration branch. The next blocking dependency is the original editable web-portal source; the supplied starter ZIP and rendered Library snapshot are not sufficient to safely migrate the two existing modules.
