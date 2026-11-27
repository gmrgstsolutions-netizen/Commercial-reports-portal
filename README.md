# Commercial Reports – Andhra Cements

Private source repository for the Andhra Cements Commercial Reports portal.

## Project status

This repository has been created as the dedicated home for the portal source. The existing live ChatGPT Site is a separate deployment and is not automatically connected to this repository. Do not assume a commit here changes the live portal.

The original live portal source is unavailable, so this repository is being used to build a separate replacement independently. The starter package is only the initial application shell; Dispatch and Weighbridge must be rebuilt from documented requirements and verified Supabase contracts. The existing live portal remains separate and untouched throughout development.

## Required modules

- Dispatch Reports — independently rebuild the existing upload, report, filter, and export workflows, then verify output parity against the live portal.
- Weighbridge Reports — independently rebuild the existing upload, Datewise, Pending, and Card Issue workflows, then verify output parity against the live portal.
- Packing Plant Reports — complete the eight agreed screens as the third module.
- Admin-only Portal Maintenance — source access, version history, test/build and publish links.

## Security rules

- Keep this repository private.
- Never commit Supabase `service_role` keys, passwords, tokens, production exports, or personal data.
- Use environment variables for public configuration; keep privileged secrets in the deployment platform's secret store.
- Enforce Admin/Uploader/Viewer permissions in the backend (RLS/API), not only in the browser UI.
- Require review and a successful test build before production deployment.

## Deployment status

No public hosting or production deployment is configured yet. The new portal must first be completed and tested in a separate staging deployment. The current live portal and production Supabase data remain unchanged until explicit approval to switch.
