import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { LogOut, UploadCloud, FileSpreadsheet, LayoutDashboard, History, ShieldCheck, RefreshCw, Code2, GitPullRequest, Workflow } from "lucide-react";
import "./style.css";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = url && anon ? createClient(url, anon) : null;

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [reportType, setReportType] = useState("Packing Plant Reports");
  const [tab, setTab] = useState("Reports");
  const [bagTypes, setBagTypes] = useState([]);
  const [stockStatement, setStockStatement] = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [reportDate, setReportDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState([]);
  const [allRows, setAllRows] = useState([]);
  const [workbook, setWorkbook] = useState(null);
  const [sheetName, setSheetName] = useState("");
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({bagType:"",receiptDate:"",quantity:"",sourceRef:"",remarks:""});
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({data}) => setSession(data.session));
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_e,s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user) loadData();
    else { setProfile(null); setBagTypes([]); setStockStatement(null); setReceipts([]); }
  }, [session, reportDate]);

  async function loadData() {
    setBusy(true); setError("");
    try {
      const [p,b,r] = await Promise.all([
        supabase.from("profiles").select("id,email,full_name,role,is_active,must_change_password").eq("id",session.user.id).single(),
        supabase.from("packing_bag_types").select("*").eq("is_active",true).order("sort_order"),
        supabase.from("packing_bag_receipts").select("*").order("receipt_date",{ascending:false}).limit(1000)
      ]);
      if (p.error) throw p.error;
      if (!p.data.is_active) { await supabase.auth.signOut(); throw new Error("This account is inactive. Contact the administrator."); }
      setProfile(p.data);
      if (b.error) throw b.error;
      if (r.error) throw r.error;
      const {data: statement, error: statementError} = await supabase.rpc("get_packing_bag_stock_statement", {p_date: reportDate});
      if (statementError) throw statementError;
      setBagTypes(b.data||[]); setStockStatement(statement||null); setReceipts(r.data||[]);
    } catch(e) { setError(e.message || "Unable to load portal data."); }
    finally { setBusy(false); }
  }

  async function signIn(e) {
    e.preventDefault(); setError("");
    if (!supabase) return setError("Portal configuration is missing. Add the Supabase URL and public anon/publishable key in .env.");
    const {error} = await supabase.auth.signInWithPassword({email,password});
    if (error) setError(error.message);
  }
  async function signOut() { await supabase.auth.signOut(); setPassword(""); }

  const isAdmin = profile?.role === "admin";
  const canUpload = isAdmin || ["uploader"].includes(profile?.role);
  const stockRows = stockStatement?.rows ?? [];
  const totals = stockStatement?.totals ?? {};

  function applyWorksheet(wb, name) {
    const sheet = wb?.Sheets?.[name];
    if (!sheet) return;
    const rows = XLSX.utils.sheet_to_json(sheet,{defval:"",raw:true});
    if (!rows.length) { setAllRows([]); setPreview([]); setHeaders([]); setNotice("The selected worksheet has no data rows."); return; }
    const cols = Object.keys(rows[0]);
    const find = terms => cols.find(h => terms.some(t => h.toLowerCase().replace(/[^a-z0-9]/g,"").includes(t)));
    setHeaders(cols); setAllRows(rows); setPreview(rows.slice(0,200));
    setMapping({bagType:find(["bagtype","bagname","packingmaterial","material"])||"",receiptDate:find(["receiptdate","date","postingdate"])||"",quantity:find(["receiptqty","quantity","qty","bags","received"])||"",sourceRef:find(["sourceref","referenceno","challanno","docno","invoiceno"])||"",remarks:find(["remarks","narration","description"])||""});
    setNotice(rows.length.toLocaleString("en-IN")+" data rows found in “"+name+"”. Showing up to 200 rows below. This is a local preview only.");
  }
  async function parseFile(f) {
    setFile(f); setNotice(""); setPreview([]); setAllRows([]); setHeaders([]); setWorkbook(null);
    try { const data=await f.arrayBuffer(); const wb=XLSX.read(data,{type:"array",cellDates:true}); if(!wb.SheetNames.length) throw new Error("No worksheets were found."); setWorkbook(wb); setSheetName(wb.SheetNames[0]); applyWorksheet(wb,wb.SheetNames[0]); }
    catch(e) { setNotice("Could not read this workbook: "+e.message); }
  }
  const mappedRows = useMemo(() => {
    const seen=new Set();
    return allRows.map((row,index) => {
      const bag=String(mapping.bagType ? row[mapping.bagType] ?? "" : "").trim();
      const date=toISODate(mapping.receiptDate ? row[mapping.receiptDate] : "");
      const qty=Number(String(mapping.quantity ? row[mapping.quantity] ?? "" : "").replace(/,/g,"").trim());
      const bagMatch=bagTypes.find(b=>[b.name,b.code].some(v=>String(v ?? "").trim().toLowerCase()===bag.toLowerCase()));
      const ref=mapping.sourceRef ? String(row[mapping.sourceRef] ?? "").trim() : "";
      const key=bagMatch && date && ref ? String(bagMatch.id)+"|"+date+"|"+ref.toLowerCase() : "";
      const duplicate=Boolean(key && seen.has(key)); if(key) seen.add(key);
      const errors=[]; if(!bag) errors.push("Bag type missing"); else if(!bagMatch) errors.push("Bag type not matched to active portal list");
      if(!date) errors.push("Receipt date missing/invalid"); if(!Number.isFinite(qty)||qty<=0) errors.push("Quantity must be greater than zero"); if(duplicate) errors.push("Duplicate reference in this workbook");
      return {index:index+1,bag,date,quantity:qty,ref,errors};
    });
  },[allRows,mapping,bagTypes]);
  const validCount=mappedRows.filter(r=>r.errors.length===0).length;
  const invalidCount=mappedRows.length-validCount;

  if (!supabase) return <SetupScreen/>;
  if (!session) return <div className="login-wrap"><form className="login-card" onSubmit={signIn}>
    <div className="brand-mark">AC</div><p className="eyebrow">ANDHRA CEMENTS</p><h1>Commercial Reports</h1><p className="muted">Secure reporting portal</p>
    <label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="username"/></label>
    <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="current-password"/></label>
    {error && <div className="alert error">{error}</div>}<button className="primary full">Sign in</button>
    <small>Use your existing portal account. Password reset is managed by the administrator.</small>
  </form></div>;

  return <div className="app-shell">
    <aside className="sidebar"><div className="side-brand"><div className="brand-mark small">AC</div><div><b>ANDHRA CEMENTS</b><small>Commercial Reports</small></div></div>
      <div className="nav-label">REPORT TYPE</div>
      <select className="report-select" value={reportType} onChange={e=>setReportType(e.target.value)}>
        <option>Dispatch Reports</option><option>Weighbridge Reports</option><option>Packing Plant Reports</option>
      </select>
      <div className="nav-label">PACKING PLANT</div>
      <button className={tab==="Reports"?"nav active":"nav"} onClick={()=>setTab("Reports")}><LayoutDashboard size={17}/>Reports</button>
      {canUpload && <button className={tab==="Upload Data"?"nav active":"nav"} onClick={()=>setTab("Upload Data")}><UploadCloud size={17}/>Upload Data</button>}
      <button className={tab==="Upload History"?"nav active":"nav"} onClick={()=>setTab("Upload History")}><History size={17}/>Upload History</button>
      {isAdmin && <>
        <div className="nav-label">ADMIN MAINTENANCE</div>
        <a className="nav" href="https://github.com/gmrgstsolutions-netizen/Commercial-reports-portal/tree/source-import/starter-portal-2026-11-21/starter/andhra-cements-portal" target="_blank" rel="noreferrer"><Code2 size={17}/>Edit Portal Source</a>
        <a className="nav" href="https://github.com/gmrgstsolutions-netizen/Commercial-reports-portal/pull/2" target="_blank" rel="noreferrer"><GitPullRequest size={17}/>Review Changes</a>
        <a className="nav" href="https://github.com/gmrgstsolutions-netizen/Commercial-reports-portal/actions" target="_blank" rel="noreferrer"><Workflow size={17}/>Build Status</a>
      </>}
      <div className="sidebar-bottom"><ShieldCheck size={16}/><span>{profile?.role || "user"} access</span></div>
    </aside>
    <main className="main">
      <header className="topbar"><div><span className="eyebrow">COMMERCIAL OPERATIONS</span><h2>{reportType}</h2></div><div className="user-area"><span>{profile?.full_name || profile?.email}</span><button className="icon-btn" title="Sign out" onClick={signOut}><LogOut size={17}/></button></div></header>
      {reportType !== "Packing Plant Reports" ? <section className="panel"><h3>{reportType}</h3><p>This replacement portal package is currently setting up the Packing Plant module. The existing live Dispatch and Weighbridge portal remains unchanged and should continue to be used for those reports until their original source is recovered and separately migrated.</p></section> :
      <>
        {error && <div className="alert error">{error}</div>}
        {tab==="Reports" && <section>
          <div className="section-head"><div><span className="eyebrow">PACKING PLANT · FINANCIAL YEAR REPORT</span><h1>Packing Bags Stock Statement</h1><p className="muted">Opening balance, receipts, consumption, damages and closing balance calculated by the existing Supabase report function.</p></div><div className="date-tools"><label>Report date<input type="date" value={reportDate} onChange={e=>setReportDate(e.target.value)}/></label><button className="secondary" onClick={loadData}><RefreshCw size={16}/>Refresh</button></div></div>
          <div className="stats"><div className="stat"><span>Bag categories</span><b>{stockRows.length}</b></div><div className="stat"><span>Consumption YTD</span><b>{fmt(totals.consumption_ytd)} NOS</b></div><div className="stat"><span>Closing balance</span><b>{totals.closing_balance == null ? "Not Set" : `${fmt(totals.closing_balance)} NOS`}</b></div></div>
          <div className="panel"><div className="panel-title"><h3>Bag-wise stock position</h3><span className="pill">{reportDate}</span></div><div className="table-scroll"><table><thead><tr><th>Sl. No.</th><th>Particulars</th><th className="num">Opening</th><th className="num">Receipts OD</th><th className="num">Receipts MTD</th><th className="num">Receipts YTD</th><th className="num">Consumption OD</th><th className="num">Consumption MTD</th><th className="num">Consumption YTD</th><th className="num">Damages OD</th><th className="num">Damages MTD</th><th className="num">Damages YTD</th><th className="num">Closing</th></tr></thead><tbody>
            {stockRows.map((r,i)=><tr key={r.code}><td>{i+1}</td><td><b>{r.name}</b></td><td className="num">{r.opening_balance_set ? fmt(r.opening_balance) : "Not Set"}</td><td className="num">{fmt(r.receipts_od)}</td><td className="num">{fmt(r.receipts_mtd)}</td><td className="num">{fmt(r.receipts_ytd)}</td><td className="num">{fmt(r.consumption_od)}</td><td className="num">{fmt(r.consumption_mtd)}</td><td className="num">{fmt(r.consumption_ytd)}</td><td className="num">{fmt(r.damages_od)}</td><td className="num">{fmt(r.damages_mtd)}</td><td className="num">{fmt(r.damages_ytd)}</td><td className="num"><b>{r.opening_balance_set ? fmt(r.closing_balance) : "Not Set"}</b></td></tr>)}
            <tr className="total"><td colSpan="2">Grand Total</td><td className="num">{totals.opening_balance == null ? "Not Set" : fmt(totals.opening_balance)}</td><td className="num">{fmt(totals.receipts_od)}</td><td className="num">{fmt(totals.receipts_mtd)}</td><td className="num">{fmt(totals.receipts_ytd)}</td><td className="num">{fmt(totals.consumption_od)}</td><td className="num">{fmt(totals.consumption_mtd)}</td><td className="num">{fmt(totals.consumption_ytd)}</td><td className="num">{fmt(totals.damages_od)}</td><td className="num">{fmt(totals.damages_mtd)}</td><td className="num">{fmt(totals.damages_ytd)}</td><td className="num">{totals.closing_balance == null ? "Not Set" : fmt(totals.closing_balance)}</td></tr>
          </tbody></table></div><p className="footnote">Values are returned by the existing database calculation, including the configured product/channel mappings and damage rates. A missing opening baseline is not presented as a verified stock balance.</p></div>
        </section>}
        {tab==="Upload Data" && <section><div className="section-head"><div><span className="eyebrow">DATA IMPORT</span><h1>Upload Packing Plant Data</h1><p className="muted">Select a workbook to inspect its contents before any import is enabled.</p></div></div>
          <div className="panel"><div className="dropzone"><FileSpreadsheet size={34}/><h3>Select Excel or CSV workbook</h3><p>Supported: .xlsx, .xls, .csv</p><input type="file" accept=".xlsx,.xls,.csv" onChange={e=>e.target.files?.[0]&&parseFile(e.target.files[0])}/></div>
          {file && <p className="fileline"><b>{file.name}</b><button className="text-btn" onClick={()=>{setFile(null);setWorkbook(null);setSheetName("");setHeaders([]);setAllRows([]);setPreview([]);setNotice("");}}>Clear selected file</button></p>}
          {notice && <div className="alert">{notice}</div>}
          {workbook && <div className="mapping-panel">
            <h3>1. Select worksheet and map columns</h3>
            <label>Worksheet<select value={sheetName} onChange={e=>{setSheetName(e.target.value);applyWorksheet(workbook,e.target.value);}}>{workbook.SheetNames.map(n=><option key={n}>{n}</option>)}</select></label>
            <div className="mapping-grid">{[["bagType","Bag Type *"],["receiptDate","Receipt Date *"],["quantity","Quantity *"],["sourceRef","Source Reference"],["remarks","Remarks"]].map(([key,label])=><label key={key}>{label}<select value={mapping[key]} onChange={e=>setMapping(m=>({...m,[key]:e.target.value}))}><option value="">— Select column —</option>{headers.map(h=><option key={h} value={h}>{h}</option>)}</select></label>)}</div>
            <h3>2. Validation result</h3>
            <div className="stats compact"><div className="stat"><span>Total rows</span><b>{mappedRows.length.toLocaleString("en-IN")}</b></div><div className="stat"><span>Valid rows</span><b>{validCount.toLocaleString("en-IN")}</b></div><div className="stat"><span>Rows needing correction</span><b>{invalidCount.toLocaleString("en-IN")}</b></div></div>
            <div className="table-scroll preview"><table><thead><tr><th>Row</th><th>Bag Type</th><th>Receipt Date</th><th className="num">Quantity</th><th>Source Reference</th><th>Validation</th></tr></thead><tbody>{mappedRows.slice(0,50).map(r=><tr key={r.index}><td>{r.index}</td><td>{r.bag||"—"}</td><td>{r.date||"—"}</td><td className="num">{Number.isFinite(r.quantity)?fmt(r.quantity):"—"}</td><td>{r.ref||"—"}</td><td>{r.errors.length?<span className="validation-error">{r.errors.join("; ")}</span>:<span className="validation-ok">Ready</span>}</td></tr>)}</tbody></table></div>
            {mappedRows.length>50 && <p className="footnote">Showing first 50 mapped rows. All {mappedRows.length.toLocaleString("en-IN")} rows are included in the validation count.</p>}
            <div className="alert warning">Local validation only. No records have been submitted. Database-side Admin/Uploader authorization, atomic duplicate handling and import audit logging must be completed before submission can be enabled.</div>
            <button className="primary" disabled>Confirm and Submit — secure import setup pending</button>
          </div>}
          </div>
        </section>}
        {tab==="Upload History" && <section><div className="section-head"><div><span className="eyebrow">AUDIT TRAIL</span><h1>Packing Plant Upload History</h1></div><button className="secondary" onClick={loadData}><RefreshCw size={16}/>Refresh</button></div><div className="panel"><p className="muted">The current Packing Plant schema does not yet contain a dedicated import-history table. Existing receipt records are listed below as recorded transactions.</p><div className="table-scroll"><table><thead><tr><th>Receipt date</th><th>Bag type</th><th>Quantity</th><th>Reference</th><th>Remarks</th><th>Created at</th></tr></thead><tbody>{receipts.map(r=><tr key={r.id}><td>{r.receipt_date}</td><td>{bagTypes.find(b=>b.id===r.bag_type_id)?.name||"—"}</td><td className="num">{fmt(r.quantity)}</td><td>{r.source_ref||"—"}</td><td>{r.remarks||"—"}</td><td>{new Date(r.created_at).toLocaleString()}</td></tr>)}</tbody></table></div></div></section>}
      </>}
      <footer>Commercial Reports – Andhra Cements <span>Secure portal · {busy?"Refreshing…":"Connected"}</span></footer>
    </main>
  </div>;
}
function SetupScreen(){return <div className="login-wrap"><div className="login-card"><div className="brand-mark">AC</div><h1>Portal setup required</h1><p>Add the Supabase project URL and public anon/publishable key to a local <code>.env</code> file using <code>.env.example</code>. Never use a service-role key in this browser application.</p></div></div>}
function toISODate(value){
  if(value instanceof Date && !Number.isNaN(value.getTime())) return value.getFullYear()+"-"+String(value.getMonth()+1).padStart(2,"0")+"-"+String(value.getDate()).padStart(2,"0");
  if(typeof value==="number" && value>0){const d=XLSX.SSF.parse_date_code(value);if(d)return d.y+"-"+String(d.m).padStart(2,"0")+"-"+String(d.d).padStart(2,"0");}
  const s=String(value??"").trim();if(!s)return "";
  let m=s.match(/^(\\d{1,2})[-/.](\\d{1,2})[-/.](\\d{4})$/);if(m)return m[3]+"-"+m[2].padStart(2,"0")+"-"+m[1].padStart(2,"0");
  m=s.match(/^(\\d{4})-(\\d{1,2})-(\\d{1,2})/);if(m)return m[1]+"-"+m[2].padStart(2,"0")+"-"+m[3].padStart(2,"0");return "";
}
function fmt(v){return Number(v||0).toLocaleString("en-IN",{maximumFractionDigits:2})}
createRoot(document.getElementById("root")).render(<App/>);
