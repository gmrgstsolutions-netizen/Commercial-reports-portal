# Verified Supabase Backend Inventory

Read-only inspection performed on 21-Nov-2026 against project `arimgpcocnbuumwfxkmp`.

## Safety boundary
- Inspection used metadata and function-definition reads only.
- No production tables, rows, policies, functions, migrations, or settings were changed.
- The replacement portal must not query private-schema tables directly from the browser.
- Use existing authenticated RPCs where suitable. Review each SECURITY DEFINER function's authorization logic before exposing it in the new UI.
- This is a starting inventory; verify complete JSON response shapes and compare report totals before final layouts.

## Identity and roles
`public.profiles`: `id`, `email`, `full_name`, `role`, `is_active`, `created_at`, `must_change_password`.

Allowed role values include `admin`, `dispatch_uploader`, `weighbridge_uploader`, `uploader`, and `viewer`. Enforce permissions on the backend. Existing RPCs do not all share one role rule. For example, invoice-wise permits active Viewer/Admin, while transporter-wise also checks the viewer permission key `transporter_dispatch`.

## Dispatch data stores
- `private.report_saved_lines`: line key, report date, product code/name, kind, quantity, truck/count, source reference, carrier, state, district, order number and customer.
- `private.cement_dispatch_details`: invoice/date/product/quantity, invoice amount, OA number, packslip, sales channel, transporter code/name, warehouse, district/state, customer, vehicle, taxable value, GST components and totals.
- `private.clinker_dispatch_invoices`: invoice/date, dispatch date, product, quantity, vehicle, source key, import timestamp, customer code/name.
- `private.clinker_dispatch_source_files`: source filename, period range, invoice count, total quantity and completion timestamp.
- `private.report_import_lines`: staged import rows with import/owner IDs, line key, date, product, kind, quantity, truck, source reference, carrier, state, district, order and customer.

## Dispatch RPCs discovered
| RPC | Arguments | Return |
|---|---|---|
| `get_state_district_report` | `p_date date` | JSONB |
| `get_transporter_dispatch_report` | `p_date date` | JSONB |
| `get_under_loading_report` | `p_date date` | JSONB |
| `get_invoice_wise_report_v2` | optional month array, from/to dates, invoice/customer/product/channel/OA/packslip/vehicle/state/district/transporter filters, limit | JSONB |
| `get_clinker_customer_report` | `p_date date` | JSONB |
| `get_trade_non_dispatches` | `p_month date` | JSONB |
| `get_month_wise_yearly_report` | `p_fy_start integer` | JSONB |
| `get_report_daily_totals` | none | JSONB |
| `get_latest_data_upload_details` | none | JSONB |
| `get_latest_data_upload` | none | timestamp |

Import pipeline RPCs also exist: `stage_report_lines`, `commit_report_lines`, `save_report_upload`, `save_report_history`, and `save_cement_dispatch_details`. Do not call write RPCs during report browsing.

The invoice-wise RPC supports optional date bounds and filters, enforces active Viewer/Admin access and caps rows at 1,000. Transporter-wise returns separate cement and clinker rows/totals, normalizes transporter aliases and checks the viewer's `transporter_dispatch` permission.

## Weighbridge data stores
- `private.weighbridge_completed`: line key, pass/RF/vehicle/DC, DC date/quantity, material, from/to, transporter/supplier, weigh type/shift, first/second weights/dates/times, net weight, time difference, source filename, uploader and timestamp.
- `private.weighbridge_under_loading`: line key/report date, pass/RF/vehicle, PO/LR/DC details, material, transporter/supplier, weigh type/shift, first weighment, invoice details, source filename and audit fields.
- `private.weighbridge_outside_gate`: line key, entry timestamp, RF/vehicle/material, from/to, transporter/supplier, invoice weight, DC details, source filename and audit fields.
- `private.weighbridge_upload_log`: dataset, filename, source/inserted/duplicate row counts, uploader and timestamp.

## Weighbridge RPCs discovered
| RPC | Arguments | Return |
|---|---|---|
| `get_weighbridge_report` | `p_date date` | JSONB |
| `get_weighbridge_report_base` | `p_date date` | JSONB |
| `get_weighbridge_product_summary` | `p_date date` | JSONB |
| `get_weighbridge_pending_report` | `p_date date` | table rows |
| `get_weighbridge_outside_report` | `p_date date` | table rows |
| `get_weighbridge_latest_dates` | `p_date date` | JSONB |
| `get_weighbridge_raw_material_report` | optional from/to, pass/RF/vehicle/DC/material/supplier/transporter/shift filters, limit | JSONB |
| `get_weighbridge_transaction_report` | `p_date_from date, p_date_to date` | JSONB |

Raw Materials reads completed `EXTERNAL` weighments only and requires both first and second weighment details plus net weight. It permits one-sided date filters, but rejects both dates absent; the UI should default to the selected/current month when dates are omitted. The RPC caps results at 2,000 and enforces active Viewer/Admin access.

Transaction Report requires both dates, rejects ranges over 93 days, and matches weighbridge records against saved dispatch invoice data. The UI must require a valid date range for this report.

## Data API security note
Do not assume a newly created public table or function is automatically accessible. Confirm explicit grants and RLS together before adding any new object. Reference: https://supabase.com/docs/guides/api/securing-your-api

## Implementation sequence
1. Implement read-only Dispatch screens using verified RPCs, starting with date-driven summaries.
2. Add invoice-wise filters using `get_invoice_wise_report_v2` and respect its 1,000-row cap.
3. Implement Weighbridge Datewise/Pending/Card Issue screens after inspecting full response shapes.
4. Implement Raw Materials with selected-month defaults and optional date filters.
5. Implement transaction matching with a mandatory date range no longer than 93 days.
6. Rebuild upload previews and submit workflows only after each write RPC's role checks, payload schema, duplicate rules and audit behavior are verified.
7. Compare all reports against the live portal using identical dates and filters before staging is accepted.
