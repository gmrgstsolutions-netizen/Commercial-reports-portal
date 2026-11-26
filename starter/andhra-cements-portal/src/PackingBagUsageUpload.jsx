import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { FileSpreadsheet, UploadCloud, RefreshCw } from "lucide-react";

function isoDate(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return [v.getFullYear(),String(v.getMonth()+1).padStart(2,"0"),String(v.getDate()).padStart(2,"0")].join("-");
  if (typeof v === "number" && v > 0) { const d=XLSX.SSF.parse_date_code(v); if(d) return [d.y,String(d.m).padStart(2,"0"),String(d.d).padStart(2,"0")].join("-"); }
  const s=String(v??"").trim(); let m=s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if(m) return m[3]+"-"+m[2].padStart(2,"0")+"-"+m[1].padStart(2,"0");
  m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  return m?m[1]+"-"+m[2].padStart(2,"0")+"-"+m[3].padStart(2,"0"):"";
}
const norm=s=>String(s??"").toLowerCase().replace(/[^a-z0-9]/g,"");
const bagNorm=s=>norm(s).replace(/bags?$/,"").replace(/packingmaterial$/,"");
const localIsoToday=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-")};
const bagAliases={
  OPC_YELLOW:["opcyellow","opcyellowbag","opcyellowbags"],
  OPC_WHITE:["opcwhite","opcwhitebag","opcwhitebags"],
  PPC_YELLOW:["ppcyellow","ppcyellowbag","ppcyellowbags"],
  PPC_WHITE:["ppcwhite","ppcwhitebag","ppcwhitebags"],
  PPC_LAMINATED_YELLOW:["ppclaminatedyellow","ppclaminatedyellowbag","ppclaminatedyellowbags","ppclmnyellow","ppclmn"],
  OPC_GREY:["opcgrey","opcgray","opcgreybags","opcgraybags"],
  PPC_GREY:["ppcgrey","ppcgray","ppcgreybags","ppcgraybags"]
};
export default function PackingBagUsageUpload({supabase,bagTypes,isAdmin,onUploaded}) {
  const [file,setFile]=useState(null),[workbook,setWorkbook]=useState(null),[sheet,setSheet]=useState("");
  const [rows,setRows]=useState([]),[headers,setHeaders]=useState([]);
  const [map,setMap]=useState({date:"",bag:"",consumption:"",damages:"",remarks:""});
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
  function parseSheet(wb,name) {
    const raw=XLSX.utils.sheet_to_json(wb.Sheets[name],{defval:"",raw:true});
    const source=raw.filter(r=>Object.values(r).some(v=>String(v??"").trim()!==""));
    const sourceCols=source.length?Object.keys(source[0]):[];
    const find=terms=>sourceCols.find(c=>terms.some(t=>norm(c).includes(t)))||"";
    const dateCol=find(["usagedate","consumptiondate","date","postingdate"]);
    const bagCols=sourceCols.filter(c=>/^bagtype\d*$/.test(norm(c)));
    let data=source, cols=sourceCols, wide=false;
    if(dateCol && bagCols.length>1) {
      wide=true;
      const dateIndex=sourceCols.indexOf(dateCol);
      const groups=bagCols.map(bagCol=>{
        const i=sourceCols.indexOf(bagCol);
        return {bagCol,consumptionCol:sourceCols[i+1],damagesCol:sourceCols[i+2]};
      });
      data=[];
      for(const r of source) {
        const dateValue=r[dateCol];
        if(!isoDate(dateValue)) continue;
        for(const g of groups) {
          const bag=String(r[g.bagCol]??"").trim();
          if(!bag) continue;
          data.push({Date:dateValue,"Bag Type":bag,Consumption:r[g.consumptionCol],Damages:r[g.damagesCol]});
        }
      }
      cols=["Date","Bag Type","Consumption","Damages"];
    }
    setRows(data);setHeaders(cols);
    const findMapped=terms=>cols.find(c=>terms.some(t=>norm(c).includes(t)))||"";
    setMap({
      date:wide?"Date":findMapped(["usagedate","consumptiondate","date","postingdate"]),
      bag:wide?"Bag Type":findMapped(["bagtype","bagname","packingmaterial","material"]),
      consumption:wide?"Consumption":findMapped(["consumptionqty","consumption","consumedqty","consumed","qtyconsumed"]),
      damages:wide?"Damages":findMapped(["damagesqty","damageqty","damages","damage"]),
      remarks:findMapped(["remarks","narration","description"])
    });
    setMessage(data.length?data.length.toLocaleString("en-IN")+" date-wise bag records loaded"+(wide?" from "+groups.length+" side-by-side bag-type columns.":" . Check the column mapping and preview before submitting."):"No data rows found in this worksheet.");
  }
  async function chooseFile(f) {
    setFile(f);setWorkbook(null);setRows([]);setHeaders([]);setMessage("");setError("");
    try { const wb=XLSX.read(await f.arrayBuffer(),{type:"array",cellDates:true}); if(!wb.SheetNames.length) throw new Error("No worksheet found.");setWorkbook(wb);setSheet(wb.SheetNames[0]);parseSheet(wb,wb.SheetNames[0]); }
    catch(e){setError("Unable to read file: "+e.message);}
  }
  const mapped=useMemo(()=>rows.map((r,i)=>{
    const date=isoDate(map.date?r[map.date]:"");
    const bagText=String(map.bag?r[map.bag]??"":"").trim();
    const key=bagNorm(bagText);
    const bag=bagTypes.find(b=>[b.name,b.code,...(bagAliases[b.code]||[])].some(x=>bagNorm(x)===key));
    const number=k=>{const raw=String(map[k]?r[map[k]]??"":"").replace(/,/g,"").trim();return raw===""?0:Number(raw);};
    const consumption=number("consumption"),damages=number("damages");
    const errors=[];
    if(!date||date<"2026-04-01"||date>localIsoToday()) errors.push("Date must be between 01-Apr-2026 and today");
    if(!bag) errors.push("Bag type not matched");
    if(!Number.isFinite(consumption)||consumption<0) errors.push("Invalid consumption");
    if(!Number.isFinite(damages)||damages<0) errors.push("Invalid damages");
    return {row:i+2,date,bagText,bag,consumption,damages,remarks:map.remarks?String(r[map.remarks]??"").trim():"",errors};
  }),[rows,map,bagTypes]);
  const duplicateCount=useMemo(()=>{const seen=new Set();let n=0;for(const r of mapped){if(!r.bag||!r.date)continue;const k=r.bag.id+"|"+r.date;if(seen.has(k))n++;seen.add(k);}return n;},[mapped]);
  const invalid=mapped.filter(r=>r.errors.length).length+duplicateCount;
  const errorSummary=useMemo(()=>{const counts={};for(const r of mapped)for(const e of r.errors)counts[e]=(counts[e]||0)+1;return counts;},[mapped]);
  async function submit() {
    if(!isAdmin){setError("Only an administrator can upload consumption and damages.");return;}
    if(!mapped.length||invalid){setError("Correct all validation errors and duplicate bag-type/date rows before upload.");return;}
    setBusy(true);setError("");setMessage("");
    try {
      const entries=mapped.map(r=>({bag_type_id:r.bag.id,usage_date:r.date,consumption_qty:r.consumption,damages_qty:r.damages,remarks:r.remarks||null}));
      const {data,error:e}=await supabase.rpc("save_packing_bag_usage_upload",{p_entries:entries});
      if(e) throw e;
      setMessage("Upload successful: "+Number(data?.saved||0).toLocaleString("en-IN")+" date-wise bag records saved. Existing entries for the same bag type and date were replaced.");
      await onUploaded?.();
    } catch(e){setError(e.message||"Upload failed.");}
    finally{setBusy(false);}
  }
  if(!isAdmin) return <section><div className="panel"><h3>Administrator access required</h3><p className="muted">Consumption and damages uploads are restricted to the administrator.</p></div></section>;
  return <section>
    <div className="section-head"><div><span className="eyebrow">PACKING BAGS · FY 2026–27</span><h1>Upload Consumption &amp; Damages</h1><p className="muted">Upload date-wise quantities for all bag types from 01-Apr-2026 onwards.</p></div></div>
    <div className="panel">
      <div className="dropzone"><FileSpreadsheet size={34}/><h3>Select Excel or CSV workbook</h3><p>Required columns: Date, Bag Type, Consumption (NOS), Damages (NOS). Remarks is optional.</p><input type="file" accept=".xlsx,.xls,.csv" onChange={e=>e.target.files?.[0]&&chooseFile(e.target.files[0])}/></div>
      {file&&<p className="fileline"><b>{file.name}</b><button className="text-btn" type="button" onClick={()=>{setFile(null);setWorkbook(null);setRows([]);setHeaders([]);setMessage("");setError("");}}>Clear selected file</button></p>}
      {error&&<div className="alert error">{error}</div>}{message&&<div className="alert success">{message}</div>}
      {workbook&&<div className="mapping-panel">
        <h3>1. Worksheet and column mapping</h3>
        <label>Worksheet<select value={sheet} onChange={e=>{setSheet(e.target.value);parseSheet(workbook,e.target.value);}}>{workbook.SheetNames.map(n=><option key={n}>{n}</option>)}</select></label>
        <div className="mapping-grid">
          {[["date","Date *"],["bag","Bag Type *"],["consumption","Consumption (NOS) *"],["damages","Damages (NOS) *"],["remarks","Remarks"]].map(([k,label])=><label key={k}>{label}<select value={map[k]} onChange={e=>setMap(v=>({...v,[k]:e.target.value}))}><option value="">— Select column —</option>{headers.map(h=><option key={h} value={h}>{h}</option>)}</select></label>)}
        </div>
        <h3>2. Validation preview</h3>
        <div className="stats compact"><div className="stat"><span>Total rows</span><b>{mapped.length.toLocaleString("en-IN")}</b></div><div className="stat"><span>Valid rows</span><b>{(mapped.length-invalid).toLocaleString("en-IN")}</b></div><div className="stat"><span>Errors / duplicates</span><b>{invalid.toLocaleString("en-IN")}</b></div></div>
        <div className="table-scroll preview"><table><thead><tr><th>Excel Row</th><th>Date</th><th>Bag Type</th><th className="num">Consumption NOS</th><th className="num">Damages NOS</th><th>Validation</th></tr></thead><tbody>{mapped.slice(0,100).map(r=><tr key={r.row}><td>{r.row}</td><td>{r.date||"—"}</td><td>{r.bagText||"—"}</td><td className="num">{Number.isFinite(r.consumption)?r.consumption.toLocaleString("en-IN"):"—"}</td><td className="num">{Number.isFinite(r.damages)?r.damages.toLocaleString("en-IN"):"—"}</td><td>{r.errors.length?<span className="validation-error">{r.errors.join("; ")}</span>:<span className="validation-ok">Ready</span>}</td></tr>)}</tbody></table></div>
        {mapped.length>100&&<p className="footnote">Showing first 100 rows. All {mapped.length.toLocaleString("en-IN")} non-empty rows are validated before upload.</p>}
        {invalid>0&&<div className="alert error"><b>Upload is blocked: {invalid.toLocaleString("en-IN")} validation issue(s) found.</b><ul>{Object.entries(errorSummary).map(([label,count])=><li key={label}>{label}: {count}</li>)}{duplicateCount>0&&<li>Duplicate bag type/date rows: {duplicateCount}</li>}</ul>Check the Bag Type spelling and selected columns. Bag names such as “OPC Yellow” and “PPC Laminated Yellow” are now matched without requiring the word “Bags”.</div>}
        <div className="alert warning">For the historical FY balance through 18-Nov-2026, upload one row for every active bag type for every date from 01-Apr-2026 through 18-Nov-2026. Enter 0 for days with no consumption or damages. Partial historical uploads are saved but will not replace the existing historical baseline. For dates after 18-Nov-2026, each uploaded bag-type/date replaces the calculated values for that date. Existing values for the same bag type and date are replaced, not added. No records are changed until you confirm.</div>
        <button className="primary" type="button" onClick={submit} disabled={busy||!mapped.length||invalid>0}><UploadCloud size={16}/>{busy?"Uploading…":"Confirm and Upload"}</button>
      </div>}
    </div>
  </section>;
}
