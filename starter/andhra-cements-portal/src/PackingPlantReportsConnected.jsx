import React, { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import * as XLSX from "xlsx";

const REPORTS = [
  { key: "shift_production", label: "Daily Packing Production", note: "Dispatch-derived production and adjusted running hours by business date and packing unit." },
  { key: "daily_stoppage", label: "Daily Stoppage Report", note: "Dispatch-derived production with full-day running and stoppage intervals adjusted to the agreed day-wise TPH targets; original stoppage reasons and Planned/Unplanned classification are retained." },
  { key: "daily_summary", label: "Daily Packing Summary", note: "Dispatch-derived production, running hours and truck-loading quantity." },
  { key: "production_dispatch", label: "Dispatch-derived Production", note: "Daily OPC/PPC bagged and bulk production quantities are sourced directly from dispatch data." },
  { key: "day_dispatches", label: "Day Dispatches", note: "Invoice-wise daily cement and clinker dispatches sourced only from uploaded dispatch records. No truck, bag-counting, weighbridge or packslip reconciliation is applied." },
  { key: "raw_material_receipts", label: "Weighbridge Raw Material Receipts", note: "External-type inward weighments grouped by date, material and supplier. Cement/CLN dispatch weighments and outgoing scrap are excluded; missing shifts remain unclassified." },
  { key: "monthly_performance", label: "Monthly / FY Packing Performance", note: "Monthly production compared with cement and clinker dispatch for the selected date range. FY range can be selected as 1 April to 31 March." }
];

const LABELS = {
  business_date: "Business Date", packer_code: "Packer", product_code: "Product", start_time: "Start Time", end_time: "End Time",
  asset_name: "Section", stop_number: "Stop No.", stop_time: "Stop Time", start_time: "Restart Time", duration_hours: "Duration (Hours)", category: "Category", stoppage_classification: "Planned / Unplanned", reason: "Reason", day_stoppage_hours: "Day Stoppage Hours", day_running_hours: "Day Running Hours", day_production_mt: "Day Production (MT)", target_tph: "Target TPH", adjustment_status: "Adjustment Status",
  dispatch_date: "Dispatch Date", invoice_no: "Invoice No.", customer_name: "Customer", vehicle_no: "Vehicle No.", transporter: "Transporter", qty: "Dispatch (MT)", product: "Product",
  production_mt: "Production (MT)", running_hours: "Running Hours", active_packers: "Active Packers",
  truck_loading_mt: "Truck Loading (MT)", dispatch_mt: "Dispatch (MT)", stoppage_hours: "Stoppage Hours",
  difference_mt: "Difference (MT)",
  invoice_numbers: "Invoice Numbers", invoice_lines: "Invoice Lines", weighbridge_mt: "Weighbridge (MT)",
  weighment_records: "Weighment Records", match_status: "Match Status", receipt_date: "Receipt Date",
  material_group: "Category", material: "Material", supplier: "Supplier", transactions: "Transactions",
  net_mt: "Net Weight (MT)", unclassified_shift_records: "Unclassified Shift Records", month: "Month"
};

const NUMERIC = new Set(["production_mt","running_hours","active_packers","truck_loading_mt","dispatch_mt","difference_mt","invoice_lines","weighbridge_mt","weighment_records","transactions","net_mt","unclassified_shift_records","qty","stop_number","duration_hours","day_stoppage_hours","day_running_hours","day_production_mt","target_tph","stoppage_hours"]);

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
  const runningRows = Array.isArray(data?.running_rows) ? data.running_rows : [];
  const stoppageGroups = useMemo(() => {
    if (reportKey !== "daily_stoppage") return [];
    const map = new Map();
    for (const row of rows) {
      const key = [row.business_date, row.asset_name].join("|");
      if (!map.has(key)) map.set(key, { date: row.business_date, asset: row.asset_name, rows: [] });
      map.get(key).rows.push(row);
    }
    const order = {"Packer 1":1,"Bulk Loading":2,"Packer 2":3,"Packer 3":4};
    return [...map.values()].sort((a,b) => String(a.date).localeCompare(String(b.date)) || (order[a.asset]||9)-(order[b.asset]||9));
  }, [reportKey, rows]);

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
      const rpcName = reportKey === "daily_stoppage" ? "get_packing_plant_stoppage_report" : "get_packing_plant_integrated_report";
      const rpcArgs = reportKey === "daily_stoppage" ? { p_date_from: fromDate, p_date_to: toDate } : { p_report_key: reportKey, p_date_from: fromDate, p_date_to: toDate };
      const { data: result, error: rpcError } = await supabase.rpc(rpcName, rpcArgs);
      if (rpcError) throw rpcError;
      setData(result || { rows: [] });
    } catch (e) {
      setData(null);
      setError(e.message || "Unable to load this Packing Plant report.");
    } finally { setBusy(false); }
  }

  function downloadExcel() {
    if (!rows.length) return;
    const wb = XLSX.utils.book_new();
    if (reportKey === "daily_stoppage") {
      const aoa = [["ANDHRA CEMENTS LIMITED – DACHEPALLI"],["STOPPAGE ANALYSIS REPORT"],["Period: " + fromDate + " to " + toDate],[]];
      const merges = [{s:{r:0,c:0},e:{r:0,c:7}},{s:{r:1,c:0},e:{r:1,c:7}},{s:{r:2,c:0},e:{r:2,c:7}}];
      for (const group of stoppageGroups) {
        aoa.push([group.asset + "  |  " + group.date]);
        merges.push({s:{r:aoa.length-1,c:0},e:{r:aoa.length-1,c:7}});
        aoa.push(["Stop No.","Stop Time","Restart Time","Duration (Hours)","Reason for Stoppage","Planned / Unplanned","Target TPH","Adjustment Status"]);
        const details=group.rows.filter(x=>x.stop_number!==null&&x.stop_number!==undefined);
        if(details.length) details.forEach(x=>aoa.push([x.stop_number??"",x.stop_time??"",x.start_time??"",Number(x.duration_hours)||0,x.reason??"",x.stoppage_classification??"",x.target_tph??"",x.adjustment_status??""]));
        else aoa.push(["—","","","","No stoppage recorded","","","""]);
        const running=group.rows.reduce((n,x)=>n+(Number(x.day_running_hours)||0),0);
        const stopped=group.rows.reduce((n,x)=>n+(Number(x.day_stoppage_hours)||0),0);
        const production=group.rows.reduce((n,x)=>n+(Number(x.day_production_mt)||0),0);
        aoa.push(["Daily Total","","","","","","Running Hours",running]);
        aoa.push(["","","","","","","Stoppage Hours",stopped]);
        aoa.push(["","","","","","","Production (MT)",production]);
        aoa.push([]);
      }
      const ws=XLSX.utils.aoa_to_sheet(aoa); ws["!merges"]=merges;
      ws["!cols"]=[{wch:11},{wch:13},{wch:14},{wch:17},{wch:42},{wch:21},{wch:12},{wch:48}];
      XLSX.utils.book_append_sheet(wb,ws,"Stoppage Analysis");
      if (runningRows.length) {
        const runExport = runningRows.map(x => ({
          "Business Date": x.business_date, "Section": x.asset_name,
          "Start Time": x.start_time, "Stop Time": x.end_time,
          "Adjusted Running Hours": x.duration_hours, "Target TPH": x.target_tph,
          "Adjustment Status": x.adjustment_status
        }));
        const runWs = XLSX.utils.json_to_sheet(runExport);
        runWs["!cols"] = [{wch:14},{wch:18},{wch:13},{wch:13},{wch:22},{wch:12},{wch:52}];
        XLSX.utils.book_append_sheet(wb,runWs,"Adjusted Running Hours");
      }
    } else {
      const totalKeys=columns.filter(k=>NUMERIC.has(k)&&k!=="active_packers"&&k!=="stop_number");
      const totalRow=Object.fromEntries(columns.map((key,i)=>[key,i===0?"Grand Total":totalKeys.includes(key)?rows.reduce((sum,row)=>sum+(Number(row[key])||0),0):""]));
      const exportRows=[...rows,totalRow].map(row=>Object.fromEntries(columns.map(key=>[LABELS[key]||key.replace(/_/g," "),row[key]??""])));
      const ws=XLSX.utils.json_to_sheet(exportRows);
      ws["!cols"]=columns.map(key=>({wch:Math.max(14,Math.min(30,(LABELS[key]||key).length+4))}));
      XLSX.utils.book_append_sheet(wb,ws,"Packing Report");
    }
    XLSX.writeFile(wb,(reportKey==="daily_stoppage"?"Stoppage_Analysis_Report_":"Packing_Plant_Report_")+fromDate+"_to_"+toDate+".xlsx");
  }

  useEffect(() => { loadReport(); }, [reportKey]);

  const totals = useMemo(() => {
    const totalKeys = columns.filter(k => NUMERIC.has(k) && k !== "active_packers" && k !== "stop_number");
    return Object.fromEntries(totalKeys.map(k => [k, rows.reduce((sum, row) => sum + (Number(row[k]) || 0), 0)]));
  }, [columns, rows]);

  return <section>
    <div className="section-head">
      <div><span className="eyebrow">PACKING PLANT · INTEGRATED REPORTS</span><h1>{selected.label}</h1><p className="muted">Connected to Packing Plant, Dispatch and Weighbridge data. Source records are read-only.</p></div>
      <div className="date-tools">
        <label>From Date<input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} /></label>
        <label>To Date<input type="date" value={toDate} onChange={e => setToDate(e.target.value)} /></label>
        <button className="secondary" onClick={loadReport} disabled={busy}><RefreshCw size={16}/>Refresh</button>{!busy && rows.length > 0 && <button className="secondary" onClick={downloadExcel}>Download Excel</button>}
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
      {rows.length ? reportKey === "daily_stoppage" ? <div className="stoppage-report">
        <div className="stoppage-report-heading"><strong>ANDHRA CEMENTS LIMITED – DACHEPALLI</strong><b>STOPPAGE ANALYSIS REPORT</b><span>Period: {fromDate} to {toDate}</span></div>
        <div className="stoppage-asset-section">
          <h4>Adjusted Running Intervals</h4>
          <div className="table-scroll"><table><thead><tr><th>Date</th><th>Section</th><th>Start Time</th><th>Stop Time</th><th>Running Hours</th><th>Target TPH</th><th>Adjustment Status</th></tr></thead>
            <tbody>{runningRows.map((row,i)=><tr key={i}><td>{display(row.business_date)}</td><td>{display(row.asset_name)}</td><td>{display(row.start_time)}</td><td>{display(row.end_time)}</td><td className="num">{display(row.duration_hours,"duration_hours")}</td><td className="num">{display(row.target_tph,"target_tph")}</td><td>{display(row.adjustment_status)}</td></tr>)}</tbody>
          </table></div>
        </div>
        {stoppageGroups.map((group,gi)=>{
          const details=group.rows.filter(x=>x.stop_number!==null&&x.stop_number!==undefined);
          const running=group.rows.reduce((n,x)=>n+(Number(x.day_running_hours)||0),0);
          const stopped=group.rows.reduce((n,x)=>n+(Number(x.day_stoppage_hours)||0),0);
          const production=group.rows.reduce((n,x)=>n+(Number(x.day_production_mt)||0),0);
          return <div className="stoppage-asset-section" key={gi}>
            <h4>{group.asset}<span>{group.date}</span></h4>
            <div className="table-scroll"><table><thead><tr><th>Stop No.</th><th>Stop Time</th><th>Restart Time</th><th>Duration (Hours)</th><th>Reason for Stoppage</th><th>Planned / Unplanned</th></tr></thead>
              <tbody>{details.length?details.map((row,i)=><tr key={i}><td className="num">{display(row.stop_number,"stop_number")}</td><td>{display(row.stop_time)}</td><td>{display(row.start_time)}</td><td className="num">{display(row.duration_hours,"duration_hours")}</td><td>{display(row.reason)}</td><td>{display(row.stoppage_classification)}</td></tr>):<tr><td colSpan="6" className="muted">No stoppage recorded</td></tr>}</tbody>
            </table></div>
            <div className="stoppage-summary"><span>Running Hours <b>{running.toFixed(2)}</b></span><span>Stoppage Hours <b>{stopped.toFixed(2)}</b></span><span>Production (MT) <b>{production.toLocaleString("en-IN",{maximumFractionDigits:2})}</b></span></div>
          </div>;
        })}
      </div> : <div className="table-scroll"><table><thead><tr>{columns.map(k => <th key={k}>{LABELS[k] || k.replace(/_/g, " ")}</th>)}</tr></thead><tbody>
        {rows.map((row, i) => <tr key={i}>{columns.map(k => <td key={k} className={NUMERIC.has(k) ? "num" : ""}>{display(row[k], k)}</td>)}</tr>)}
        {Object.keys(totals).length > 0 && <tr className="total">{columns.map((k,i) => <td key={k} className={NUMERIC.has(k) ? "num" : ""}>{i===0 ? "Grand Total" : Object.prototype.hasOwnProperty.call(totals,k) ? display(totals[k],k) : ""}</td>)}</tr>}
      </tbody></table></div> : <p className="muted">No records found for the selected dates. Enter running intervals and classify stoppage periods for the full business date, then save daily records. Production is sourced from dispatch records and intervals are adjusted to the agreed TPH targets.</p>}
    </div>}
    {reportKey === "raw_material_receipts" && <div className="alert warning">Raw Material Receipts includes only External-type inward movements; Cement/CLN weighments and outgoing scrap are excluded.</div>}
  </section>;
}
