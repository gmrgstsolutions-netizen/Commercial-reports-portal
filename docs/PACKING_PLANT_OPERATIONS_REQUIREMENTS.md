# Packing Plant Operations Requirements

Status: requirements collected from the user; implementation and production data capture are not yet complete.

## 1. Scope and preservation

Packing Plant is a full operational module, not only a packing-bag inventory module. It must cover production, packer running time, automatically derived stoppages, capacity utilisation, shift staff, truck loading, manpower attendance, and the existing packing-bag reports.

The portal must continue to preserve the Dispatch Reports and Weighbridge Reports modules. Changes to Packing Plant must not alter their data, permissions, calculations, or screens. This is a separate development branch and must not be deployed to or substituted for the existing live portal without explicit approval.

## 2. Packing plant and machines

- One packing section.
- Three packer machines.
- All three machines can pack both PPC and OPC.
- Machine capacities supplied:
  - Packer 1: 120 TPH
  - Packer 2: 120 TPH
  - Third packer: 240 TPH
- The same capacity applies to PPC and OPC on each machine.

**Machine-label note:** The user first identified the three machines as Packer 1, Packer 2 and Packer 4, then supplied capacities for Packer 1, Packer 2 and Packer 3. They confirmed there are only three machines. Treat the third machine's final display label as pending confirmation; do not silently create a fourth machine.

## 3. Shift and operating-day convention

The operating day is 00:00 through 24:00, using 24-hour time.

| Shift | Start | End | Duration |
|---|---:|---:|---:|
| A | 06:00 | 14:00 | 8 hours |
| B | 14:00 | 22:00 | 8 hours |
| C | 22:00 | 06:00 next day | 8 hours |

All time entry controls use the 24-hour clock (00:00–24:00), with no AM/PM. The C-shift date attribution across midnight should be confirmed before final database/report implementation.

## 4. Shift production entry

Production is entered in MT for each shift, separately for each packer and product:
- Packer 1 / 2 / third packer
- PPC production (MT)
- OPC production (MT)

The system calculates shift, daily, monthly and financial-year totals by packer and product. A packer may switch between PPC and OPC during a shift.

## 5. Running intervals

Running time is captured by start and stop entries, not by manually entering total hours.

- Each running interval belongs to a date, shift, packer and product (PPC or OPC).
- Multiple start/stop intervals are allowed for the same packer and product in a shift.
- A packer can switch products and later return to the earlier product.
- Running hours are calculated automatically from each interval.
- Use 24-hour time.
- Validate that intervals fall within the applicable shift and do not overlap for the same packer. Do not count overlapping product intervals twice.
- Running hours are reported by product, packer, shift and date.

Example: PPC 06:00–09:00, OPC 09:00–12:00, PPC 12:00–14:00 gives PPC 5 hours and OPC 3 hours.

## 6. Automatically derived stoppages

Users do not enter separate stoppage start/end times. Stoppages are derived from the gaps in a packer's running timeline across the complete 8-hour shift:
- Before the first running interval (e.g. shift begins 06:00, first run starts 07:00).
- Between consecutive running intervals.
- After the final running interval (e.g. final run ends 13:00, shift ends 14:00).

For every derived stoppage interval, the entry screen must request:
1. Stoppage category.
2. Stoppage reason, selected/entered against that category.

Fixed categories:
- Mechanical
- Electrical
- Instrumentation
- Operational
- Planned

A reason master must allow Admin to add, edit and deactivate reasons under each category. Users select a category and a reason from the corresponding list. Preserve the reason text/category on historical stoppage records even if the master is later changed.

Reports must include category-wise, reason-wise, packer-wise, shift-wise, daily, monthly and financial-year stoppage hours, plus planned versus other stoppage totals.

A shift cannot be marked complete while any derived stoppage interval lacks a category/reason. If running data is incomplete, clearly mark stoppage totals as provisional rather than treating missing entries as confirmed stoppages.

## 7. Capacity and performance

Rated capacity is the same for PPC and OPC on each machine:
- Packer 1: 120 MT/hour
- Packer 2: 120 MT/hour
- Third packer: 240 MT/hour (final machine label pending confirmation)

User requested one combined utilisation percentage for PPC and OPC together, not separate product utilisation percentages.

For each packer and shift:
- Actual production = PPC MT + OPC MT.
- Total running hours = sum of valid, non-overlapping PPC and OPC running intervals.
- Expected production = total running hours × rated capacity (TPH).
- Capacity utilisation (%) = actual production ÷ expected production × 100.

Handle zero running hours safely (show N/A rather than divide by zero). Combined utilisation may also be aggregated at plant level using total actual production divided by total expected production; do not average packer percentages.

## 8. Shift-level staff

These staff details are common to the entire packing section for each shift, not separate for each packer:
- Packing PLC Operator
- Truck Loading Operator
- Shift Incharge (staff category)

Packer-specific operator names are not required in the production entry; they are covered by the Packing PLC Operator entry.

## 9. Truck loading register

Capture individual truck records, without loading start/end times:
- Date
- Shift (A/B/C)
- Vehicle number
- Product (PPC/OPC)
- Loading quantity (MT)
- Optional remarks

Automatically calculate truck count and loading MT by product, shift, day and reporting period. Do not add truck loading time fields.

## 10. Manpower and attendance

The user will provide the complete manpower list and shift schedule later. Attendance is entered by selecting only the employees who attended each shift.

Manpower/attendance categories expected:
- Packer Operators
- Loading Operators
- Bulk Loading Operator
- Belt Helpers
- Packing PLC Operator
- Truck Loading Operator
- Shift Incharge

For production shift records, Packing PLC Operator, Truck Loading Operator and Shift Incharge remain common shift-level fields. A separate shift-wise attendance register will maintain the employee attendance list by category.

Rules:
- Employees entered in the shift attendance list are Present.
- Employees not entered are Absent.
- No Leave or Weekly Off status is required.
- Shift schedule defines the employees expected for A, B and C shifts.
- Keep historical shift schedules/assignments effective-dated so later changes do not rewrite past attendance.
- Reports: employee-wise, category-wise, shift-wise and daily/monthly attendance summaries.

## 11. Public holidays, festivals and Extra Duty

The user will provide public-holiday/festival dates for each month and the employees who attended duty on those dates.

Extra Duty eligibility rule:
- An employee must have at least 7 regular working-day attendances in the same calendar month.
- If the employee reaches the 7-day threshold, attendance on the declared public holiday/festival date is classified as Extra Duty.
- If the employee has fewer than 7 regular working-day attendances in that month, attendance on the declared date is classified as Actual Duty.
- No leave/weekly-off categories are used.
- Extra Duty is tracked separately from Actual Duty; total attended days = Actual Duty + Extra Duty.

The month-specific eligibility rule must be applied consistently and transparently. If the holiday occurs before the employee has accumulated seven days, the system should retain the holiday attendance record and recalculate its classification when the month's regular attendance is complete; do not discard attendance or silently mark the employee absent.

## 12. Existing Packing Bags reports

Retain the existing packing-bag screens as a subsection of the expanded Packing Plant module:
- Packing Bags Stock Statement
- Packing Bags Receipts
- Packing Plant Consumption
- Packing Bags Damages
- Daily Packing Summary
- Bag-wise Monthly Summary
- Bag-wise Financial Year Summary
- Upload Data
- Upload History

Existing packing-bag business rules and safeguards remain documented separately. Do not enable receipt import until its migration and import workflow are reviewed, tested and explicitly approved.

## 13. Initial report set

Implement only the agreed reports initially:
- Daily Packer Performance
- Shift-wise Production (PPC/OPC MT)
- Packer-wise Running Hours
- Packer-wise Stoppage Hours
- Category-wise and Reason-wise Stoppage Analysis
- Combined Capacity Utilisation
- Daily, Monthly and Financial Year Production Summary
- Shift-wise Manpower and Attendance
- Employee-wise Attendance
- Extra Duty Register and eligibility
- Truck Loading Summary
- Existing Packing Bags reports

Do not add further reports unless requested by the user.

## 14. Implementation and safety requirements

- Keep source changes on the existing development branch/PR; do not merge or deploy without explicit approval.
- Do not alter production Supabase schema/data until a migration plan is reviewed and the user explicitly approves applying it.
- Enforce role permissions server-side; frontend button hiding is not authorization.
- Use auditable created_by/updated_by and timestamps for operational entries and master changes.
- Prevent duplicate or overlapping running intervals and preserve a clear edit history.
- Clearly distinguish draft, incomplete, provisional and finalized shift records.
- Validate calculations against user-approved sample shifts before production use.

## 15. Open confirmations before final implementation

1. Final display label for the third packer: Packer 3 or Packer 4.
2. Whether C Shift is attributed to its 22:00 start date or split across the two calendar dates in daily reports.
3. Actual shift schedule and manpower master, to be supplied by the user.
4. Whether a shift can be finalized only after all production intervals, derived stoppage reasons, shift staff and truck records are entered.
