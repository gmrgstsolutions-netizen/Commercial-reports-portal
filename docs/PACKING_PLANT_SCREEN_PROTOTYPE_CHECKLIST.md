# Packing Plant Screen Prototype Checklist

Status: development-only UI prototype. The screens use in-browser demonstration state and are not connected to the Packing Plant database. Do not enter actual operational records.

## Current screens

| Screen | Prototype content | Production connection |
|---|---|---|
| Production & Running Hours | Packer 1/2/3, PPC/OPC shift production, multiple run intervals, running time, derived gaps, capacity utilisation | Not connected |
| Shift Registers & Masters — Truck Loading | Date, shift, vehicle, PPC/OPC, MT, optional remarks; truck count, total quantity, product-wise quantity and average quantity per truck | Not connected |
| Shift Registers & Masters — Attendance | Shift attendance checklist, temporary employee list, public holiday/festival list, Actual Duty / Extra Duty preview | Not connected |
| Shift Registers & Masters — Stoppage Reason Master | Fixed five categories, add/edit/deactivate reason entries | Not connected |

## Agreed operational rules represented

- Three packers only: Packer 1 (120 TPH), Packer 2 (120 TPH), Packer 3 (240 TPH).
- A Shift 06:00–14:00; B Shift 14:00–22:00; C Shift 22:00–06:00 next day.
- C Shift belongs to its starting business date. The 22:00–24:00 and 00:00–06:00 calendar segments make one continuous eight-hour shift.
- Production is in MT per shift, packer and product (PPC/OPC).
- Multiple run intervals are allowed; PPC and OPC cannot overlap on the same packer.
- Capacity utilisation is combined PPC+OPC production divided by combined expected production for the packer's total running hours. Plant utilisation is weighted by expected production.
- Stoppage categories are fixed: Mechanical, Electrical, Instrumentation, Operational and Planned. Reasons are maintained under categories.
- Common shift staff are Packing PLC Operator, Truck Loading Operator and Shift Incharge.
- Truck loading has no loading start/end time fields.
- Attendance not marked present is treated as absent according to the effective schedule; no leave or weekly-off status.
- Holiday/festival attendance is Extra Duty only after at least seven regular working-day attendances in the same calendar month; otherwise it is Actual Duty. Re-evaluate earlier holiday classification as later attendance is entered.

## Manual prototype checks

1. Switch between A, B and C Shift on Production & Running Hours; verify the shift window labels.
2. For C Shift, verify the business-date split labels 22:00–24:00 and next date 00:00–06:00.
3. Enter two intervals for different products on one packer. Verify running and stoppage calculations.
4. Create overlapping intervals on the same packer and verify the validation warning.
5. Enter production on PPC and OPC and verify combined packer utilisation and weighted plant utilisation.
6. Add truck entries for PPC and OPC. Verify selected shift truck count, total MT, PPC MT, OPC MT and average MT per truck.
7. Add and deactivate a holiday. Verify the holiday banner appears for the selected attendance date.
8. Set the demonstration prior regular attendance count to 6 and select the employee as present on a holiday; verify Actual Duty. Set it to 7; verify Extra Duty.
9. Add/edit/deactivate a stoppage reason under each fixed category.
10. Confirm all screens visibly state that they are demonstration-only and do not save to Supabase.

## Before production implementation

- Review and approve the physical schema proposal.
- Confirm the final employee master, staff categories, effective shift schedules and holiday list process.
- Inspect current authentication, roles, grants and RLS policies before mapping Admin/uploader/viewer permissions.
- Implement migrations, RLS and server-side validation as a separate reviewed change; do not alter existing Dispatch Reports, Weighbridge Reports or Packing Bags tables.
- Connect UI only after migration review and explicit approval.
- Test C Shift 21-Nov-2026 22:00 through 22-Nov-2026 06:00 end-to-end.
- Run regression tests against existing portal modules.
