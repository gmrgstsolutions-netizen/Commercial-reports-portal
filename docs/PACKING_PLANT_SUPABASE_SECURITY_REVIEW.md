# Packing Plant Supabase Security Review

Review date: 21-Nov-2026  
Environment inspected: existing Supabase project `Sales Dispatch Reports` (`arimgpcocnbuumwfxkmp`)  
Scope: read-only inspection only. No database object, policy, grant, role, user or data was changed.

## 1. Verified current state

- Project is healthy and runs PostgreSQL 17.6.
- Existing `public.profiles` table has RLS enabled. Its role check currently permits: `admin`, `dispatch_uploader`, `weighbridge_uploader`, `uploader`, and `viewer`.
- Current active profile roles include Admin, Uploader and Viewer. There is no dedicated Packing Plant role in the existing role constraint.
- `private.is_active_user()` and `private.is_admin()` are stable SQL helper functions using SECURITY DEFINER and a restricted search path. They check the authenticated user's own profile row and active/admin status.
- Existing public Packing Bags tables (`packing_bag_types`, `packing_bag_opening_balances`, `packing_bag_receipts`) have RLS enabled and active-user SELECT policies. The inspected policy set does not provide operational INSERT/UPDATE/DELETE policies for those tables.
- Existing Dispatch Reports tables have their own policies and date-bound access behavior. These must not be reused or weakened for Packing Plant operations.
- The public schema tables inspected have RLS enabled. New exposed `pp_*` tables must also enable RLS and receive explicit, least-privilege policies.

## 2. Permission design implication

Do not assume that the existing `uploader` role automatically authorizes production entry, attendance, truck loading, stoppage edits or shift finalization. Its current use must be confirmed with the project owner and application flows.

Recommended safe approach:
- Keep `public.profiles` and its existing role constraint unchanged.
- Add a module-specific permission mapping for Packing Plant users, keyed by `auth.uid()`, in a non-exposed `private` table such as `private.pp_user_permissions`.
- Suggested explicit permissions: `can_view`, `can_enter_operations`, `can_manage_masters`, `can_finalize_shift`, `can_reopen_shift`.
- Default all permissions to false. Assign the Admin permission deliberately; grant operational entry and master maintenance only to specifically approved users.
- Expose no direct client access to the private permission table. Use carefully scoped policy helper functions in the private schema to check the current authenticated user. Any SECURITY DEFINER helper must have a fixed safe search_path, must check `auth.uid()` internally, and must be callable only by the intended database roles.
- Use separate policies for SELECT, INSERT, UPDATE and DELETE on each public `pp_*` table. UPDATE policies require both `USING` and `WITH CHECK`.
- Keep viewer read-only. Prevent an uploader from changing master data or finalizing/reopening shifts unless those permissions are separately approved.
- Do not use user-editable auth user metadata for authorization.
- Never place a service-role or secret key in browser code.

## 3. Existing modules to protect

No changes are authorized to:
- `public.profiles`
- `public.report_uploads` and `public.report_summaries`
- Existing Dispatch Reports and Weighbridge Reports functions, views, policies and storage
- `public.packing_bag_types`
- `public.packing_bag_opening_balances`
- `public.packing_bag_receipts`
- Existing private login, session, viewer permission and security functions/tables

All new operational records remain under the `pp_*` namespace. Existing Packing Bags screens continue to use their current tables and policies.

## 4. Security test matrix required before enabling the UI

| Test identity | View reports | Enter/edit operational rows | Manage masters | Finalize/reopen |
|---|---:|---:|---:|---:|
| Approved Packing Plant Admin | Yes | Yes | Yes | Yes |
| Approved Packing Plant Operator | Yes | Yes, approved scope | No | No unless separately granted |
| Viewer | Yes | No | No | No |
| Inactive account | No | No | No | No |
| Unauthenticated user | No | No | No | No |

Also test:
- Direct REST requests, not just hidden/disabled UI buttons.
- UPDATE attempts that change owner, business date, shift or scope.
- Reads of other users' private permission rows.
- Attempts to call any privileged function directly.
- Existing Dispatch, Weighbridge and Packing Bags screens after policies are added.

## 5. References

- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase API security and exposing tables](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase Views and security_invoker](https://supabase.com/docs/guides/database/views)

## 6. Approval boundary

This document records read-only findings and a proposed approach. It is not a migration and has not changed Supabase. Before creating the private permission table, helper functions, policies, grants or operational tables, the permission assignments and exact operator scope must be reviewed and explicitly approved.
