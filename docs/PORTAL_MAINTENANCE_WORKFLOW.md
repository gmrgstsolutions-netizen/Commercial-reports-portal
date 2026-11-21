# Admin Portal Maintenance Workflow

## Admin-only menu

The portal should show a **Portal Maintenance** section only when the authenticated profile is active and has the Admin role. Uploader and Viewer accounts must not see or invoke maintenance actions.

Menu entries:
1. **Edit Portal** — open the approved source repository or configured web IDE.
2. **View Source Code** — open the repository source browser.
3. **Version History** — show commits/releases and identify the currently deployed commit.
4. **Build & Publish** — open the deployment workflow and its test/build results.
5. **Backup / Restore** — identify a known-good release and document the controlled rollback procedure.

## Safe publishing sequence

1. Create a feature branch; never edit the production branch directly.
2. Make the requested addition, deletion, or modification.
3. Run lint, tests, and a production build.
4. Review the change and verify that Dispatch and Weighbridge regression tests pass.
5. Publish to a staging environment.
6. Obtain Admin approval.
7. Deploy the approved commit to production.
8. Record deployment URL, commit SHA, timestamp, and rollback target.

## Important implementation note

A portal button is not itself an editor or deployment engine. It must link to a real authenticated repository/editor/deployment service. Never expose a GitHub token or deployment secret in client-side JavaScript. The Admin check must be enforced server-side as well as in the UI.

## Current state

This document defines the target workflow. The live ChatGPT Site has not yet been connected to this repository, and no production deployment is configured by this repository's initial setup.
