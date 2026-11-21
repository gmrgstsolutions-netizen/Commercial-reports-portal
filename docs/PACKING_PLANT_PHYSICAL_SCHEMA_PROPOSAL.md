# Packing Plant Physical Schema Proposal

Status: reviewable implementation proposal only. This document is not an applied migration and creates no database objects. It must be reviewed against the live schema inventory before any SQL is prepared or executed.

## 1. Isolation and compatibility

- Keep all new operational objects in the `public` schema with the `pp_` prefix for consistency with the existing portal's Data API approach, unless a reviewed architecture decision chooses a private schema plus server-side access.
- Do not rename, drop, truncate, or alter Dispatch Reports, Weighbridge Reports, profiles/authentication, or existing packing-bag tables.
- Existing packing-bag tables must be mapped to their screens before deciding whether to reuse them. No duplicate bag-inventory tables should be created.
- No existing role, profile, or permission column is assumed to be safe for reuse until its current policies and code paths are inspected.
- Use Asia/Kolkata as the plant timezone. Persist absolute timestamps as `timestamptz`; retain local shift business date separately.
- All quantity fields use `numeric`, not floating point.

## 2. Proposed tables and key columns

The following names and columns are proposals. Exact types, nullability, foreign keys and naming must be checked against the complete live inventory before migration.

| Table | Key columns and purpose |
|---|---|
| `pp_packers` | id, code (P1/P2/P3 unique), name, rated_capacity_tph, active |
| `pp_products` | id, code (PPC/OPC unique), name, active |
| `pp_shifts` | id, code (A/B/C unique), local_start_time, local_end_time, duration_minutes |
| `pp_shift_instances` | id, shift_id, shift_business_date, start_at, end_at, status, finalized_at, finalized_by |
| `pp_production_entries` | id, shift_instance_id, packer_id, product_id, quantity_mt, audit columns |
| `pp_running_intervals` | id, shift_instance_id, packer_id, product_id, start_at, end_at, duration_minutes, audit columns |
| `pp_stoppage_categories` | id, stable code, fixed display name, sort_order |
| `pp_stoppage_reasons` | id, category_id, reason_text, active, audit columns |
| `pp_stoppage_entries` | id, shift_instance_id, packer_id, start_at, end_at, duration_minutes, category_id, reason_id, category_snapshot, reason_snapshot |
| `pp_employees` | id, employee_code, display_name, staff_category_id, active |
| `pp_staff_categories` | id, code, display_name, active |
| `pp_shift_assignments` | id, employee_id, shift_id, effective_from, effective_to |
| `pp_attendance_entries` | id, shift_instance_id, employee_id, attendance_status (Present/Absent), audit columns |
| `pp_holiday_dates` | id, holiday_date, description, holiday_type, active |
| `pp_attendance_classifications` | id, attendance_entry_id, classification (Actual Duty/Extra Duty), regular_days_counted, threshold, evaluated_at |
| `pp_shift_staff` | id, shift_instance_id, staff_role (PLC Operator/Truck Loading Operator/Shift Incharge), employee_id |
| `pp_truck_loads` | id, shift_instance_id, vehicle_number, product_id, quantity_mt, remarks, audit columns |
| `pp_audit_events` | id, entity_table, entity_id, action, before_data, after_data, actor_id, occurred_at |

Every operational table should have consistent `created_at`, `created_by`, `updated_at`, and `updated_by` fields where applicable. Use immutable audit events for edits, voids, master changes and finalization; do not rely only on a mutable updated timestamp.

## 3. Constraints and indexes

### Master data
- Unique packer codes P1/P2/P3; seed capacities 120, 120 and 240 TPH.
- Unique product codes PPC and OPC.
- Unique shift codes A/B/C and duration exactly 480 minutes.
- Seed five fixed stoppage categories: Mechanical, Electrical, Instrumentation, Operational and Planned. Users must not create extra categories; Admin can maintain reasons under each category.
- Deactivation is preferred to deletion for referenced master rows.

### Shift instances
- Unique `(shift_id, shift_business_date)`.
- A/B windows are 06:00–14:00 and 14:00–22:00 local time.
- C window is 22:00 on business date through 06:00 on the next calendar date.
- Store the C shift as one 8-hour shift instance. Store its actual intervals with their true timestamps; the midnight boundary is not a stoppage.
- Use explicit status values such as Draft, Incomplete, Provisional, Finalized and Voided. Finalized records are changed only through an authorized correction/reopen workflow with audit history.

### Production and running
- Production quantity must be non-negative; unique production row per shift instance + packer + product (if one consolidated entry per combination is adopted).
- Running interval end must be after start; interval must fall within its shift instance.
- Prevent overlap for the same packer across both PPC and OPC, not merely within the same product. Enforce at database level where feasible (e.g. an exclusion constraint on a timestamp range scoped to packer and shift) and validate again in server-side operations.
- Store or calculate duration consistently in minutes; convert to hours for reports.
- Index running intervals by shift_instance_id, packer_id and start_at.

### Stoppages
- Derive gaps from the full 8-hour packer timeline, including leading, intermediate and trailing gaps.
- Each confirmed gap must have category and reason. Save category/reason text snapshots so later master edits do not rewrite history.
- If production/running data is incomplete, show provisional totals and do not ask users to classify gaps that may disappear when entries are completed.
- Finalization is blocked until all derived gaps have a category and reason.
- Index stoppages by shift_instance_id, packer_id, category_id and reason_id.

### Attendance and Extra Duty
- One attendance result per scheduled employee per shift instance; scheduled employees absent from the attended list are recorded as Absent.
- Shift assignments are effective-dated so historical schedules do not change when staffing changes.
- For each holiday/festival attendance, count the employee's regular working-day attendances in that same calendar month. At 7 or more, classify holiday attendance as Extra Duty; below 7, classify it as Actual Duty.
- Re-evaluate holiday classification when later regular attendance is entered in the same month. Keep the source attendance intact and record each recalculation/audit event.
- Monthly totals separately show Actual Duty, Extra Duty and Total Attended.

### Shift staff and trucks
- Exactly one common role assignment per shift for each required role: Packing PLC Operator, Truck Loading Operator and Shift Incharge (subject to the user's later confirmation whether a role may be vacant).
- Truck quantity must be non-negative. Vehicle number is stored as entered after a normalized comparison key is considered for duplicate detection.
- Do not add loading start/end time columns.
- Index truck loads by shift_instance_id, product_id and vehicle number.

## 4. Security model to implement after role inspection

Do not infer permissions from frontend visibility or user-editable auth metadata. First inspect the current profile/role source, existing RLS policies, grants and authentication flow.

Proposed access matrix (to be mapped to the verified existing roles):

| Action | Admin | Operational uploader | Viewer |
|---|---:|---:|---:|
| View Packing Plant reports | Yes | Yes | Yes |
| Enter/edit operational data | Yes | Assigned scope only | No |
| Manage packer/product/shift/reason/employee masters | Yes | No | No |
| Finalize/reopen shift | Yes | Only if explicitly granted | No |
| Download/share reports | Yes | Yes | Yes |

- Enable RLS on every exposed new table.
- Use explicit grants and policies for each operation; authenticated status alone is not authorization.
- UPDATE policies must have both `USING` and `WITH CHECK` predicates.
- Do not use user-editable `user_metadata` for authorization.
- Never expose service-role or secret keys in browser code.
- Any report view exposed through the Data API must use `security_invoker = true` where it should respect underlying RLS; test access as Admin, uploader and viewer.
- Prefer invoker-rights functions. Any function requiring elevated rights needs a separate security review and explicit authorization checks.

## 5. Finalization workflow

1. Create or open one shift instance for the selected business date and shift.
2. Enter production quantities and all running intervals for each packer/product.
3. Validate that no packer has overlapping running intervals and that all intervals fit inside the shift.
4. Derive gaps across the complete shift window. If running data is incomplete, mark the shift Provisional.
5. When running data is complete, classify every stoppage gap with one of the five categories and a reason from that category.
6. Enter the three common shift staff assignments, attendance and individual truck loads.
7. Run validations and preview calculated production, running hours, stoppage hours, utilization, attendance and truck summaries.
8. Finalize only after all required validations pass. Corrections after finalization must be auditable.

## 6. Required test cases before production

- A Shift: 06:00–14:00 with leading, intermediate and trailing gaps.
- B Shift: PPC-to-OPC product switch with multiple intervals.
- C Shift: business date 21-Nov-2026, actual time 21-Nov 22:00 to 22-Nov 06:00; verify 2-hour + 6-hour segments, 8-hour total and no false midnight stoppage.
- Reject PPC/OPC overlapping intervals on the same packer.
- Zero running hours displays N/A utilization.
- Capacity utilization uses combined PPC + OPC production and weighted plant-level aggregation.
- Provisional gaps are not treated as final stoppages.
- Reason/category snapshots survive master edits/deactivation.
- Holiday attendance is Actual Duty below 7 regular attendances and is reclassified Extra Duty when the employee reaches 7 in that same calendar month.
- Truck counts and product quantities reconcile to individual truck records.
- Admin, uploader and viewer access tests confirm that no role can access unauthorized rows or operations.
- Regression tests confirm Dispatch Reports, Weighbridge Reports and existing Packing Bags screens/data remain unchanged.

## 7. Current approval boundary and next work

This proposal does not authorize database writes. No migration, table, policy, function, trigger or deployment is created by this document.

Next safe engineering step: inspect the actual portal source tree and identify its framework, routes, auth integration, existing Packing Bags data access and UI conventions. Then implement the first Packing Plant screen prototype on the development branch using mock/local data only, keeping all live modules untouched. A physical migration is prepared separately for review and requires explicit approval before application.
