import React, { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

const REPORTS = [
  { key: "shift_production", label: "Shift-wise Packing Production", note: "Actual recorded PPC/OPC production and running hours by business date, shift, packer and product." },
  { key: "daily_summary", label: "Daily Packing Summary", note: "Shift-wise production, number of active packers and truck-loading quantity." },
  { key: "production_dispatch", label: "Production vs Dispatch", note: "Daily product-wise production compared with cement and clinker dispatch. Difference = production minus dispatch." },
  { key: "dispatch_reconciliation", label: "Packing Dispatch Reconciliation", note: "Vehicle and date matching between dispatch invoice quantities and completed weighbridge net weights. Differences require review; this is not an invoice-level weighment allocation." },
  { key: "raw_material_receipts", label: "Weighbridge Raw Material Receipts", note: "External-type inward weighments grouped by date, material and supplier. Cement/CLN dispatch weighments and outgoing scrap are excluded; missing shifts remain unclassified." },
  { key: "monthly_performance", label: "Monthly / FY Packing Performance", note: "Monthly production compared with cement and clinker dispatch for the selected date range. FY range can be selected as 1 April to 31 March." }
];

const LABELS = {
  business_date: "Business Date", shift_code: "Shift", packer_code: "Packer", product_code: "Product",
  production_mt: "Production (MT)", running_hours: "Running Hours", active_packers: "Active Packers",
  truck_loading_mt: "Truck Loading (MT)", product: "Product", dispatch_mt: "Dispatch (MT)",
  difference_mt: "Difference (MT)", dispatch_date: "Dispatch Date", vehicle_no: "Vehicle Number",
  invoice_numbers: "Invoice Numbers", invoice_lines: "Invoice Lines", weighbridge_mt: "Weighbridge (MT)",
  weighment_records: "Weighment Records", match_status: "Match Status", receipt_date: "Receipt Date",
  material_group: "Category", material: "Material", supplier: "Supplier", transactions: "Transactions",
  net_mt: "Net Weight (MT)", unclassified_shift_records: "Unclassified Shift Records", month: "Month"
};

const NUMERIC = new Set(["production_mt","running_hours","active_packers","truck_loading_mt","dispatch_mt","difference_mt","invoice_lines","weighbridge_mt","weighment_records","transactions","net_mt","unclassified_shift_records"]);

function display(value, key) {
  if (value === null || value === undefined || value === "") return "—";
  if (NUMERIC.has(key)) return Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return String(value);
}

export default function PackingPlantReportsConnected({ supabase }) {
  const [reportKey, setReportKey] = useState("shift_production");
  const [fromDate, setFromDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toLocaleDateString("en-CA"));
  const [toDate, setToDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selected = REPORTS.find(r => r.key === reportKey) || REPORTS[0];
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const columns = useMemo(() => {
    const preferred = Object.keys(rows[0] || {});
    return preferred;
  }, [rows]);

  async function loadReport() {
    if (!supabase) return;
    if (!fromDate || !toDate) { setError("Please select both From Date and To Date."); return; }
    if (fromDate > toDate) { setError("From Date must not be after To Date."); return; }
    setBusy(true); setError("");
    try {
      const { data: result, error: rpcError } = await supabase.rpc("get_packing_plant_integrated_report", {
        p_report_key: reportKey, p_date_from: fromDate, p_date_to: toDate
      });
      if (rpcError) throw rpcError;
      setData(result || { rows: [] });
    } catch (e) {
      setData(null);
      setError(e.message || "Unable to load this Packing Plant report.");
    } finally { setBusy(false); }
  }

  useEffect(() => { loadReport(); }, [reportKey]);

  const totals = useMemo(() => {
    const totalKeys = columns.filter(k => NUMERIC.has(k) && k !== "active_packers");
    return Object.fromEntries(totalKeys.map(k => [k, rows.reduce((sum, row) => sum + (Number(row[k]) || 0), 0)]));
  }, [columns, rows]);

  return <section>
    <div className="section-head">
      <div><span className="eyebrow">PACKING PLANT · INTEGRATED REPORTS</span><h1>{selected.label}</h1><p className="muted">Connected to Packing Plant, Dispatch and Weighbridge data. Source records are read-only.</p></div>
      <div className="date-tools">
        <label>From Date<input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} /></label>
        <label>To Date<input type="date" value={toDate} onChange={e => setToDate(e.target.value)} /></label>
        <button className="secondary" onClick={loadReport} disabled={busy}><RefreshCw size={16}/>Refresh</button>
      </div>
    </div>
    <div className="panel">
      <div className="panel-title"><h3>Select report</h3><span className="pill">{fromDate} to {toDate}</span></div>
      <div className="mapping-grid"><label>Report<select value={reportKey} onChange={e => setReportKey(e.target.value)}>{REPORTS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}</select></label></div>
      <p className="footnote">{selected.note}</p>
    </div>
    {error && <div className="alert error">{error}</div>}
    {busy && <div className="panel"><p>Loading report from Supabase…</p></div>}
    {!busy && data && <div className="panel">
      <div className="panel-title"><h3>{selected.label}</h3><span className="pill">{rows.length.toLocaleString("en-IN")} rows · MT where applicable</span></div>
      {rows.length ? <div className="table-scroll"><table><thead><tr>{columns.map(k => <th key={k}>{LABELS[k] || k.replace(/_/g, " ")}</th>)}</tr></thead><tbody>
        {rows.map((row, i) => <tr key={i}>{columns.map(k => <td key={k} className={NUMERIC.has(k) ? "num" : ""}>{display(row[k], k)}</td>)}</tr>)}
        {Object.keys(totals).length > 0 && <tr className="total">{columns.map((k,i) => <td key={k} className={NUMERIC.has(k) ? "num" : ""}>{i===0 ? "Grand Total" : Object.prototype.hasOwnProperty.call(totals,k) ? display(totals[k],k) : ""}</td>)}</tr>}
      </tbody></table></div> : <p className="muted">No records found for the selected dates. Production reports will populate after Packing Plant shift entries are saved.</p>}
    </div>}
    <div className="alert warning">Important: vehicle/date reconciliation is an indicative comparison, not proof that a particular weighment belongs to a particular invoice. Review differences before taking action. Raw Material Receipts includes only External-type inward movements; Cement/CLN weighments are treated as finished-product dispatch, and Outgoing scrap is excluded. These are receipts, not consumption.</div>
  </section>;
}
