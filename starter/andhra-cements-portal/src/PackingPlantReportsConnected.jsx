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
      workbook.subject = "Stoppage Analysis Report";
      workbook.title = "Andhra Cements Limited - Stoppage Analysis";
      const ws = workbook.addWorksheet("Stoppage Analysis", {
        pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.2, right: 0.2, top: 0.25, bottom: 0.25, header: 0.1, footer: 0.1 } }
      });
      ws.properties.defaultRowHeight = 33.95;
      ws.columns = [
        { key: "margin", width: 2.5 }, { key: "counter", width: 13 },
        { key: "date", width: 12 }, { key: "count", width: 11 },
        { key: "stop", width: 8 }, { key: "restart", width: 8 },
        { key: "duration", width: 9 }, { key: "reason", width: 24 },
        { key: "category", width: 19 }, { key: "stoppage", width: 14 },
        { key: "running", width: 12 }, { key: "production", width: 14 }
      ];
      ws.views = [{ showGridLines: false }];
      ws.mergeCells("B2:B5");
      ws.mergeCells("C2:L2"); ws.mergeCells("C3:L3");
      ws.mergeCells("C4:L4"); ws.mergeCells("C5:L5");
      ws.getCell("C2").value = "ANDHRA CEMENTS LIMITED";
      ws.getCell("C3").value = "DACHEPALLI";
      ws.getCell("C4").value = "STOPPAGE ANALYSIS REPORT";
      const dateLabel = (value) => {
        const d = new Date(value + "T00:00:00");
        return d.toLocaleDateString("en-GB");
      };
      ws.getCell("C5").value = fromDate === toDate ? "Date:" + dateLabel(fromDate) : "Period: " + dateLabel(fromDate) + " to " + dateLabel(toDate);
      [2,3,4,5].forEach(r => {
        ws.getRow(r).height = 17;
        const c = ws.getCell("C"+r);
        c.font = { name: "Calibri", size: r===5?9:12, bold: true, color: { argb: r===4 ? "FFC00000" : "FF000000" } };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
        c.alignment = { horizontal: r===5 ? "right" : "center", vertical: "middle" };
        c.border = { top:{style:"thin"},bottom:{style:r===5?"medium":"thin"},left:{style:"thin"},right:{style:"thin"} };
      });
      const imageId = workbook.addImage({ base64: "data:image/png;base64," + logoBase64.trim(), extension: "png" });
      ws.addImage(imageId, { tl: { col: 1, row: 1 }, ext: { width: 105, height: 72 } });

      const headers = ["Stops Counter","Date","STOPs in a Day","Stop","Start","Duration","Reason for Stoppage","Stoppage Category","Day Stoppage Hrs","Day Run.Hrs","Day Prod.(MT)"];
      const merges = ["B","C","D","E","F","G","H","I","J","K","L"];
      merges.forEach(col => ws.mergeCells(col+"6:"+col+"8"));
      headers.forEach((label,i) => {
        const cell = ws.getCell(6,i+2);
        cell.value = label;
        cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FF000000" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7E6E6" } };
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        cell.border = { top:{style:"medium"},bottom:{style:"medium"},left:{style:"thin"},right:{style:"thin"} };
      });
      [6,7,8].forEach(r => ws.getRow(r).height = 18);

      const order = { "Packer 1":1, "Bulk Loading":2, "Packer 2":3, "Packer 3":4 };
      const groups = [...stoppageGroups].sort((a,b) => String(a.date).localeCompare(String(b.date)) || (order[a.asset]||9)-(order[b.asset]||9));
      const productionCells = [];
      let rowNo = 9;
      const timeValue = (value) => {
        if (value===null || value===undefined || value==="") return null;
        if (typeof value==="number") return value>=0 && value<1 ? value : null;
        if (value instanceof Date) return (value.getHours()*3600+value.getMinutes()*60+value.getSeconds())/86400;
        const m=String(value).match(/(\\d{1,2}):(\\d{2})(?::(\\d{2}))?/);
        return m ? (Number(m[1])*3600+Number(m[2])*60+Number(m[3]||0))/86400 : null;
      };
      const thinBorder = { top:{style:"thin"},bottom:{style:"thin"},left:{style:"thin"},right:{style:"thin"} };
      for (const group of groups) {
        const details = group.rows.filter(x => x.stop_number!==null && x.stop_number!==undefined).sort((a,b)=>Number(a.stop_number)-Number(b.stop_number));
        const summary = group.rows.find(x => Number(x.day_stoppage_hours)||Number(x.day_running_hours)||Number(x.day_production_mt)) || group.rows[0] || {};
        const section = ws.getRow(rowNo);
        ws.mergeCells(rowNo,2,rowNo,12);
        const label = group.asset==="Bulk Loading" ? "Bulk" : group.asset==="Packer 3" ? "PACKER -3" : group.asset.toUpperCase().replace("PACKER ","PACKER-");
        section.getCell(2).value = label;
        section.getCell(2).font = { name:"Calibri",size:11,bold:true,color:{argb:"FF000000"} };
        section.getCell(2).fill = { type:"pattern",pattern:"solid",fgColor:{argb:"FFE7E6E6"} };
        section.getCell(2).alignment = { horizontal:"center",vertical:"middle" };
        section.getCell(2).border = { top:{style:"medium"},bottom:{style:"thin"},left:{style:"medium"},right:{style:"medium"} };
        section.height = 20;
        rowNo++;
        const items = details.length ? details : [null];
        const first = rowNo;
        items.forEach((item,index) => {
          const row = ws.getRow(rowNo);
          row.getCell(2).value = item ? (item.stop_number??index+1) : "";
          row.getCell(3).value = group.date ? new Date(group.date+"T00:00:00") : "";
          row.getCell(4).value = details.length;
          row.getCell(5).value = item ? timeValue(item.stop_time) : "";
          row.getCell(6).value = item ? timeValue(item.start_time) : "";
          row.getCell(7).value = item && Number.isFinite(Number(item.duration_hours)) ? Number(item.duration_hours)/24 : "";
          row.getCell(8).value = item ? (item.reason??"") : "No stoppage recorded";
          row.getCell(9).value = item ? (item.stoppage_classification??"") : "";
          for(let col=2;col<=12;col++){
            const cell=row.getCell(col);
            cell.font={name:"Calibri",size:10,bold:false,color:{argb:"FF000000"}};
            cell.alignment={horizontal:"center",vertical:"center",wrapText:true};
            cell.border=thinBorder;
          }
          row.getCell(3).numFmt="dd.mm.yyyy";
          row.getCell(5).numFmt="hh:mm"; row.getCell(6).numFmt="hh:mm"; row.getCell(7).numFmt="[h]:mm";
          row.height=21;
          rowNo++;
        });
        const last = rowNo-1;
        for(const col of [10,11,12]) ws.mergeCells(first,col,last,col);
        ws.getCell(first,10).value=(Number(summary.day_stoppage_hours)||0)/24;
        ws.getCell(first,11).value=(Number(summary.day_running_hours)||0)/24;
        ws.getCell(first,12).value=Number(summary.day_production_mt)||0;
        ws.getCell(first,10).numFmt="[h]:mm"; ws.getCell(first,11).numFmt="[h]:mm"; ws.getCell(first,12).numFmt="0.00";
        for(const col of [10,11,12]){
          const cell=ws.getCell(first,col);
          cell.font={name:"Calibri",size:10,bold:false,color:{argb:"FF000000"}};
          cell.alignment={horizontal:"center",vertical:"center",wrapText:true};
          cell.border=thinBorder;
        }
        productionCells.push("L"+first);
        rowNo++;
      }
      const totalRow = rowNo+2;
      ws.mergeCells(totalRow,10,totalRow,11);
      const totalLabel = ws.getCell(totalRow,10);
      totalLabel.value = "TOTAL PRODUCTION (MT)";
      totalLabel.font = { name:"Calibri",size:11,bold:true,color:{argb:"FF000000"} };
      totalLabel.alignment = { horizontal:"right",vertical:"middle" };
      totalLabel.fill = { type:"pattern",pattern:"solid",fgColor:{argb:"FFE7E6E6"} };
      totalLabel.border = { top:{style:"medium"},bottom:{style:"medium"},left:{style:"thin"},right:{style:"thin"} };
      const totalValue = ws.getCell(totalRow,12);
      totalValue.value = productionCells.length ? { formula:"SUM("+productionCells.join(",")+")" } : 0;
      totalValue.font = { name:"Calibri",size:12,bold:true,color:{argb:"FF000000"} };
      totalValue.numFmt="0.00";
      totalValue.alignment={horizontal:"center",vertical:"middle"};
      totalValue.fill = { type:"pattern",pattern:"solid",fgColor:{argb:"FFFFF2CC"} };
      totalValue.border = { top:{style:"medium"},bottom:{style:"medium"},left:{style:"thin"},right:{style:"medium"} };
      ws.getRow(totalRow).height=22;
      ws.pageSetup.printArea="B2:L"+totalRow;
      ws.pageSetup.printTitlesRow="2:8";
      ws.pageSetup.horizontalCentered=true;
      const buffer=await workbook.xlsx.writeBuffer();
      const blob=new Blob([buffer],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
      const url=URL.createObjectURL(blob);
      const link=document.createElement("a");
      link.href=url; link.download="Stoppage_Analysis_Report_"+fromDate+"_to_"+toDate+".xlsx";
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
