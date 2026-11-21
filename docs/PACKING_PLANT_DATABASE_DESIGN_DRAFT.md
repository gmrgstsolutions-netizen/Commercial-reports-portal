# Packing Plant Database Design (Draft)

Status: logical design only. This document does not create or modify any Supabase tables. Physical schema, migrations, RLS policies and deployment require review and explicit approval.

## Design principles

- Keep the Packing Plant module logically separate from Dispatch Reports and Weighbridge Reports.
- Use stable IDs and foreign keys; do not use employee names, vehicle numbers or labels as primary keys.
- Store timestamps with timezone-aware types and retain the plant's configured local timezone (Asia/Kolkata).
- Store actual calendar timestamps on all running and stoppage intervals.
- Store a separate `shift_business_date` for the date on which the shift began.
- Preserve historical snapshots where a later master-data edit must not rewrite history.
- Use decimal numeric fields for MT and hours; never use floating-point for quantities.
- All operational records should include created_at, created_by, updated_at, updated_by, and status/audit history where applicable.

## Proposed logical entities

| Entity | Purpose | Important relationships / fields |
|---|---|---|
| packers | Three machine master records | code, name, rated_capacity_tph, active |
| shifts | A/B/C shift definitions | code, start_time, end_time, duration_minutes |
| shift_instances | One dated occurrence of a shift | shift_id, shift_business_date, start_at, end_at, status |
| products | PPC and OPC | code, name, active |
| production_entries | MT produced by machine/product/shift | shift_instance_id, packer_id, product_id, quantity_mt |
| running_intervals | Actual run periods | shift_instance_id, packer_id, product_id, start_at, end_at, duration_minutes |
| stoppage_categories | Fixed categories | Mechanical, Electrical, Instrumentation, Operational, Planned |
| stoppage_reasons | Admin-maintained reasons | category_id, reason, active |
| stoppage_entries | Gap classification | shift_instance_id, packer_id, start_at, end_at, duration_minutes, category/reason snapshot |
| shift_staff | Common staff assigned to whole shift | shift_instance_id, staff role, employee_id |
| vehicles / truck_loads | Individual truck loading | shift_instance_id, vehicle_number, product_id, quantity_mt |
| employees | Manpower master | employee_code, display_name, staff_category, active |
| shift_assignments | Scheduled employee/shift mapping | employee_id, shift_id, effective_from, effective_to |
| attendance_entries | Attended employees per shift | shift_instance_id, employee_id, attendance_type |
| holiday_dates | Declared public holiday/festival dates | holiday_date, description, holiday_type |
| attendance_classifications | Derived Actual Duty / Extra Duty result | attendance_entry_id, month eligibility basis, classification, evaluated_at |

## Confirmed master data

### Packers

| Packer code | Display name | Rated capacity |
|---|---|---:|
| P1 | Packer 1 | 120 TPH |
| P2 | Packer 2 | 120 TPH |
| P3 | Packer 3 | 240 TPH |

Exactly three packers are in scope. Packer 3 is the confirmed name (not Packer 4).

### Shifts

| Code | Local start | Local end | Duration |
|---|---:|---:|---:|
| A | 06:00 | 14:00 | 8 hours |
| B | 14:00 | 22:00 | 8 hours |
| C | 22:00 | 06:00 next day | 8 hours |

C Shift is one shift instance with a start-date business key. Its intervals are represented on their actual calendar dates:
- Segment 1: shift start date, 22:00–24:00 (2 hours).
- Segment 2: following date, 00:00–06:00 (6 hours).

Example: C Shift business date 2026-11-21 has actual segment timestamps 2026-11-21 22:00 to midnight and 2026-11-22 midnight to 06:00. Both segments are grouped under the shift business date 2026-11-21 in shift, daily operational, monthly and financial-year reporting. Midnight is a boundary only, not a stoppage.

### Products

- PPC
- OPC

Each packer can run either product and switch products multiple times in a shift.

### Stoppage categories

The five fixed category labels are Mechanical, Electrical, Instrumentation, Operational and Planned. Admin maintains reasons under each category. A saved stoppage must retain a category and reason snapshot, even if the master reason is later edited or deactivated.

## Calculation and validation rules

### Running intervals and stoppages

- Running intervals must belong to a shift instance, packer and product.
- Multiple intervals per packer/product/shift are supported.
- A packer cannot have overlapping running intervals, including overlaps across PPC and OPC.
- Intervals must be within the shift's exact 8-hour time window.
- Split a midnight-crossing shift into actual calendar-date segments for storage/display without changing its single shift identity.
- Derive non-running gaps over the complete shift window: before first run, between runs and after last run.
- Every stoppage gap requires one category and one reason.
- Do not generate a false stoppage at midnight.
- If run data is not yet complete, mark stoppage totals provisional; do not treat missing/incomplete intervals as confirmed stoppages.
- Finalized shifts must have no unclassified stoppage gaps.

### Production and capacity

- Production is entered in MT by shift, packer and product.
- Combined packer production = PPC MT + OPC MT.
- Combined running hours = valid non-overlapping PPC and OPC running time.
- Expected MT = combined running hours × that packer's rated TPH.
- Utilisation % = combined actual MT ÷ expected MT × 100.
- For zero running hours, show N/A rather than divide by zero.
- Plant-level utilisation is calculated as total actual MT ÷ total expected MT, not as an average of packer percentages.

### Attendance and Extra Duty

- Attendance is entered by listing only employees who attended the assigned shift.
- Scheduled employees not listed are Absent; no Leave or Weekly Off categories.
- The manpower list and shift schedule will be supplied later.
- Holiday/festival dates are entered by the user.
- An employee attending a declared holiday/festival date is classified Extra Duty only if they have at least 7 regular working-day attendances in that same calendar month; otherwise classify that attendance as Actual Duty.
- Preserve holiday attendance even if the seven-day threshold is reached later in the month. Re-evaluate classification as monthly attendance is completed.
- Monthly totals show Actual Duty, Extra Duty and Total Attended separately.

### Truck loading

- One record per truck: shift, vehicle number, product, loading quantity in MT and optional remarks.
- No truck loading start/end time fields.
- Aggregate truck count and quantity by product, shift, day and reporting period.

## Security and access design (to be implemented and reviewed)

- Admin: manage masters, reasons, attendance corrections and operational data as authorized.
- Uploader: enter/upload operational data only within assigned permissions.
- Viewer: read/download reports only.
- Enforce authorization in database policies and server-side operations, not only in UI.
- Enable RLS on exposed tables and design policies for the actual role/record access model.
- Do not use user-editable auth metadata as an authorization source.
- Never expose service-role/secret keys to browser code.
- Any privileged database function must be reviewed carefully; prefer invoker rights and avoid unnecessary SECURITY DEFINER functions.
- Record an audit trail for edits, deletions/voids, master changes and finalization.

## Implementation sequence

1. Review this logical model and confirm the plant's local timezone and final role permissions.
2. Inspect the connected Supabase project's existing schema and migration history; do not assume it is empty.
3. Prepare a physical schema and migration plan that cannot disturb Dispatch/Weighbridge objects.
4. Review RLS, grants, indexes, constraints and audit strategy.
5. Test migrations in a non-production/staging environment with sample A/B/C shifts, including the midnight C Shift case.
6. Verify calculations for overlaps, gaps, zero running hours, capacity utilisation, attendance eligibility and truck summaries.
7. Only after explicit approval, apply the migration to the intended environment and verify with test queries.

## Not yet supplied

- Complete employee/manpower master and categories.
- Effective-dated A/B/C employee shift schedule.
- Reason names under the five stoppage categories (Admin can add these later).
- Confirmed role membership and record-level permissions.


## Existing Supabase project inspection (read-only)

The connected Supabase project currently used for Sales Dispatch Reports is active and already contains authentication/profile, dispatch report, and packing-bag inventory tables. This is a shared live backend, not a blank database.

Consequences:
- Do not create, rename, drop, truncate or alter existing Dispatch, Weighbridge, profile, authentication, or packing-bag tables as part of this new module without a separately reviewed migration and explicit approval.
- Before physical schema work, inspect all existing tables, policies, functions, triggers and grants, then agree which existing packing-bag tables the Packing Plant screens will reuse.
- New operational tables should use a consistent, clearly namespaced prefix (for example `pp_`) to avoid collisions with existing objects.
- Preserve the existing user/profile and role model; extend it only after reviewing its current policies and authorization functions.
- This inspection was read-only. No database objects or data were changed.
