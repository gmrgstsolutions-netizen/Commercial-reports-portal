import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { LogOut, UploadCloud, FileSpreadsheet, LayoutDashboard, History, ShieldCheck, RefreshCw } from "lucide-react";
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
  const [opening, setOpening] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState([]);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({data}) => setSession(data.session));
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_e,s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user) loadData();
    else { setProfile(null); setBagTypes([]); setOpening([]); setReceipts([]); }
  }, [session]);

  async function loadData() {
    setBusy(true); setError("");
    try {
      const [p,b,o,r] = await Promise.all([
        supabase.from("profiles").select("id,email,full_name,role,is_active,must_change_password").eq("id",session.user.id).single(),
        supabase.from("packing_bag_types").select("*").eq("is_active",true).order("sort_order"),
        supabase.from("packing_bag_opening_balances").select("*").eq("financial_year_start","2026-04-01"),
        supabase.from("packing_bag_receipts").select("*").order("receipt_date",{ascending:false}).limit(1000)
      ]);
      if (p.error) throw p.error;
      if (!p.data.is_active) { await supabase.auth.signOut(); throw new Error("This account is inactive. Contact the administrator."); }
      setProfile(p.data);
      if (b.error) throw b.error; if (o.error) throw o.error; if (r.error) throw r.error;
      setBagTypes(b.data||[]); setOpening(o.data||[]); setReceipts(r.data||[]);
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
  const stockRows = useMemo(() => bagTypes.map(b => {
    const ob = opening.find(x => x.bag_type_id === b.id)?.quantity ?? 0;
    const rec = receipts.filter(x => x.bag_type_id === b.id).reduce((s,x)=>s+Number(x.quantity||0),0);
    return {name:b.name,uom:b.uom,opening:Number(ob),receipts:rec,closing:Number(ob)+rec};
  }), [bagTypes,opening,receipts]);

  async function parseFile(f) {
    setFile(f); setNotice(""); setPreview([]);
    try {
      const data = await f.arrayBuffer();
      const wb = XLSX.read(data,{type:"array",cellDates:true});
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet,{defval:""});
      if (!rows.length) throw new Error("The selected sheet has no data rows.");
      setPreview(rows.slice(0,200));
      setNotice(`${rows.length} data rows found. Showing first ${Math.min(rows.length,200)} rows for inspection. No database records have been changed.`);
    } catch(e) { setNotice(`Could not read this workbook: ${e.message}`); }
  }

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
      <div className="sidebar-bottom"><ShieldCheck size={16}/><span>{profile?.role || "user"} access</span></div>
    </aside>
    <main className="main">
      <header className="topbar"><div><span className="eyebrow">COMMERCIAL OPERATIONS</span><h2>{reportType}</h2></div><div className="user-area"><span>{profile?.full_name || profile?.email}</span><button className="icon-btn" title="Sign out" onClick={signOut}><LogOut size={17}/></button></div></header>
      {reportType !== "Packing Plant Reports" ? <section className="panel"><h3>{reportType}</h3><p>This replacement portal package is currently setting up the Packing Plant module. The existing live Dispatch and Weighbridge portal remains unchanged and should continue to be used for those reports until their original source is recovered and separately migrated.</p></section> :
      <>
        {error && <div className="alert error">{error}</div>}
        {tab==="Reports" && <section>
          <div className="section-head"><div><span className="eyebrow">FY 2026–27 · 01 APR 2026 – 31 MAR 2027</span><h1>Packing Bags Stock Statement</h1><p className="muted">Calculated from recorded opening balances and receipts. Consumption and damages are not included until their transaction tables are implemented.</p></div><button className="secondary" onClick={loadData}><RefreshCw size={16}/>Refresh</button></div>
          <div className="stats"><div className="stat"><span>Bag categories</span><b>{bagTypes.length}</b></div><div className="stat"><span>Opening stock</span><b>{fmt(stockRows.reduce((s,x)=>s+x.opening,0))} NOS</b></div><div className="stat"><span>Recorded receipts</span><b>{fmt(stockRows.reduce((s,x)=>s+x.receipts,0))} NOS</b></div></div>
          <div className="panel"><div className="panel-title"><h3>Bag-wise position</h3><span className="pill">NOS</span></div><div className="table-scroll"><table><thead><tr><th>Sl. No.</th><th>Particulars</th><th>UOM</th><th className="num">O.B.</th><th className="num">Receipts</th><th className="num">Calculated balance*</th></tr></thead><tbody>
            {stockRows.map((r,i)=><tr key={r.name}><td>{i+1}</td><td><b>{r.name}</b></td><td>{r.uom}</td><td className="num">{fmt(r.opening)}</td><td className="num">{fmt(r.receipts)}</td><td className="num"><b>{fmt(r.closing)}</b></td></tr>)}
            <tr className="total"><td colSpan="3">Grand Total</td><td className="num">{fmt(stockRows.reduce((s,x)=>s+x.opening,0))}</td><td className="num">{fmt(stockRows.reduce((s,x)=>s+x.receipts,0))}</td><td className="num">{fmt(stockRows.reduce((s,x)=>s+x.closing,0))}</td></tr>
          </tbody></table></div><p className="footnote">*Calculated balance = FY opening stock + all recorded receipts. It is not the final physical closing stock because consumption and damages are not yet stored in the current database schema.</p></div>
        </section>}
        {tab==="Upload Data" && <section><div className="section-head"><div><span className="eyebrow">DATA IMPORT</span><h1>Upload Packing Plant Data</h1><p className="muted">Select a workbook to inspect its contents before any import is enabled.</p></div></div>
          <div className="panel"><div className="dropzone"><FileSpreadsheet size={34}/><h3>Select Excel or CSV workbook</h3><p>Supported: .xlsx, .xls, .csv</p><input type="file" accept=".xlsx,.xls,.csv" onChange={e=>e.target.files?.[0]&&parseFile(e.target.files[0])}/></div>
          {file && <p className="fileline"><b>{file.name}</b><button className="text-btn" onClick={()=>{setFile(null);setPreview([]);setNotice("");}}>Clear selected file</button></p>}
          {notice && <div className="alert">{notice}</div>}
          {preview.length>0 && <><h3>Import preview</h3><div className="table-scroll preview"><table><thead><tr>{Object.keys(preview[0]).map(k=><th key={k}>{k}</th>)}</tr></thead><tbody>{preview.slice(0,12).map((r,i)=><tr key={i}>{Object.values(r).map((v,j)=><td key={j}>{String(v)}</td>)}</tr>)}</tbody></table></div>
          <div className="alert warning">Database submission is intentionally not enabled yet. Current Packing Plant tables have read-only Row Level Security policies; enabling upload before role-specific server-side policies and an audited import process are installed would be unsafe.</div>
          <button className="primary" disabled>Confirm and Submit — pending secure import setup</button></>}
          </div>
        </section>}
        {tab==="Upload History" && <section><div className="section-head"><div><span className="eyebrow">AUDIT TRAIL</span><h1>Packing Plant Upload History</h1></div><button className="secondary" onClick={loadData}><RefreshCw size={16}/>Refresh</button></div><div className="panel"><p className="muted">The current Packing Plant schema does not yet contain a dedicated import-history table. Existing receipt records are listed below as recorded transactions.</p><div className="table-scroll"><table><thead><tr><th>Receipt date</th><th>Bag type</th><th>Quantity</th><th>Reference</th><th>Remarks</th><th>Created at</th></tr></thead><tbody>{receipts.map(r=><tr key={r.id}><td>{r.receipt_date}</td><td>{bagTypes.find(b=>b.id===r.bag_type_id)?.name||"—"}</td><td className="num">{fmt(r.quantity)}</td><td>{r.source_ref||"—"}</td><td>{r.remarks||"—"}</td><td>{new Date(r.created_at).toLocaleString()}</td></tr>)}</tbody></table></div></div></section>}
      </>}
      <footer>Commercial Reports – Andhra Cements <span>Secure portal · {busy?"Refreshing…":"Connected"}</span></footer>
    </main>
  </div>;
}
function SetupScreen(){return <div className="login-wrap"><div className="login-card"><div className="brand-mark">AC</div><h1>Portal setup required</h1><p>Add the Supabase project URL and public anon/publishable key to a local <code>.env</code> file using <code>.env.example</code>. Never use a service-role key in this browser application.</p></div></div>}
function fmt(v){return Number(v||0).toLocaleString("en-IN",{maximumFractionDigits:2})}
createRoot(document.getElementById("root")).render(<App/>);
