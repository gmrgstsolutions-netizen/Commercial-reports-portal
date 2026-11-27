import React, { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import logoBase64 from "./andhra-cements-logo.txt?raw";

const REPORTS = [
  { key: "shift_production", label: "Daily Packing Production", note: "Dispatch-derived production and adjusted running hours by business date and packing unit." },
  { key: "daily_stoppage", label: "Daily Stoppage Report", note: "Dispatch-derived production with full-day running and stoppage intervals adjusted to the agreed day-wise TPH targets; original stoppage reasons and Planned/Unplanned classification are retained." },
  { key: "packing_plant_performance", label: "Packing Plant Performance Report", note: "Day-wise OPC53/PPC performance, packer and bulk quantities, running/stoppage hours, TPH and cumulative dispatch." },
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

function hourClock(value) {
  const minutes = Math.max(0, Math.round((Number(value) || 0) * 60));
  return Math.floor(minutes / 60) + ":" + String(minutes % 60).padStart(2, "0");
}
function reportDate(value) {
  if (!value) return "";
  const [y,m,d] = String(value).slice(0,10).split("-");
  return [d,m,y].join("-");
}
function reportNumber(value) {
  return Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseHistoricalDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return [value.getFullYear(),String(value.getMonth()+1).padStart(2,"0"),String(value.getDate()).padStart(2,"0")].join("-");
  if (typeof value === "number" && value > 20000) {
    const d = XLSX.SSF.parse_date_code(value);
    if (d) return [d.y,String(d.m).padStart(2,"0"),String(d.d).padStart(2,"0")].join("-");
  }
  const raw=String(value??"").trim();
  let m=raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if(m) return m[3]+"-"+m[2].padStart(2,"0")+"-"+m[1].padStart(2,"0");
  m=raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  return m ? m[1]+"-"+m[2].padStart(2,"0")+"-"+m[3].padStart(2,"0") : "";
}
function parseHistoricalHours(value) {
  if (value===null || value===undefined || value==="") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // Excel time-only cells are returned as Date objects. Read local clock components: UTC shifts these 1899-based values by the historical India offset (e.g. 02:00 becomes 20:39).\n    return value.getHours()+value.getMinutes()/60+value.getSeconds()/3600;
  }
  if (typeof value==="number") return value>=0 && value<1 ? value*24 : value;
  const m=String(value).trim().match(/^(\d{1,3}):(\d{1,2})(?::(\d{1,2}))?$/);
  if(m) return Number(m[1])+Number(m[2])/60+Number(m[3]||0)/3600;
  const n=Number(String(value).replace(/,/g,"").trim());
  return Number.isFinite(n) && n>=0 ? n : null;
}

function parseHistoricalPercent(value) {
  if(value===null||value===undefined||String(value).trim()==="") return null;
  const raw=String(value).trim();
  const n=Number(raw.replace(/,/g,"").replace(/%/g,""));
  if(!Number.isFinite(n)||n<0)return null;
  return !raw.includes("%")&&typeof value==="number"&&n<=1?n*100:n;
}
function parseHistoricalStoppageWorkbook(workbook, assetName, fileName) {
  const monthNames=["january","february","march","april","may","june","july","august","september","october","november","december"];
  const reasons=[], summaries=[], errors=[];
  const sheetMonths=[];
  for(const sheetName of workbook.SheetNames) {
    const grid=XLSX.utils.sheet_to_json(workbook.Sheets[sheetName],{header:1,raw:true,defval:null});
    const allText=grid.flat().filter(v=>v!==null&&v!==undefined).map(v=>String(v)).join(" ");
    const monthMatch=allText.match(/(?:month\s+of\s+)?(January|February|March|April|May|June|July|August|September|October|November|December)\s*[-–, ]\s*(20\d{2})/i)
      || sheetName.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s*[-–_ ]\s*(20\d{2})/i);
    if(!monthMatch){errors.push(sheetName+": month and year not found in sheet heading.");continue;}
    const month=monthNames.indexOf(monthMatch[1].toLowerCase())+1, year=Number(monthMatch[2]);
    // Match the actual table header, not the worksheet title ("Stoppage Reasons for the month...").
    const headerIndex=grid.findIndex(row=>{
      const cells=(row||[]).map(v=>String(v??"").trim().toLowerCase());
      return cells.some(v=>/^stoppage\s+reason$/.test(v)) && cells.some(v=>/^sl\s*no\.?$|^s\.?\s*no\.?$/.test(v));
    });
    if(headerIndex<0){errors.push(sheetName+": table header row containing both 'Sl No.' and 'Stoppage Reason' was not found.");continue;}
    // Anchor day columns to the stoppage table. Never search the whole sheet:
    // daily values elsewhere in the worksheet can look like day numbers.
    const monthDays=new Date(year,month,0).getDate();
    const headerCells=grid[headerIndex]||[];
    const slNoCol=headerCells.findIndex(v=>/^sl\s*no\.?$|^s\.?\s*no\.?$/i.test(String(v??"").trim()));
    const reasonCol=headerCells.findIndex(v=>/^stoppage\s+reason$/i.test(String(v??"").trim()));
    if(slNoCol<0||reasonCol<0||reasonCol<=slNoCol){
      errors.push(sheetName+": could not identify the serial-number and reason columns in the table header.");
      continue;
    }
    const dayHeaderCandidates=[];
    for(let rowIndex=Math.max(0,headerIndex-2);rowIndex<=Math.min(grid.length-1,headerIndex+2);rowIndex++){
      const entries=[];
      (grid[rowIndex]||[]).forEach((v,i)=>{
        if(i<=reasonCol)return;
        const raw=String(v??"").trim();
        if(!/^\d{1,2}$/.test(raw))return;
        const day=Number(raw);
        if(day>=1&&day<=monthDays&&!entries.some(x=>x.day===day))entries.push({day,index:i});
      });
      if(entries.length)dayHeaderCandidates.push({rowIndex,entries,distance:Math.abs(rowIndex-headerIndex)});
    }
    dayHeaderCandidates.sort((a,b)=>b.entries.length-a.entries.length||a.distance-b.distance);
    const bestDayHeader=dayHeaderCandidates[0];
    const dayColumns=(bestDayHeader?.entries||[]).sort((a,b)=>a.day-b.day);
    const expectedDayCount=monthDays;
    if(!bestDayHeader||dayColumns.length<Math.min(28,expectedDayCount)){
      errors.push(sheetName+": could not identify the day-number header beside the stoppage table (found "+dayColumns.length+" of "+monthDays+" days).");
      continue;
    }
    const summaryLabel=/^(total\s+stoppage|running\s+hours|total\s+available|%\s*of\s*utilisation|dispatches|avg\s*packer)/i;
    const findLabelRow=(pattern)=>grid.find(row=>(row||[]).slice(0,Math.max(6,reasonCol+1)).some(v=>pattern.test(String(v??"").trim())));
    const stopTotalRow=findLabelRow(/^total\s+stoppage\s+hrs$/i);
    const runningRow=findLabelRow(/^running\s+hours$/i);
    const availableRow=findLabelRow(/^total\s+available\s+hrs$/i);
    const utilisationRow=findLabelRow(/^%\s*of\s*utilisation$/i);
    const dispatchRow=findLabelRow(/^dispatches(?:\s*\(mt\))?$/i);
    const avgRow=findLabelRow(/^avg\s*packer(?:\s*\(tph\))?$/i);
    const reasonRows=[];
    for(let r=headerIndex+1;r<grid.length;r++){
      if(r===bestDayHeader.rowIndex)continue;
      const row=grid[r]||[];
      const label=String(row[reasonCol]??"").trim();
      if(!label)continue;
      if(summaryLabel.test(label))break;
      if(/^(sl\s*no|s\.?\s*no|stoppage\s*reason)$/i.test(label))continue;
      const dayValues=dayColumns.map(({day,index})=>({day,hours:parseHistoricalHours(row[index])}));
      if(dayValues.some(x=>x.hours!==null&&x.hours>0))reasonRows.push({label,dayValues});
    }
    for(let day=1;day<=monthDays;day++){
      const business_date=[year,String(month).padStart(2,"0"),String(day).padStart(2,"0")].join("-");
      let reasonTotal=0;
      for(const rr of reasonRows){
        const cell=rr.dayValues.find(x=>x.day===day);
        if(cell&&cell.hours!==null&&cell.hours>0){
          reasonTotal+=cell.hours;
          reasons.push({business_date,asset_name:assetName,stoppage_reason:rr.label,stoppage_hours:Number(cell.hours.toFixed(6)),source_file:fileName,source_sheet:sheetName});
        }
      }
      // The reason matrix has two leading columns (Sl No. + Reason), so
      // its day 1 starts at the same index as the day-number header.
      // The summary rows have only one leading label column, so their day 1
      // starts one column earlier. The trailing monthly total is not a day.
      const getSummaryDay=(row)=>{const cell=dayColumns.find(x=>x.day===day);return row&&cell?row[cell.index-1]:null;};
      const total=parseHistoricalHours(getSummaryDay(stopTotalRow));
      if(total!==null||reasonTotal>0){
        summaries.push({business_date,asset_name:assetName,total_stoppage_hours:Number((total??reasonTotal).toFixed(6)),source_file:fileName,source_sheet:sheetName});
      }
    }
    sheetMonths.push({month,year,sheetName});
  }
  // A current-FY workbook may contain only completed months. In November 2026,
  // for example, April through October (7 sheets) is a valid historical upload.
  const now=new Date();
  const currentFyStart=now.getMonth()>=3?now.getFullYear():now.getFullYear()-1;
  const lastCompletedMonth=now.getMonth()>=3?now.getMonth():12;
  const isCurrentFy=sheetMonths.length>0&&sheetMonths.every(x=>x.year===currentFyStart||x.year===currentFyStart+1);
  const currentFyExpected=[];
  for(let m=4;m<=lastCompletedMonth;m++) currentFyExpected.push({month:m,year:currentFyStart});
  const currentFyPartial=isCurrentFy&&sheetMonths.length===currentFyExpected.length&&currentFyExpected.every(expected=>sheetMonths.some(x=>x.month===expected.month&&x.year===expected.year));
  if(workbook.SheetNames.length!==12&&!currentFyPartial){
    errors.push("Expected 12 monthly worksheets (April to March), or the completed April-to-"+monthNames[lastCompletedMonth-1]+" months for the current financial year; found "+workbook.SheetNames.length+".");
  }
  if(!currentFyPartial){
    const years=new Set(sheetMonths.map(x=>x.year));
    const monthSet=new Set(sheetMonths.map(x=>x.month));
    if(years.size!==2 || monthSet.size!==12 || ![4,5,6,7,8,9,10,11,12,1,2,3].every(m=>monthSet.has(m))) errors.push("Worksheets must cover each month from April through March exactly once.");
    const fyStart=sheetMonths.find(x=>x.month===4)?.year;
    if(!fyStart || !sheetMonths.some(x=>x.month===3&&x.year===fyStart+1)) errors.push("April and following March must belong to the same financial year.");
  }
  if(!summaries.length) errors.push("No daily summary values were found. Check the labels and day columns in the worksheets.");
  const seen=new Set();
  for(const row of summaries){if(seen.has(row.business_date))errors.push("Duplicate date found across worksheets: "+row.business_date);seen.add(row.business_date);}
  return {reasons,summaries,errors,sheetMonths};
}

function parseHistoricalQty(value) {
  if(value===null||value===undefined||String(value).trim()==="") return null;
  const n=Number(String(value).replace(/,/g,"").trim());
  return Number.isFinite(n)&&n>=0?n:null;
}

export default function PackingPlantReportsConnected({ supabase }) {
  const [reportKey, setReportKey] = useState("shift_production");
  const [fromDate, setFromDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toLocaleDateString("en-CA"));
  const [toDate, setToDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [historyFile, setHistoryFile] = useState(null);
  const [historyPreview, setHistoryPreview] = useState([]);
  const [historyMessage, setHistoryMessage] = useState("");
  const [historyBusy, setHistoryBusy] = useState(false);
  const [stoppageAsset, setStoppageAsset] = useState("Packer 1");
  const [stoppageFile, setStoppageFile] = useState(null);
  const [stoppagePreview, setStoppagePreview] = useState({reasons:[],summaries:[],errors:[],sheetMonths:[]});
  const [stoppageMessage, setStoppageMessage] = useState("");
  const [stoppageBusy, setStoppageBusy] = useState(false);

  const selected = REPORTS.find(r => r.key === reportKey) || REPORTS[0];
  const rows = Array.isArray(data?.rows) ? data.rows : Array.isArray(data) ? data : Array.isArray(data?.data?.rows) ? data.data.rows : [];
  const runningRows = Array.isArray(data?.running_rows) ? data.running_rows : [];
  const stoppageGroups = useMemo(() => {
    if (reportKey !== "daily_stoppage") return [];
    const map = new Map();
    for (const row of rows) {
      const date = row.business_date || row.date || row.report_date;
      const asset = row.asset_name || row.asset || row.packer_name || row.packer_code || "Unassigned";
      const key = [date, asset].join("|");
      if (!map.has(key)) map.set(key, { date, asset, rows: [] });
      map.get(key).rows.push(row);
    }
    const order = {"Packer 1":1,"Bulk Loading":2,"Packer 2":3,"Packer 3":4};
    return [...map.values()].sort((a,b) => String(a.date).localeCompare(String(b.date)) || (order[a.asset]||9)-(order[b.asset]||9));
  }, [reportKey, rows]);

  const performanceDays = useMemo(() => {
    if (reportKey !== "packing_plant_performance") return [];
    const grouped = new Map();
    for (const row of rows) {
      const date = row.business_date;
      if (!grouped.has(date)) grouped.set(date, {});
      grouped.get(date)[row.grade] = row;
    }
    return [...grouped.entries()].sort((a,b) => String(a[0]).localeCompare(String(b[0]))).map(([date, grades]) => ({ date, grades }));
  }, [reportKey, rows]);

  const performanceStopGroups = useMemo(() => {
    if (reportKey !== "packing_plant_performance") return [];
    const map = new Map();
    for (const row of (Array.isArray(data?.stoppage_rows) ? data.stoppage_rows : [])) {
      if (row.stop_number === null || row.stop_number === undefined) continue;
      const date = row.business_date;
      const asset = row.asset_name || "Unassigned";
      const key = date + "|" + asset;
      if (!map.has(key)) map.set(key, { date, asset, rows: [] });
      map.get(key).rows.push(row);
    }
    const order = { "Packer 1":1, "Packer 2":2, "Packer 3":3, "Bulk Loading":4 };
    return [...map.values()].sort((a,b) => String(a.date).localeCompare(String(b.date)) || (order[a.asset]||9)-(order[b.asset]||9));
  }, [reportKey, data]);

  const columns = useMemo(() => {
    const preferred = Object.keys(rows[0] || {});
    return preferred;
  }, [rows]);

  async function previewHistoricalFile(file) {
    setHistoryFile(file); setHistoryPreview([]); setHistoryMessage("");
    if (!file) return;
    try {
      const buffer=await file.arrayBuffer();
      const workbook=XLSX.read(buffer,{type:"array",cellDates:true});
      const sheet=workbook.Sheets[workbook.SheetNames[0]];
      const grid=XLSX.utils.sheet_to_json(sheet,{header:1,raw:true,defval:null});
      const assets=["Packer 1","Packer 2","Packer 3","Bulk Loading"];
      const parsed=[];
      for(let r=2;r<grid.length;r++){
        const line=grid[r]||[];
        const business_date=parseHistoricalDate(line[0]);
        if(!business_date) continue;
        for(let a=0;a<4;a++) for(let g=0;g<2;g++){
          const offset=1+(a*4)+(g*2);
          const qty=parseHistoricalQty(line[offset]);
          const hours=parseHistoricalHours(line[offset+1]);
          if(qty===null && hours===null) continue;
          parsed.push({business_date,asset_name:assets[a],grade:g===0?"OPC53":"PPC",production_mt:qty??0,running_hours:hours??0});
        }
      }
      if(!parsed.length) throw new Error("No dated production rows found. Check that the first column contains dates and the data starts below the three header rows.");
      const seen=new Set();
      for(const row of parsed){const k=[row.business_date,row.asset_name,row.grade].join("|");if(seen.has(k))throw new Error("Duplicate date / section / grade entry: "+k);seen.add(k);}
      setHistoryPreview(parsed);
      setHistoryMessage("Preview ready: "+parsed.length.toLocaleString("en-IN")+" date/section/grade records across "+new Set(parsed.map(x=>x.business_date)).size+" dates.");
    } catch(e){setHistoryPreview([]);setHistoryMessage(e.message||"Unable to read this file.");}
  }
  async function uploadHistoricalFile() {
    if(!historyPreview.length||!supabase)return;
    setHistoryBusy(true);setHistoryMessage("");
    try{
      const payload=historyPreview.map(x=>({...x,source_file:historyFile?.name||null}));
      const {error:upsertError}=await supabase.from("packing_plant_grade_performance_daily").upsert(payload,{onConflict:"business_date,asset_name,grade"});
      if(upsertError) throw upsertError;
      setHistoryMessage("Successfully saved "+payload.length.toLocaleString("en-IN")+" records. Existing entries for the same date, section and grade were updated; other dates and sections were retained.");
      setHistoryPreview([]);
      setHistoryFile(null);
      await loadReport("packing_plant_performance");
    }catch(e){setHistoryMessage(e.message||"Upload failed. Confirm that you have administrator access.");}
    finally{setHistoryBusy(false);}
  }


  async function previewHistoricalStoppageFile(file) {
    setStoppageFile(file); setStoppagePreview({reasons:[],summaries:[],errors:[],sheetMonths:[]}); setStoppageMessage("");
    if(!file) return;
    try{
      const workbook=XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:true});
      const parsed=parseHistoricalStoppageWorkbook(workbook,stoppageAsset,file.name);
      setStoppagePreview(parsed);
      setStoppageMessage(parsed.errors.length ? "Preview has validation issues. Correct the workbook before upload." : "Preview ready: "+parsed.summaries.length.toLocaleString("en-IN")+" daily summaries and "+parsed.reasons.length.toLocaleString("en-IN")+" reason entries across "+parsed.sheetMonths.length+" monthly sheets.");
    }catch(e){setStoppageMessage(e.message||"Unable to read this workbook.");}
  }
  async function uploadHistoricalStoppageFile(){
    const {reasons,summaries,errors}=stoppagePreview;
    if(errors.length||!summaries.length||!supabase)return;
    setStoppageBusy(true);setStoppageMessage("");
    try{
      const {data:userData,error:userError}=await supabase.auth.getUser();
      if(userError)throw userError;
      const userId=userData?.user?.id;
      if(!userId)throw new Error("Please sign in again before uploading.");
      const now=new Date().toISOString();
      const summaryPayload=summaries.map(x=>({...x,uploaded_by:userId,updated_at:now}));
      const reasonPayload=reasons.map(x=>({...x,uploaded_by:userId,updated_at:now}));
      const firstDate=summaries.reduce((v,x)=>x.business_date<v?x.business_date:v,summaries[0].business_date);
      const lastDate=summaries.reduce((v,x)=>x.business_date>v?x.business_date:v,summaries[0].business_date);
      // Update only stoppage-related fields. Running hours, available hours,
      // utilisation, production and TPH are maintained by separate uploads/rules.
      for(let i=0;i<summaryPayload.length;i+=10){
        const batch=summaryPayload.slice(i,i+10);
        await Promise.all(batch.map(async x=>{
          const payload={total_stoppage_hours:x.total_stoppage_hours,source_file:x.source_file,source_sheet:x.source_sheet,uploaded_by:x.uploaded_by,updated_at:x.updated_at};
          const {data:updated,error:updateError}=await supabase.from("packing_plant_historical_stoppage_summary_daily").update(payload).eq("business_date",x.business_date).eq("asset_name",x.asset_name).select("business_date");
          if(updateError)throw updateError;
          if(!updated?.length){
            const {error:insertError}=await supabase.from("packing_plant_historical_stoppage_summary_daily").insert({...x});
            if(insertError)throw insertError;
          }
        }));
      }
      // Replace the historical reason rows for this packer/date range so a
      // corrected workbook cannot leave stale entries from an earlier parse.
      const {error:clearReasonError}=await supabase.from("packing_plant_historical_stoppage_reason_daily").delete().eq("asset_name",stoppageAsset).gte("business_date",firstDate).lte("business_date",lastDate);
      if(clearReasonError)throw clearReasonError;
      if(reasonPayload.length){
        const {error:reasonError}=await supabase.from("packing_plant_historical_stoppage_reason_daily").upsert(reasonPayload,{onConflict:"business_date,asset_name,stoppage_reason"});
        if(reasonError)throw reasonError;
      }
      setStoppageMessage("Successfully saved "+summaryPayload.length.toLocaleString("en-IN")+" daily summaries and "+reasonPayload.length.toLocaleString("en-IN")+" reason entries. Existing dates for this packer were updated; other packers and dates were retained.");
      setStoppagePreview({reasons:[],summaries:[],errors:[],sheetMonths:[]});setStoppageFile(null);
      await loadReport("daily_stoppage");
    }catch(e){setStoppageMessage(e.message||"Historical stoppage upload failed. Confirm administrator access.");}
    finally{setStoppageBusy(false);}
  }

  async function loadReport(requestedReportKey = reportKey) {
    if (!supabase) return;
    if (!fromDate || !toDate) { setError("Please select both From Date and To Date."); return; }
    if (fromDate > toDate) { setError("From Date must not be after To Date."); return; }
    setBusy(true); setError("");
    try {
      if (requestedReportKey === "packing_plant_performance") {
        const [performance, stoppage] = await Promise.all([
          supabase.rpc("get_packing_plant_performance_report", { p_date_from: fromDate, p_date_to: toDate }),
          supabase.rpc("get_packing_plant_stoppage_report", { p_date_from: fromDate, p_date_to: toDate })
        ]);
        if (performance.error) throw performance.error;
        if (stoppage.error) throw stoppage.error;
        setData({ ...(performance.data || { rows: [] }), stoppage_rows: stoppage.data?.rows || [] });
      } else {
        const rpcName = requestedReportKey === "daily_stoppage" ? "get_packing_plant_stoppage_report" : "get_packing_plant_integrated_report";
        const rpcArgs = requestedReportKey === "daily_stoppage" ? { p_date_from: fromDate, p_date_to: toDate } : { p_report_key: requestedReportKey, p_date_from: fromDate, p_date_to: toDate };
        const { data: result, error: rpcError } = await supabase.rpc(rpcName, rpcArgs);
        if (rpcError) throw rpcError;
        setData(result || { rows: [] });
      }
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
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD2DCEB" } };
        c.alignment = { horizontal: r===5 ? "right" : "center", vertical: "middle" };
        c.border = { top:{style:"thin"},bottom:{style:r===5?"medium":"thin"},left:{style:"thin"},right:{style:"thin"} };
      });
      const imageId = workbook.addImage({ base64: "data:image/png;base64," + logoBase64.trim(), extension: "png" });
      ws.addImage(imageId, { tl: { col: 1, row: 1 }, ext: { width: 82, height: 56 } });

      const headers = ["Stops Counter","Date","STOPs in a Day","Stop","Start","Duration","Reason for Stoppage","Stoppage Category","Day Stoppage Hrs","Day Run.Hrs","Day Prod.(MT)"];
      const merges = ["B","C","D","E","F","G","H","I","J","K","L"];
      merges.forEach(col => ws.mergeCells(col+"6:"+col+"8"));
      headers.forEach((label,i) => {
        const cell = ws.getCell(6,i+2);
        cell.value = label;
        cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FF000000" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE6F2" } };
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
        const m=String(value).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
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
        section.getCell(2).fill = { type:"pattern",pattern:"solid",fgColor:{argb:"FFD2DCEB"} };
        section.getCell(2).alignment = { horizontal:"center",vertical:"middle" };
        section.getCell(2).border = { top:{style:"medium"},bottom:{style:"thin"},left:{style:"medium"},right:{style:"medium"} };
        section.height = 20;
        rowNo++;
        const items = details.length ? details : [null];
        const first = rowNo;
        items.forEach((item,index) => {
          const row = ws.getRow(rowNo);
          row.getCell(2).value = item ? (item.stop_number??index+1) : "";
          row.getCell(3).value = group.date ? new Date(group.date+"T00:00:00Z") : "";
          row.getCell(4).value = details[0]?.category==="Historical Aggregate" ? "Historical" : details.length;
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
      totalLabel.fill = { type:"pattern",pattern:"solid",fgColor:{argb:"FFFFFFFF"} };
      totalLabel.border = { top:{style:"medium"},bottom:{style:"medium"},left:{style:"thin"},right:{style:"thin"} };
      const totalValue = ws.getCell(totalRow,12);
      totalValue.value = productionCells.length ? { formula:"SUM("+productionCells.join(",")+")" } : 0;
      totalValue.font = { name:"Calibri",size:12,bold:true,color:{argb:"FF000000"} };
      totalValue.numFmt="0.00";
      totalValue.alignment={horizontal:"center",vertical:"middle"};
      totalValue.fill = { type:"pattern",pattern:"solid",fgColor:{argb:"FFFFFFFF"} };
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
    if (reportKey === "packing_plant_performance") {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Andhra Cements Limited";
      workbook.subject = "Packing Plant Performance Report";
      workbook.title = "Andhra Cements Limited - Packing Plant Performance Report";
      const ws = workbook.addWorksheet("Performance", { pageSetup:{paperSize:9,orientation:"landscape",fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:0.2,right:0.2,top:0.25,bottom:0.25,header:0.1,footer:0.1}} });
      ws.views=[{showGridLines:false}];
      ws.columns=[{width:7},{width:12},{width:13},{width:13},{width:13},{width:13},{width:13},{width:13},{width:13},{width:13},{width:13},{width:13},{width:13},{width:13},{width:14},{width:14},{width:14}];
      ws.mergeCells("A2:A5"); ws.mergeCells("B2:Q2"); ws.mergeCells("B3:Q3"); ws.mergeCells("B4:Q4"); ws.mergeCells("B5:Q5");
      ws.getCell("B2").value="ANDHRA CEMENTS LIMITED";
      ws.getCell("B3").value="DACHEPALLI";
      ws.getCell("B4").value="PACKING PLANT PERFORMANCE REPORT";
      ws.getCell("B5").value=fromDate===toDate?"Date : "+reportDate(fromDate):"Period : "+reportDate(fromDate)+" to "+reportDate(toDate);
      [2,3,4,5].forEach(r=>{ws.getRow(r).height=17;const cell=ws.getCell("B"+r);cell.font={name:"Calibri",size:r===5?9:12,bold:true,color:{argb:r===4?"FFC00000":"FF000000"}};cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFD2DCEB"}};cell.alignment={horizontal:r===5?"right":"center",vertical:"middle"};cell.border={top:{style:"thin"},bottom:{style:r===5?"medium":"thin"},left:{style:"thin"},right:{style:"thin"}};});
      const logoId=workbook.addImage({base64:"data:image/png;base64,"+logoBase64.trim(),extension:"png"});
      ws.addImage(logoId,{tl:{col:0,row:1},ext:{width:82,height:56}});
      ws.mergeCells("A7:A8"); ws.mergeCells("B7:B8");
      [["C","E","PACKER-1"],["F","H","PACKER-2"],["I","K","PACKER-3"],["L","N","BULK"],["O","Q","TOTAL DISPATCH"]].forEach(([a,b,label])=>{ws.mergeCells(a+"7:"+b+"7");ws.getCell(a+"7").value=label;});
      ws.getCell("A7").value="S.No."; ws.getCell("B7").value="Grade";
      const subheads=["Qty","Running Hours","Stoppage Hours","Qty","Running Hours","Stoppage Hours","Qty","Running Hours","Stoppage Hours","Qty","Running Hours","Stoppage Hours","On Date","MTD","YTD"];
      subheads.forEach((v,i)=>ws.getCell(8,i+3).value=v);
      for(let r=7;r<=8;r++) for(let col=1;col<=17;col++){const x=ws.getCell(r,col);x.font={name:"Calibri",size:9,bold:true};x.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFDCE6F2"}};x.alignment={horizontal:"center",vertical:"middle",wrapText:true};x.border={top:{style:"thin"},bottom:{style:"thin"},left:{style:"thin"},right:{style:"thin"}};}
      ws.getRow(7).height=20; ws.getRow(8).height=30;
      let rr=9;
      const numericFields=["p1_qty","p1_running_hours","p1_stoppage_hours","p2_qty","p2_running_hours","p2_stoppage_hours","p3_qty","p3_running_hours","p3_stoppage_hours","bulk_qty","bulk_running_hours","bulk_stoppage_hours","on_date","mtd","ytd"];
      for(const day of performanceDays){
        ws.mergeCells(rr,1,rr,17); ws.getCell(rr,1).value="Date : "+reportDate(day.date); ws.getCell(rr,1).font={name:"Calibri",size:10,bold:true};ws.getCell(rr,1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFD2DCEB"}};ws.getCell(rr,1).alignment={horizontal:"left"};rr++;
        ["OPC53","PPC","Total"].forEach((grade,index)=>{
          const item=day.grades[grade]||{};
          ws.getCell(rr,1).value=index+1; ws.getCell(rr,2).value=grade;
          numericFields.forEach((field,i)=>{const cell=ws.getCell(rr,i+3);cell.value=Number(item[field]||0);cell.numFmt=i%3===1||i%3===2&&i<12?"[h]:mm":"#,##0.00";});
          for(let col=1;col<=17;col++){const cell=ws.getCell(rr,col);cell.font={name:"Calibri",size:9,bold:grade==="Total"};cell.alignment={horizontal:col<=2?"left":"right",vertical:"middle"};cell.border={top:{style:"thin"},bottom:{style:"thin"},left:{style:"thin"},right:{style:"thin"}};if(grade==="Total")cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFFFF2CC"}};}
          rr++;
        });
        const total=day.grades.Total||{};
        ws.getCell(rr,2).value="TPH";
        [total.p1_tph,total.p2_tph,total.p3_tph,total.bulk_tph].forEach((v,i)=>ws.getCell(rr,3+i*3).value=Number(v||0));
        const totalTph=Number(total.total_dispatch_qty||0)/(Number(total.p1_running_hours||0)+Number(total.p2_running_hours||0)+Number(total.p3_running_hours||0)+Number(total.bulk_running_hours||0)||1);
        ws.getCell(rr,15).value=totalTph;
        for(let col=1;col<=17;col++){const cell=ws.getCell(rr,col);cell.font={name:"Calibri",size:9,bold:true,color:{argb:"FFC00000"}};cell.border={top:{style:"thin"},bottom:{style:"thin"},left:{style:"thin"},right:{style:"thin"}};}
        rr++;
      }
      ws.pageSetup.printArea="A2:Q"+(rr-1); ws.pageSetup.horizontalCentered=true;
      const stopWs=workbook.addWorksheet("Stoppage Reasons",{pageSetup:{paperSize:9,orientation:"landscape",fitToPage:true,fitToWidth:1,fitToHeight:0}});
      stopWs.views=[{showGridLines:false}]; stopWs.columns=[{width:16},{width:17},{width:12},{width:12},{width:12},{width:42}];
      stopWs.mergeCells("A1:F1");stopWs.getCell("A1").value="PACKING PLANT PERFORMANCE REPORT - STOPPAGE REASONS";stopWs.getCell("A1").font={bold:true,size:13,color:{argb:"FFC00000"}};stopWs.getCell("A1").alignment={horizontal:"center"};
      ["Asset","Category","From","To","Total","Reason"].forEach((v,i)=>{const cell=stopWs.getCell(3,i+1);cell.value=v;cell.font={bold:true};cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFDCE6F2"}};cell.border={top:{style:"thin"},bottom:{style:"thin"},left:{style:"thin"},right:{style:"thin"}};});
      let sr=4;
      for(const group of performanceStopGroups){
        stopWs.mergeCells(sr,1,sr,6);stopWs.getCell(sr,1).value=reportDate(group.date)+" · "+group.asset;stopWs.getCell(sr,1).font={bold:true};sr++;
        for(const item of group.rows){[group.asset,item.category||item.stoppage_classification||"",item.stop_time||"",item.start_time||"",Number(item.duration_hours||0)/24,item.reason||""].forEach((v,i)=>stopWs.getCell(sr,i+1).value=v);stopWs.getCell(sr,5).numFmt="[h]:mm";for(let col=1;col<=6;col++)stopWs.getCell(sr,col).border={top:{style:"thin"},bottom:{style:"thin"},left:{style:"thin"},right:{style:"thin"}};sr++;}
      }
      const buffer=await workbook.xlsx.writeBuffer();const blob=new Blob([buffer],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download="Packing_Plant_Performance_Report_"+fromDate+"_to_"+toDate+".xlsx";document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);return;
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
        <button className="secondary" onClick={() => loadReport()} disabled={busy}><RefreshCw size={16}/>Refresh</button>{!busy && rows.length > 0 && <button className="secondary" onClick={downloadExcel}>Download Excel</button>}
      </div>
    </div>
    <div className="panel">
      <div className="panel-title"><h3>Select report</h3><span className="pill">{fromDate} to {toDate}</span></div>
      <div className="mapping-grid"><label>Report<select value={reportKey} onChange={e => { const nextKey = e.target.value; setReportKey(nextKey); setData(null); setError(""); void loadReport(nextKey); }}>{REPORTS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}</select></label></div>
      <p className="footnote">{selected.note}</p>
    </div>
    {error && <div className="alert error">{error}</div>}
    {reportKey === "packing_plant_performance" && <div className="panel history-upload-panel">
      <div className="panel-title"><h3>Historical Grade-wise Production & Running Hours Upload</h3><span className="pill">Administrator upload</span></div>
      <p className="footnote">Upload the three-year Excel/CSV sheet using the supplied layout: Date, then Packer 1, Packer 2, Packer 3 and Bulk Loading, each with OPC Qty, R/H, PPC Qty and R/H. Time values such as 07:30 are converted to hours.</p>
      <div className="mapping-grid"><label>Select historical file<input type="file" accept=".xlsx,.xls,.csv" onChange={e=>void previewHistoricalFile(e.target.files?.[0]||null)}/></label></div>
      {historyMessage && <p className={historyPreview.length?"validation-ok":"footnote"}>{historyMessage}</p>}
      {historyPreview.length>0 && <><div className="cr-scroll"><table className="cr-table cr-small"><thead><tr>{["Date","Section","Grade","Production (MT)","Running Hours"].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{historyPreview.slice(0,12).map((x,i)=><tr key={i}><td>{reportDate(x.business_date)}</td><td>{x.asset_name}</td><td>{x.grade}</td><td>{reportNumber(x.production_mt)}</td><td>{hourClock(x.running_hours)}</td></tr>)}</tbody></table></div><p className="footnote">Showing first 12 records of {historyPreview.length.toLocaleString("en-IN")}.</p><button className="primary" onClick={uploadHistoricalFile} disabled={historyBusy}>{historyBusy?"Uploading…":"Confirm & Upload Historical Data"}</button></>}
    </div>}


    {reportKey === "daily_stoppage" && <div className="panel history-upload-panel">
      <div className="panel-title"><h3>Historical Monthly Stoppage Data Upload</h3><span className="pill">Administrator upload</span></div>
      <p className="footnote">Select the packer and upload its financial-year workbook. Only daily stoppage hours and reason-wise stoppage durations are imported. Existing running hours are preserved; production allocation and TPH continue to follow the agreed calculation rules. Stop and restart times are not created.</p>
      <div className="mapping-grid">
        <label>Packer<select value={stoppageAsset} onChange={e=>{setStoppageAsset(e.target.value);setStoppageFile(null);setStoppagePreview({reasons:[],summaries:[],errors:[],sheetMonths:[]});setStoppageMessage("");}}><option>Packer 1</option><option>Packer 2</option><option>Packer 3</option></select></label>
        <label>Select financial-year workbook<input type="file" accept=".xlsx,.xls" onChange={e=>void previewHistoricalStoppageFile(e.target.files?.[0]||null)}/></label>
      </div>
      {stoppageMessage&&<p className={stoppagePreview.errors.length?"footnote":"validation-ok"}>{stoppageMessage}</p>}
      {stoppagePreview.errors.length>0&&<ul className="footnote">{stoppagePreview.errors.map((x,i)=><li key={i}>{x}</li>)}</ul>}
      {stoppagePreview.summaries.length>0&&stoppagePreview.errors.length===0&&<>
        <p className="footnote">Worksheets: {stoppagePreview.sheetMonths.map(x=>x.sheetName).join(", ")}</p>
        <div className="cr-scroll"><table className="cr-table cr-small"><thead><tr>{["Date","Packer","Stoppage Hrs","Reason Entries"].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{stoppagePreview.summaries.slice(0,12).map((x,i)=><tr key={i}><td>{reportDate(x.business_date)}</td><td>{x.asset_name}</td><td>{hourClock(x.total_stoppage_hours)}</td><td>{stoppagePreview.reasons.filter(r=>r.business_date===x.business_date).length}</td></tr>)}</tbody></table></div>
        <p className="footnote">Showing first 12 of {stoppagePreview.summaries.length.toLocaleString("en-IN")} dates with stoppage data; {stoppagePreview.reasons.length.toLocaleString("en-IN")} reason entries detected. Running hours, production and TPH are not changed by this upload.</p>
        <button className="primary" onClick={uploadHistoricalStoppageFile} disabled={stoppageBusy}>{stoppageBusy?"Uploading…":"Confirm & Upload Historical Stoppage Data"}</button>
      </>}
    </div>}

    {busy && <div className="panel"><p>Loading report from Supabase…</p></div>}
    {!busy && data && <div className="panel">
      <div className="panel-title"><h3>{selected.label}</h3><span className="pill">{rows.length.toLocaleString("en-IN")} rows · MT where applicable</span></div>
      {rows.length ? reportKey === "daily_stoppage" ? <div className="stoppage-report">
        <div className="stoppage-report-heading">
          <img alt="Andhra Cements" src={"data:image/png;base64," + logoBase64.trim()} />
          <div><strong>ANDHRA CEMENTS LIMITED</strong><span>DACHEPALLI</span><b>STOPPAGE ANALYSIS REPORT</b><small>{fromDate === toDate ? "Date: " + new Date(fromDate+"T00:00:00").toLocaleDateString("en-GB") : "Period: " + new Date(fromDate+"T00:00:00").toLocaleDateString("en-GB") + " to " + new Date(toDate+"T00:00:00").toLocaleDateString("en-GB")}</small></div>
        </div>
        <div className="table-scroll">
          <table className="stoppage-master-table">
            <thead><tr>{["Stops Counter","Date","STOPs in a Day","Stop","Start","Duration","Reason for Stoppage","Stoppage Category","Day Stoppage Hrs","Day Run.Hrs","Day Prod.(MT)"].map(h=><th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {stoppageGroups.map((group,gi)=>{
                const details=group.rows.filter(x=>x.stop_number!==null&&x.stop_number!==undefined).sort((a,b)=>Number(a.stop_number)-Number(b.stop_number));
                const summary=group.rows.find(x=>Number(x.day_stoppage_hours)||Number(x.day_running_hours)||Number(x.day_production_mt))||group.rows[0]||{};
                const items=details.length?details:[null];
                const assetName=String(group.asset || "Unassigned");
                const assetLabel=assetName==="Bulk Loading"?"Bulk":assetName==="Packer 3"?"PACKER -3":assetName.toUpperCase().replace("PACKER ","PACKER-");
                return <React.Fragment key={gi}>
                  <tr className="stoppage-asset-title"><td colSpan={11}>{assetLabel}</td></tr>
                  {items.map((item,i)=><tr key={i}>
                    <td>{item?.stop_number??""}</td>
                    <td>{new Date(group.date+"T00:00:00").toLocaleDateString("en-GB")}</td>
                    <td>{details[0]?.category==="Historical Aggregate"?"Historical":details.length}</td>
                    <td>{item?.stop_time??""}</td>
                    <td>{item?.start_time??""}</td>
                    <td>{item?.duration_hours==null?"":Number(item.duration_hours).toFixed(2)}</td>
                    <td>{item?.reason??(details.length?"":"No stoppage recorded")}</td>
                    <td>{item?.category??item?.stoppage_classification??""}</td>
                    {i===0&&<><td rowSpan={items.length}>{Number(summary.day_stoppage_hours||0).toFixed(2)}</td><td rowSpan={items.length}>{Number(summary.day_running_hours||0).toFixed(2)}</td><td rowSpan={items.length}>{Number(summary.day_production_mt||0).toFixed(2)}</td></>}
                  </tr>)}
                </React.Fragment>;
              })}
              <tr className="stoppage-grand-total"><td colSpan={8}></td><td colSpan={2}>TOTAL PRODUCTION (MT)</td><td>{stoppageGroups.reduce((n,g)=>n+Number((g.rows.find(x=>Number(x.day_production_mt))||g.rows[0]||{}).day_production_mt||0),0).toFixed(2)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>: reportKey === "packing_plant_performance" ? <div className="performance-report cr-panel">
        <div className="cr-report-title"><strong>ANDHRA CEMENTS LIMITED</strong><b>PACKING PLANT PERFORMANCE REPORT</b><small>{fromDate===toDate?"Date : "+reportDate(fromDate):"Period : "+reportDate(fromDate)+" to "+reportDate(toDate)}</small></div>
        <div className="cr-scroll"><table className="cr-table performance-table">
          <thead><tr><th rowSpan={2}>S.No.</th><th rowSpan={2}>Grade</th><th colSpan={3}>Packer-1</th><th colSpan={3}>Packer-2</th><th colSpan={3}>Packer-3</th><th colSpan={3}>Bulk</th><th colSpan={3}>Total Dispatch</th></tr>
          <tr>{["Qty","Running Hours","Stoppage Hours","Qty","Running Hours","Stoppage Hours","Qty","Running Hours","Stoppage Hours","Qty","Running Hours","Stoppage Hours","On Date","MTD","YTD"].map((x,i)=><th key={i}>{x}</th>)}</tr></thead>
          <tbody>{performanceDays.map(day=>{const total=day.grades.Total||{};const grades=["OPC53","PPC","Total"];return <React.Fragment key={day.date}>
            <tr className="performance-date"><td colSpan={17}>Date : {reportDate(day.date)}</td></tr>
            {grades.map((grade,index)=>{const item=day.grades[grade]||{};const vals=[item.p1_qty,item.p1_running_hours,item.p1_stoppage_hours,item.p2_qty,item.p2_running_hours,item.p2_stoppage_hours,item.p3_qty,item.p3_running_hours,item.p3_stoppage_hours,item.bulk_qty,item.bulk_running_hours,item.bulk_stoppage_hours,item.on_date,item.mtd,item.ytd];return <tr key={grade} className={grade==="Total"?"performance-total":""}><td>{index+1}</td><td>{grade}</td>{vals.map((v,i)=><td key={i} className="num">{i%3===1||i%3===2&&i<12?hourClock(v):reportNumber(v)}</td>)}</tr>;})}
            <tr className="performance-tph"><td></td><td>TPH</td><td className="num">{reportNumber(total.p1_tph)}</td><td></td><td></td><td className="num">{reportNumber(total.p2_tph)}</td><td></td><td></td><td className="num">{reportNumber(total.p3_tph)}</td><td></td><td></td><td className="num">{reportNumber(total.bulk_tph)}</td><td className="num">{reportNumber(Number(total.total_dispatch_qty||0)/(Number(total.p1_running_hours||0)+Number(total.p2_running_hours||0)+Number(total.p3_running_hours||0)+Number(total.bulk_running_hours||0)||1))}</td><td></td><td></td><td></td><td></td></tr>
          </React.Fragment>;})}</tbody>
        </table></div>
        <div className="cr-section"><h4>STOPPAGE REASONS</h4>
          {performanceStopGroups.length?performanceStopGroups.map((group,i)=><div key={i}><h5>{reportDate(group.date)} · {group.asset}</h5><div className="cr-scroll"><table className="cr-table cr-small"><thead><tr>{["Category","From","To","Total","Reason"].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{group.rows.map((item,j)=><tr key={j}><td>{item.category||item.stoppage_classification||"—"}</td><td>{item.stop_time||"—"}</td><td>{item.start_time||"—"}</td><td>{hourClock(item.duration_hours)}</td><td>{item.reason||"—"}</td></tr>)}</tbody></table></div></div>):<p className="muted">No recorded stoppage reasons for the selected dates.</p>}
        </div>
      </div>: <div className="table-scroll"><table><thead><tr>{columns.map(k => <th key={k}>{LABELS[k] || k.replace(/_/g, " ")}</th>)}</tr></thead><tbody>
        {rows.map((row, i) => <tr key={i}>{columns.map(k => <td key={k} className={NUMERIC.has(k) ? "num" : ""}>{display(row[k], k)}</td>)}</tr>)}
        {Object.keys(totals).length > 0 && <tr className="total">{columns.map((k,i) => <td key={k} className={NUMERIC.has(k) ? "num" : ""}>{i===0 ? "Grand Total" : Object.prototype.hasOwnProperty.call(totals,k) ? display(totals[k],k) : ""}</td>)}</tr>}
      </tbody></table></div> : <p className="muted">No records found for the selected dates. Enter running intervals and classify stoppage periods for the full business date, then save daily records. Production is sourced from dispatch records and intervals are adjusted to the agreed TPH targets.</p>}
    </div>}
    {reportKey === "raw_material_receipts" && <div className="alert warning">Raw Material Receipts includes only External-type inward movements; Cement/CLN weighments and outgoing scrap are excluded.</div>}
  </section>;
}
