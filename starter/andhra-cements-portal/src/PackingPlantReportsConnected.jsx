import React, { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import logoBase64 from "./andhra-cements-logo.txt?raw";

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

  async function downloadExcel() {
    if (!rows.length) return;
    if (reportKey === "daily_stoppage") {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Andhra Cements Limited";
      workbook.subject = "Packing Plant Stoppage Analysis";
      workbook.title = "Stoppage Analysis Report";
      workbook.created = new Date();
      const ws = workbook.addWorksheet("Stoppage Analysis", {
        pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.2, right: 0.2, top: 0.35, bottom: 0.35, header: 0.1, footer: 0.1 } },
        views: [{ state: "frozen", ySplit: 8 }]
      });
      ws.columns = [
        { key: "margin", width: 3 }, { key: "counter", width: 18 },
        { key: "date", width: 14 }, { key: "count", width: 14 },
        { key: "stop", width: 12 }, { key: "restart", width: 12 },
        { key: "duration", width: 13 }, { key: "reason", width: 34 },
        { key: "category", width: 22 }, { key: "stoppage", width: 19 },
        { key: "running", width: 17 }, { key: "production", width: 18 }
      ];
      ws.mergeCells("B2:B5");
      ws.mergeCells("C2:L2");
      ws.mergeCells("C3:L3");
      ws.mergeCells("C4:L4");
      ws.mergeCells("C5:L5");
      ws.getCell("C2").value = "ANDHRA CEMENTS LIMITED";
      ws.getCell("C3").value = "DACHEPALLI";
      ws.getCell("C4").value = "STOPPAGE ANALYSIS REPORT";
      ws.getCell("C5").value = fromDate === toDate
        ? "Date: " + new Date(fromDate + "T00:00:00").toLocaleDateString("en-GB")
        : "Period: " + new Date(fromDate + "T00:00:00").toLocaleDateString("en-GB") + " to " + new Date(toDate + "T00:00:00").toLocaleDateString("en-GB");
      ws.getRow(2).height = 25; ws.getRow(3).height = 22; ws.getRow(4).height = 24; ws.getRow(5).height = 22;
      for (const cell of ["C2","C3","C4","C5"]) {
        ws.getCell(cell).alignment = { horizontal: "center", vertical: "middle" };
        ws.getCell(cell).font = { name: "Tahoma", bold: true, color: { argb: "FF202020" } };
      }
      ws.getCell("C2").font = { name: "Tahoma", size: 16, bold: true, color: { argb: "FF202020" } };
      ws.getCell("C3").font = { name: "Tahoma", size: 12, bold: true };
      ws.getCell("C4").font = { name: "Tahoma", size: 14, bold: true, color: { argb: "FF17365D" } };
      ws.getCell("C5").font = { name: "Tahoma", size: 10, bold: true };
      const imageId = workbook.addImage({ base64: "data:image/png;base64," + logoBase64.trim(), extension: "png" });
      ws.addImage(imageId, { tl: { col: 1.15, row: 1.15 }, ext: { width: 66, height: 66 } });

      const headers = ["Stops Counter","Date","STOPs in a Day","Stop","Start","Duration","Reason for Stoppage","Stoppage Category","Day Stoppage Hrs","Day Run.Hrs","Day Prod.(MT)"];
      const headerRow = ws.getRow(6);
      headers.forEach((v,i) => {
        const cell = headerRow.getCell(i+2);
        cell.value = v;
        cell.font = { name: "Tahoma", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF24476B" } };
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        cell.border = { top: { style: "thin", color: { argb: "FF263746" } }, bottom: { style: "thin", color: { argb: "FF263746" } }, left: { style: "thin", color: { argb: "FF263746" } }, right: { style: "thin", color: { argb: "FF263746" } } };
      });
      headerRow.height = 38;
      for (let col=2; col<=12; col++) ws.mergeCells(6,col,8,col);
      const order = { "Packer 1": 1, "Bulk Loading": 2, "Packer 2": 3, "Packer 3": 4 };
      const sortedGroups = [...stoppageGroups].sort((a,b) => String(a.date).localeCompare(String(b.date)) || (order[a.asset]||9)-(order[b.asset]||9));
      const productionTotalCells = [];
      let rowNo = 9;
      const toTimeFraction = (v) => {
        if (v === null || v === undefined || v === "") return null;
        if (typeof v === "number") return v >= 0 && v < 1 ? v : null;
        if (v instanceof Date) return (v.getHours()*3600+v.getMinutes()*60+v.getSeconds())/86400;
        const m = String(v).match(/(\\d{1,2}):(\\d{2})(?::(\\d{2}))?/);
        return m ? (Number(m[1])*3600+Number(m[2])*60+Number(m[3]||0))/86400 : v;
      };
      for (const group of sortedGroups) {
        const details = group.rows.filter(x => x.stop_number !== null && x.stop_number !== undefined).sort((a,b) => Number(a.stop_number)-Number(b.stop_number));
        const summary = group.rows.find(x => Number(x.day_stoppage_hours)||Number(x.day_running_hours)||Number(x.day_production_mt)) || group.rows[0] || {};
        const stopTotal = Number(summary.day_stoppage_hours)||0;
        const runTotal = Number(summary.day_running_hours)||0;
        const prodTotal = Number(summary.day_production_mt)||0;
        const items = details.length ? details : [null];
        const sectionRow = ws.getRow(rowNo);
        ws.mergeCells(rowNo,2,rowNo,12);
        sectionRow.getCell(2).value = group.asset === "Packer 3" ? "PACKER -3" : group.asset === "Bulk Loading" ? "Bulk" : group.asset.toUpperCase().replace("PACKER ","PACKER-");
        sectionRow.getCell(2).font = { name: "Tahoma", size: 11, bold: true, color: { argb: "FF17365D" } };
        sectionRow.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE6F1" } };
        sectionRow.getCell(2).alignment = { vertical: "middle", horizontal: "left" };
        sectionRow.height = 23;
        rowNo++;
        const firstDataRow = rowNo;
        for (let i=0; i<items.length; i++) {
          const item = items[i];
          const row = ws.getRow(rowNo);
          row.getCell(2).value = item ? (item.stop_number ?? i+1) : "";
          row.getCell(3).value = group.date ? new Date(group.date + "T00:00:00") : "";
          row.getCell(4).value = details.length;
          row.getCell(5).value = item ? toTimeFraction(item.stop_time) : "";
          row.getCell(6).value = item ? toTimeFraction(item.start_time) : "";
          row.getCell(7).value = item && Number.isFinite(Number(item.duration_hours)) ? Number(item.duration_hours)/24 : "";
          row.getCell(8).value = item ? (item.reason ?? "") : "No stoppage recorded";
          row.getCell(9).value = item ? (item.stoppage_classification ?? "") : "";
          row.eachCell({ includeEmpty: true }, cell => {
            if (cell.col < 2 || cell.col > 12) return;
            cell.font = { name: "Tahoma", size: 9, color: { argb: "FF202020" } };
            cell.alignment = { vertical: "middle", horizontal: [2,3,4,5,6,7,10,11,12].includes(cell.col) ? "center" : "left", wrapText: true };
            cell.border = { top: { style: "thin", color: { argb: "FF9EADBA" } }, bottom: { style: "thin", color: { argb: "FF9EADBA" } }, left: { style: "thin", color: { argb: "FF9EADBA" } }, right: { style: "thin", color: { argb: "FF9EADBA" } } };
            if (i % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F6F9" } };
          });
          row.getCell(3).numFmt = "dd.mm.yyyy";
          row.getCell(5).numFmt = "hh:mm"; row.getCell(6).numFmt = "hh:mm"; row.getCell(7).numFmt = "[h]:mm";
          row.height = 25;
          rowNo++;
        }
        const lastDataRow = rowNo - 1;
        for (const col of [10,11,12]) ws.mergeCells(firstDataRow,col,lastDataRow,col);
        ws.getCell(firstDataRow,10).value = stopTotal/24;
        ws.getCell(firstDataRow,11).value = runTotal/24;
        ws.getCell(firstDataRow,12).value = prodTotal;
        ws.getCell(firstDataRow,10).numFmt = "[h]:mm";
        ws.getCell(firstDataRow,11).numFmt = "[h]:mm";
        ws.getCell(firstDataRow,12).numFmt = "#,##0.00";
        for (const col of [10,11,12]) {
          const cell=ws.getCell(firstDataRow,col);
          cell.font={name:"Tahoma",size:9,bold:true,color:{argb:"FF202020"}};
          cell.alignment={horizontal:"center",vertical:"middle"};
          cell.border={top:{style:"thin",color:{argb:"FF9EADBA"}},bottom:{style:"thin",color:{argb:"FF9EADBA"}},left:{style:"thin",color:{argb:"FF9EADBA"}},right:{style:"thin",color:{argb:"FF9EADBA"}}};
        }
        productionTotalCells.push("L"+firstDataRow);
        rowNo++;
      }
      rowNo++;
      ws.mergeCells(rowNo,10,rowNo,11);
      ws.getCell(rowNo,10).value = "TOTAL PRODUCTION (MT)";
      ws.getCell(rowNo,10).font = { name: "Tahoma", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      ws.getCell(rowNo,10).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF24476B" } };
      ws.getCell(rowNo,10).alignment = { horizontal: "right", vertical: "middle" };
      ws.getCell(rowNo,12).value = productionTotalCells.length ? { formula: "SUM(" + productionTotalCells.join(",") + ")" } : 0;
      ws.getCell(rowNo,12).numFmt = "#,##0.00";
      ws.getCell(rowNo,12).font = { name: "Tahoma", size: 10, bold: true, color: { argb: "FF202020" } };
      ws.getCell(rowNo,12).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE699" } };
      ws.getCell(rowNo,12).alignment = { horizontal: "center", vertical: "middle" };
      ws.getRow(rowNo).height = 25;
      ws.autoFilter = undefined;
      ws.pageSetup.printArea = "B2:L" + rowNo;
      ws.pageSetup.horizontalCentered = true;
      ws.headerFooter.oddFooter = "&CAndhra Cements Limited - Packing Plant";
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "Stoppage_Analysis_Report_" + fromDate + "_to_" + toDate + ".xlsx";
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
      return;
    }
    const wb = XLSX.utils.book_new();
    const totalKeys=columns.filter(k=>NUMERIC.has(k)&&k!=="active_packers"&&k!=="stop_number");
    const totalRow=Object.fromEntries(columns.map((key,i)=>[key,i===0?"Grand Total":totalKeys.includes(key)?rows.reduce((sum,row)=>sum+(Number(row[key])||0),0):""]));
    const exportRows=[...rows,totalRow].map(row=>Object.fromEntries(columns.map(key=>[LABELS[key]||key.replace(/_/g," "),row[key]??""])));
    const ws=XLSX.utils.json_to_sheet(exportRows);
    ws["!cols"]=columns.map(key=>({wch:Math.max(14,Math.min(30,(LABELS[key]||key).length+4))}));
    XLSX.utils.book_append_sheet(wb,ws,"Packing Report");
    XLSX.writeFile(wb,"Packing_Plant_Report_"+fromDate+"_to_"+toDate+".xlsx");
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
        {stoppageGroups.map((group,gi)=>{
          const details=group.rows.filter(x=>x.stop_number!==null&&x.stop_number!==undefined);
          const running=group.rows.reduce((n,x)=>n+(Number(x.day_running_hours)||0),0);
          const stopped=group.rows.reduce((n,x)=>n+(Number(x.day_stoppage_hours)||0),0);
          const production=group.rows.reduce((n,x)=>n+(Number(x.day_production_mt)||0),0);
          return <div className="stoppage-asset-section" key={gi}>
            <h4>{group.asset}<span>{group.date}</span></h4>
            <div className="table-scroll"><table><thead><tr><th>Stop No.</th><th>Date</th><th>Stop Time</th><th>Restart Time</th><th>Duration (Hours)</th><th>Reason for Stoppage</th><th>Stoppage Category</th><th>Day Stoppage Hours</th><th>Day Running Hours</th><th>Day Production (MT)</th></tr></thead>
              <tbody>{details.length?details.map((row,i)=><tr key={i}><td className="num">{display(row.stop_number,"stop_number")}</td><td>{display(row.business_date)}</td><td>{display(row.stop_time)}</td><td>{display(row.start_time)}</td><td className="num">{display(row.duration_hours,"duration_hours")}</td><td>{display(row.reason)}</td><td>{display(row.stoppage_classification)}</td><td className="num">{Number(row.day_stoppage_hours)?display(row.day_stoppage_hours,"day_stoppage_hours"):""}</td><td className="num">{Number(row.day_running_hours)?display(row.day_running_hours,"day_running_hours"):""}</td><td className="num">{Number(row.day_production_mt)?display(row.day_production_mt,"day_production_mt"):""}</td></tr>):<tr><td colSpan="10" className="muted">No stoppage recorded</td></tr>}</tbody>
            </table></div>
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
