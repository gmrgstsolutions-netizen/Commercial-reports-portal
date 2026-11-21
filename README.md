# Commercial Reports – Andhra Cements

Private source repository for the Andhra Cements Commercial Reports portal.

## Project status

This repository has been created as the dedicated home for the portal source. The existing live ChatGPT Site is a separate deployment and is not automatically connected to this repository. Do not assume a commit here changes the live portal.

The initial source package previously prepared in conversation is a development starter, not a verified export of the live site's complete source. Before deployment, reconcile the existing Dispatch Reports and Weighbridge Reports behavior against the live portal and migrate their approved source into this repository.

## Required modules

- Dispatch Reports — preserve existing behavior.
- Weighbridge Reports — preserve existing behavior.
- Packing Plant Reports — add as the third report type.
- Admin-only Portal Maintenance — source access, version history, test/build and publish links.

## Security rules

- Keep this repository private.
- Never commit Supabase `service_role` keys, passwords, tokens, production exports, or personal data.
- Use environment variables for public configuration; keep privileged secrets in the deployment platform's secret store.
- Enforce Admin/Uploader/Viewer permissions in the backend (RLS/API), not only in the browser UI.
- Require review and a successful test build before production deployment.

## Deployment status

No production deployment is configured by this initial commit. The current live portal remains unchanged until a verified source migration and deployment are completed.
