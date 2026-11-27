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

1. Keep the current live portal as the production entry point; do not change or redirect it during development.
2. Build a separate, independently editable replacement portal in this repository and feature branch `source-import/starter-portal-2026-11-21`. The original live portal source is not a prerequisite.
3. Rebuild Dispatch Reports and Weighbridge Reports as new modules from the established business rules, report layouts, upload workflows, and existing Supabase schema/RPCs. Treat the Android repository, prior project specifications, and verified database definitions as references—not as a drop-in web source.
4. Keep Packing Plant as the third report type/module. Keep all three modules isolated by route/component and preserve existing database objects; use additive, namespaced changes only where necessary.
5. Document any unknown mapping or behavior and leave it disabled rather than guessing or changing existing production data.
6. Test all three report types in staging using Admin, Uploader, and Viewer accounts, including uploads, filters, exports, and report totals.
7. Compare rebuilt Dispatch and Weighbridge outputs against the live portal for identical files and periods before release.
8. Deploy only after staging sign-off and explicit approval. Keep the current live portal available as rollback until the new portal is accepted.

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

## Latest staging validation

- Source commit: `21c4b6ada46b310cb64ab169310b5f61a881b077`
- GitHub Actions run: [Portal build check #22](https://github.com/gmrgstsolutions-netizen/Commercial-reports-portal/actions/runs/44895479705)
- Result: **success** — dependency installation and Vite production build completed.
- Scope: build validation only. It does not deploy the site, apply the draft database migration, or prove the placeholder Dispatch/Weighbridge views are production-ready.

## Updated implementation decision — rebuild independently

The original editable web-portal source is unavailable. This is no longer treated as a blocking dependency. The replacement will be built independently in this repository from the accumulated requirements and verified backend contracts.

- The supplied starter ZIP remains the starting shell for authentication, role-aware navigation, and Packing Plant screens; it is not represented as a complete portal.
- Dispatch and Weighbridge must be implemented as new web modules. Until each module passes parity testing, its menu entry must clearly identify it as under development and must not imply that it is live-ready.
- Existing production tables, functions, policies, storage objects, and live portal remain untouched during development.
- A verified database inventory and report-by-report parity checklist are required before connecting each rebuilt module to production data.

## Current status

**Independent replacement in staging.** Original source recovery is not required. The live portal and production Supabase database have not been modified by this branch. Next work is to inventory the existing Dispatch/Weighbridge backend contracts and implement their new web screens incrementally.
