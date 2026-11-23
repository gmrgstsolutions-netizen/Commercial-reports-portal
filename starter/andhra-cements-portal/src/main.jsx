import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { LogOut, UploadCloud, FileSpreadsheet, LayoutDashboard, History, ShieldCheck, RefreshCw, Code2, GitPullRequest, Workflow } from "lucide-react";
import "./style.css";
import PackingPlantConnected from "./PackingPlantConnected.jsx";
import PackingPlantRegistersConnected from "./PackingPlantRegistersConnected.jsx";
import PackingPlantReportsConnected from "./PackingPlantReportsConnected.jsx";
import CementDispatchUpload from "./CementDispatchUpload.jsx";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = url && anon ? createClient(url, anon) : null;

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [reportType, setReportType] = useState(() => sessionStorage.getItem("ac_report_type") || "");
  const [shiftInchargeName, setShiftInchargeName] = useState(() => sessionStorage.getItem("ac_shift_incharge") || "");
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
  const [dispatchReportKey, setDispatchReportKey] = useState("state_district");
  const [dispatchData, setDispatchData] = useState(null);
  const [dispatchBusy, setDispatchBusy] = useState(false);
  const [dispatchError, setDispatchError] = useState("");
  const [dispatchFromDate, setDispatchFromDate] = useState(new Date(new Date().getFullYear(),new Date().getMonth(),1).toLocaleDateString("en-CA"));
  const [dispatchToDate, setDispatchToDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [invoiceFilters, setInvoiceFilters] = useState({p_invno:"",p_customer:"",p_warehouse:"",p_itemcode:"",p_saleschannel:"",p_oano:"",p_packslipno:"",p_vehicleno:"",p_shippingstate:"",p_district:"",p_transporter:""});
  const [weighReportKey, setWeighReportKey] = useState("datewise");
  const [weighData, setWeighData] = useState(null);
  const [weighBusy, setWeighBusy] = useState(false);
  const [weighError, setWeighError] = useState("");
  const [weighFromDate, setWeighFromDate] = useState(new Date(new Date().getFullYear(),new Date().getMonth(),1).toLocaleDateString("en-CA"));
  const [weighToDate, setWeighToDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [rawFromDate, setRawFromDate] = useState(new Date(new Date().getFullYear(),new Date().getMonth(),1).toLocaleDateString("en-CA"));
  const [rawToDate, setRawToDate] = useState(new Date().toLocaleDateString("en-CA"));
  const weighReports = [{key:"datewise",label:"Datewise Report",rpc:"get_weighbridge_report"},{key:"product_summary",label:"Consolidated Product Summary",rpc:"get_weighbridge_product_summary"},{key:"pending",label:"Pending Report",rpc:"get_weighbridge_pending_report"},{key:"outside",label:"Outside Main Gate",rpc:"get_weighbridge_outside_report"},{key:"raw_materials",label:"Raw Materials",rpc:"get_weighbridge_raw_material_report"},{key:"transaction_wise",label:"Weighbridge Transaction-wise",rpc:"get_weighbridge_transaction_report"}];
  const dispatchReports = [
    {key:"product_wise",label:"Product-wise Dispatch",rpc:"get_state_district_report"},
    {key:"state_district",label:"State / District",rpc:"get_state_district_report"},
    {key:"transporter",label:"Transporter-wise",rpc:"get_transporter_dispatch_report"},
    {key:"under_loading",label:"Under Loading",rpc:"get_under_loading_report"},
    {key:"clinker_customer",label:"Clinker Sales – Customer-wise",rpc:"get_clinker_customer_report"},
    {key:"invoice_wise",label:"Invoice-wise",rpc:"get_invoice_wise_report_v2"},
    {key:"trade_non_trade",label:"Trade / Non-Trade Summary",rpc:"get_trade_non_dispatches"},
    {key:"monthly_yearly",label:"Month-wise Financial Year Summary",rpc:"get_month_wise_yearly_report"}
  ];


  useEffect(() => {
    setTab(reportType === "Packing Plant Reports" ? "Packing Plant Operations" : "Reports");
  }, [reportType]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({data}) => setSession(data.session));
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_e,s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled=false;
    async function loadProfile() {
      if (!session?.user) { setProfile(null); return; }
      const {data,error:profileError}=await supabase.from("profiles")
        .select("id,email,full_name,role,is_active,must_change_password")
        .eq("id",session.user.id).single();
      if (cancelled) return;
      if (profileError) { setError(profileError.message); return; }
      if (!data.is_active) { await supabase.auth.signOut(); setError("This account is inactive. Contact the administrator."); return; }
      setProfile(data);
    }
    loadProfile();
    return () => { cancelled=true; };
  }, [session]);

  useEffect(() => {
    if (session?.user && reportType==="Packing Plant Reports") loadData();
    if (!session?.user) { setBagTypes([]); setStockStatement(null); setReceipts([]); }
  }, [session, reportDate, reportType]);

  useEffect(() => {
    if (session?.user && reportType==="Dispatch Reports") loadDispatch();
  }, [session, reportDate, reportType, dispatchReportKey, dispatchFromDate, dispatchToDate]);

  useEffect(() => {
    if (session?.user && reportType==="Weighbridge Reports") loadWeighbridge();
  }, [session, reportDate, reportType, weighReportKey, weighFromDate, weighToDate, rawFromDate, rawToDate]);

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


  async function loadDispatch(filterOverride = null) {
    if (!supabase || !session?.user) return;
    const selected = dispatchReports.find(x => x.key === dispatchReportKey);
    if (!selected) return;
    setDispatchBusy(true); setDispatchError("");
    try {
      let args={p_date:reportDate};
      if (dispatchReportKey==="invoice_wise") args={
        p_months:[],p_date_from:dispatchFromDate || null,p_date_to:dispatchToDate || null,
        ...(filterOverride || invoiceFilters),p_dispatchdate:"",p_limit:1000
      };
      else if (dispatchReportKey==="trade_non_trade") args={p_month:reportDate};
      else if (dispatchReportKey==="monthly_yearly") {
        const d=new Date(reportDate+"T00:00:00");
        args={p_fy_start:d.getMonth()>=3?d.getFullYear():d.getFullYear()-1};
      }
      const {data,error:rpcError} = await supabase.rpc(selected.rpc,args);
      if (rpcError) throw rpcError;
      setDispatchData(data ?? null);
    } catch(e) {
      setDispatchData(null);
      setDispatchError(e.message || "Unable to load this Dispatch report.");
    } finally { setDispatchBusy(false); }
  }

  async function loadWeighbridge() {
    if (!supabase || !session?.user) return;
    const selected = weighReports.find(x => x.key === weighReportKey);
    if (!selected) return;
    setWeighBusy(true); setWeighError("");
    try {
      const monthStart = new Date(new Date().getFullYear(),new Date().getMonth(),1).toLocaleDateString("en-CA");
      const today = new Date().toLocaleDateString("en-CA");
      const transactionFrom = weighFromDate || monthStart;
      const transactionTo = weighToDate || today;
      if (weighReportKey==="transaction_wise") {
        const span=(new Date(transactionTo+"T00:00:00")-new Date(transactionFrom+"T00:00:00"))/86400000;
        if (span<0) throw new Error("From date must be before To date.");
        if (span>92) throw new Error("Transaction-wise report supports a maximum 93-day date range.");
      }
      const args = weighReportKey === "raw_materials"
        ? {p_date_from:rawFromDate || monthStart,p_date_to:rawToDate || today,p_pass_no:"",p_rf_code:"",p_vehicle_no:"",p_dc_no:"",p_material:"",p_supplier:"",p_transporter:"",p_shift:"",p_limit:2000}
        : weighReportKey === "transaction_wise"
          ? {p_date_from:transactionFrom,p_date_to:transactionTo}
          : {p_date:reportDate};
      const {data,error:rpcError} = await supabase.rpc(selected.rpc,args);
      if (rpcError) throw rpcError;
      setWeighData(data ?? null);
    } catch(e) { setWeighData(null); setWeighError(e.message || "Unable to load this Weighbridge report."); }
    finally { setWeighBusy(false); }
  }

  async function signIn(e) {
    e.preventDefault(); setError("");
    if (!reportType || !shiftInchargeName.trim()) return setError("Select a Report Type and enter the Shift Incharge Name.");
    if (!supabase) return setError("Portal configuration is missing. Add the Supabase URL and public anon/publishable key in .env.");
    const {data, error} = await supabase.auth.signInWithPassword({email,password});
    if (error) { setError(error.message); return; }
    sessionStorage.setItem("ac_report_type", reportType);
    sessionStorage.setItem("ac_shift_incharge", shiftInchargeName.trim());
    if (reportType === "Dispatch Reports" || reportType === "Weighbridge Reports") {
      const {data: account} = await supabase.from("profiles").select("role,is_active").eq("id", data.user.id).single();
      if (account?.is_active && ["admin","uploader","dispatch_uploader","weighbridge_uploader"].includes(account.role)) {
        const {error: signoffError} = await supabase.rpc("save_shift_incharge", {
          p_report_type: reportType === "Dispatch Reports" ? "dispatch" : "weighbridge",
          p_shift_incharge_name: shiftInchargeName.trim()
        });
        if (signoffError) setError("Signed in, but Shift Incharge details could not be saved: " + signoffError.message);
      }
    }
  }
  async function signOut() {
    await supabase.auth.signOut();
    setPassword("");
    sessionStorage.removeItem("ac_report_type");
    sessionStorage.removeItem("ac_shift_incharge");
    setReportType("");
    setShiftInchargeName("");
  }

  const isAdmin = profile?.role === "admin";
  const canUpload = isAdmin || ["uploader"].includes(profile?.role);
  const canUploadDispatch = isAdmin || ["dispatch_uploader","uploader"].includes(profile?.role);
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
    <label>Report Type<select className="report-select login-select" value={reportType} onChange={e=>setReportType(e.target.value)} required><option value="">Select Report Type</option><option>Dispatch Reports</option><option>Weighbridge Reports</option><option>Packing Plant Reports</option></select></label>
    <label>Shift Incharge Name<input type="text" value={shiftInchargeName} onChange={e=>setShiftInchargeName(e.target.value)} required maxLength={100} placeholder="Enter Shift Incharge Name"/></label>
    {error && <div className="alert error">{error}</div>}<button className="primary full">Sign in</button>
    <small>Use your existing portal account. Password reset is managed by the administrator.</small>
  </form></div>;

  return <div className="app-shell">
    <aside className="sidebar"><div className="side-brand"><div className="brand-mark small">AC</div><div><b>ANDHRA CEMENTS</b><small>Commercial Reports</small></div></div>
      <div className="nav-label">SELECTED REPORT TYPE</div>
      <div className="selected-report-type">{reportType}</div>
      {reportType === "Dispatch Reports" && canUploadDispatch && <button className={tab==="Dispatch Upload"?"nav active":"nav"} onClick={()=>setTab("Dispatch Upload")}><UploadCloud size={17}/>Upload Dispatch Data</button>}
      {reportType === "Packing Plant Reports" && <>
        <div className="nav-label">PACKING PLANT</div>
        <button className={tab==="Packing Plant Operations"?"nav active":"nav"} onClick={()=>setTab("Packing Plant Operations")}><LayoutDashboard size={17}/>Production &amp; Running Hours</button>
        <button className={tab==="Packing Plant Registers"?"nav active":"nav"} onClick={()=>setTab("Packing Plant Registers")}><LayoutDashboard size={17}/>Shift Registers &amp; Masters</button>
        <button className={tab==="Integrated Reports"?"nav active":"nav"} onClick={()=>setTab("Integrated Reports")}><LayoutDashboard size={17}/>Integrated Reports</button>
        <button className={tab==="Reports"?"nav active":"nav"} onClick={()=>setTab("Reports")}><LayoutDashboard size={17}/>Packing Bags Stock Statement</button>
        {["Consumption","Damages","Daily Summary","Monthly Summary","Financial Year Summary"].map(name=><button key={name} className={tab===name?"nav active":"nav"} onClick={()=>setTab(name)}><LayoutDashboard size={17}/>{name}</button>)}
        <button className={tab==="Packing Bags Receipts"?"nav active":"nav"} onClick={()=>setTab("Packing Bags Receipts")}><History size={17}/>Packing Bags Receipts</button>
        {canUpload && <button className={tab==="Upload Data"?"nav active":"nav"} onClick={()=>setTab("Upload Data")}><UploadCloud size={17}/>Upload Data</button>}
        <button className={tab==="Upload History"?"nav active":"nav"} onClick={()=>setTab("Upload History")}><History size={17}/>Upload History</button>
      </>}
      {isAdmin && reportType === "Packing Plant Reports" && <>
        <div className="nav-label">ADMIN MAINTENANCE</div>
        <a className="nav" href="https://github.com/gmrgstsolutions-netizen/Commercial-reports-portal/tree/source-import/starter-portal-2026-11-21/starter/andhra-cements-portal" target="_blank" rel="noreferrer"><Code2 size={17}/>Edit Portal Source</a>
        <a className="nav" href="https://github.com/gmrgstsolutions-netizen/Commercial-reports-portal/pull/2" target="_blank" rel="noreferrer"><GitPullRequest size={17}/>Review Changes</a>
        <a className="nav" href="https://github.com/gmrgstsolutions-netizen/Commercial-reports-portal/actions" target="_blank" rel="noreferrer"><Workflow size={17}/>Build Status</a>
      </>}
      <div className="sidebar-bottom"><ShieldCheck size={16}/><span>{profile?.role || "user"} access</span></div>
    </aside>
    <main className="main">
      <header className="topbar"><div><span className="eyebrow">COMMERCIAL OPERATIONS</span><h2>{reportType}</h2></div><div className="user-area"><span>{shiftInchargeName} · {profile?.full_name || profile?.email}</span><button className="icon-btn" title="Sign out" onClick={signOut}><LogOut size={17}/></button></div></header>
      {reportType === "Dispatch Reports" ? (tab === "Dispatch Upload" ? <section><div className="section-head"><div><span className="eyebrow">DISPATCH DATA IMPORT</span><h1>Upload Dispatch Reports</h1><p className="muted">Import validated invoice rows into the connected reports database.</p></div></div><CementDispatchUpload supabase={supabase} onUploaded={loadDispatch}/></section> : <section>
        <div className="section-head"><div><span className="eyebrow">DISPATCH REPORTS · READ-ONLY PREVIEW</span><h1>{dispatchReports.find(x=>x.key===dispatchReportKey)?.label}</h1><p className="muted">Connected to the existing authenticated Supabase report function. Existing production data is read only.</p></div>
          <div className="date-tools">{dispatchReportKey==="invoice_wise" ? <><label>From date<input type="date" value={dispatchFromDate} onChange={e=>setDispatchFromDate(e.target.value)}/></label><label>To date<input type="date" value={dispatchToDate} onChange={e=>setDispatchToDate(e.target.value)}/></label></> : <label>{dispatchReportKey==="monthly_yearly"?"Financial year reference date":"Report date"}<input type="date" value={reportDate} onChange={e=>setReportDate(e.target.value)}/></label>}<button className="secondary" onClick={loadDispatch}><RefreshCw size={16}/>Refresh</button></div></div>
        <div className="panel"><div className="panel-title"><h3>Select report</h3><span className="pill">{dispatchReportKey==="invoice_wise"?dispatchFromDate+" to "+dispatchToDate:dispatchReportKey==="monthly_yearly"?"FY "+(new Date(reportDate+"T00:00:00").getMonth()>=3?new Date(reportDate+"T00:00:00").getFullYear():new Date(reportDate+"T00:00:00").getFullYear()-1)+"-"+String((new Date(reportDate+"T00:00:00").getMonth()>=3?new Date(reportDate+"T00:00:00").getFullYear()+1:new Date(reportDate+"T00:00:00").getFullYear()) ).slice(-2):reportDate}</span></div>
          <div className="mapping-grid"><label>Report<select value={dispatchReportKey} onChange={e=>setDispatchReportKey(e.target.value)}>{dispatchReports.map(x=><option key={x.key} value={x.key}>{x.label}</option>)}</select></label></div>
        </div>
        {dispatchReportKey==="invoice_wise" && <div className="panel"><div className="panel-title"><h3>Invoice-wise filters</h3><span className="pill">Optional</span></div><div className="mapping-grid">{[["p_invno","Invoice number"],["p_customer","Customer"],["p_warehouse","Warehouse"],["p_itemcode","Product code"],["p_saleschannel","Sales channel"],["p_oano","OA number"],["p_packslipno","Packslip number"],["p_vehicleno","Vehicle number"],["p_shippingstate","Shipping state"],["p_district","District"],["p_transporter","Transporter"]].map(([key,label])=><label key={key}>{label}<input value={invoiceFilters[key]} onChange={e=>setInvoiceFilters(v=>({...v,[key]:e.target.value}))} placeholder={"Search "+label.toLowerCase()}/></label>)}</div><div className="date-tools"><button className="secondary" onClick={loadDispatch}>Search invoices</button><button className="text-btn" onClick={()=>{const cleared={p_invno:"",p_customer:"",p_warehouse:"",p_itemcode:"",p_saleschannel:"",p_oano:"",p_packslipno:"",p_vehicleno:"",p_shippingstate:"",p_district:"",p_transporter:""};setInvoiceFilters(cleared);loadDispatch(cleared);}}>Clear filters</button></div></div>}
        {dispatchError && <div className="alert error">{dispatchError}</div>}
        {dispatchBusy && <div className="panel"><p>Loading report from Supabase…</p></div>}
        {!dispatchBusy && dispatchData && (dispatchReportKey==="product_wise" ? <ProductWiseDispatchView data={dispatchData}/> : <ReportDataView data={dispatchData}/>) }
        {!dispatchBusy && !dispatchError && dispatchData===null && <div className="panel"><p className="muted">Select Refresh to load the report.</p></div>}
        <div className="alert warning">These connected reports are read-only. Invoice-wise results are limited to 1,000 rows; use the date range to narrow the result. Trade / Non-Trade is month-scoped. Financial-year summary requires the account to have All dates permission. Product-wise and other final report layouts will be mapped after their exact data sources are verified.</div>
      </section>) : reportType === "Weighbridge Reports" ? <section>
        <div className="section-head"><div><span className="eyebrow">WEIGHBRIDGE REPORTS · READ-ONLY PREVIEW</span><h1>{weighReports.find(x=>x.key===weighReportKey)?.label}</h1><p className="muted">Connected to existing authenticated Supabase report functions. Production data is read only.</p></div>
          {weighReportKey==="raw_materials" || weighReportKey==="transaction_wise" ? <div className="date-tools"><label>From date<input type="date" value={weighReportKey==="raw_materials"?rawFromDate:weighFromDate} onChange={e=>weighReportKey==="raw_materials"?setRawFromDate(e.target.value):setWeighFromDate(e.target.value)}/></label><label>To date<input type="date" value={weighReportKey==="raw_materials"?rawToDate:weighToDate} onChange={e=>weighReportKey==="raw_materials"?setRawToDate(e.target.value):setWeighToDate(e.target.value)}/></label><button className="secondary" onClick={loadWeighbridge}><RefreshCw size={16}/>Refresh</button></div> : <div className="date-tools"><label>Report date<input type="date" value={reportDate} onChange={e=>setReportDate(e.target.value)}/></label><button className="secondary" onClick={loadWeighbridge}><RefreshCw size={16}/>Refresh</button></div>}</div>
        <div className="panel"><div className="panel-title"><h3>Select report</h3><span className="pill">{weighReportKey==="raw_materials" ? rawFromDate+" to "+rawToDate : weighReportKey==="transaction_wise" ? weighFromDate+" to "+weighToDate : reportDate}</span></div><div className="mapping-grid"><label>Report<select value={weighReportKey} onChange={e=>setWeighReportKey(e.target.value)}>{weighReports.map(x=><option key={x.key} value={x.key}>{x.label}</option>)}</select></label></div></div>
        {weighError && <div className="alert error">{weighError}</div>}
        {weighBusy && <div className="panel"><p>Loading report from Supabase…</p></div>}
        {!weighBusy && weighData && <ReportDataView data={weighData}/>}
        {!weighBusy && !weighError && weighData===null && <div className="panel"><p className="muted">Select Refresh to load the report.</p></div>}
        <div className="alert warning">Card Issue Details is not connected yet: the verified database inventory contains no dedicated Card Issue table or RPC. It will not be substituted with Outside Main Gate. Transaction-wise report requires both dates and a maximum 93-day range. Upload workflows and export controls remain pending verification.</div>
      </section> :
      <>
        {tab==="Packing Plant Operations" && <PackingPlantConnected supabase={supabase} session={session} profile={profile} shiftInchargeName={shiftInchargeName}/>}
        {tab==="Integrated Reports" && <PackingPlantReportsConnected supabase={supabase}/>}
        {tab==="Packing Plant Registers" && <PackingPlantRegistersConnected supabase={supabase} session={session} profile={profile}/>}
        {error && <div className="alert error">{error}</div>}
        {tab==="Reports" && <section>
          <div className="section-head"><div><span className="eyebrow">PACKING PLANT · FINANCIAL YEAR REPORT</span><h1>Packing Bags Stock Statement</h1><p className="muted">Opening balance, receipts, consumption, damages and closing balance calculated by the existing Supabase report function.</p></div><div className="date-tools"><label>Report date<input type="date" value={reportDate} onChange={e=>setReportDate(e.target.value)}/></label><button className="secondary" onClick={loadData}><RefreshCw size={16}/>Refresh</button></div></div>
          <div className="stats"><div className="stat"><span>Bag categories</span><b>{stockRows.length}</b></div><div className="stat"><span>Consumption YTD</span><b>{fmt(totals.consumption_ytd)} NOS</b></div><div className="stat"><span>Closing balance</span><b>{totals.closing_balance == null ? "Not Set" : `${fmt(totals.closing_balance)} NOS`}</b></div></div>
          <div className="panel"><div className="panel-title"><h3>Bag-wise stock position</h3><span className="pill">{reportDate}</span></div><div className="table-scroll"><table><thead><tr><th>Sl. No.</th><th>Particulars</th><th className="num">Opening</th><th className="num">Receipts OD</th><th className="num">Receipts MTD</th><th className="num">Receipts YTD</th><th className="num">Consumption OD</th><th className="num">Consumption MTD</th><th className="num">Consumption YTD</th><th className="num">Damages OD</th><th className="num">Damages MTD</th><th className="num">Damages YTD</th><th className="num">Closing</th></tr></thead><tbody>
            {stockRows.map((r,i)=><tr key={r.code}><td>{i+1}</td><td><b>{r.name}</b></td><td className="num">{r.opening_balance_set ? fmt(r.opening_balance) : "Not Set"}</td><td className="num">{fmt(r.receipts_od)}</td><td className="num">{fmt(r.receipts_mtd)}</td><td className="num">{fmt(r.receipts_ytd)}</td><td className="num">{fmt(r.consumption_od)}</td><td className="num">{fmt(r.consumption_mtd)}</td><td className="num">{fmt(r.consumption_ytd)}</td><td className="num">{fmt(r.damages_od)}</td><td className="num">{fmt(r.damages_mtd)}</td><td className="num">{fmt(r.damages_ytd)}</td><td className="num"><b>{r.opening_balance_set ? fmt(r.closing_balance) : "Not Set"}</b></td></tr>)}
            <tr className="total"><td colSpan="2">Grand Total</td><td className="num">{totals.opening_balance == null ? "Not Set" : fmt(totals.opening_balance)}</td><td className="num">{fmt(totals.receipts_od)}</td><td className="num">{fmt(totals.receipts_mtd)}</td><td className="num">{fmt(totals.receipts_ytd)}</td><td className="num">{fmt(totals.consumption_od)}</td><td className="num">{fmt(totals.consumption_mtd)}</td><td className="num">{fmt(totals.consumption_ytd)}</td><td className="num">{fmt(totals.damages_od)}</td><td className="num">{fmt(totals.damages_mtd)}</td><td className="num">{fmt(totals.damages_ytd)}</td><td className="num">{totals.closing_balance == null ? "Not Set" : fmt(totals.closing_balance)}</td></tr>
          </tbody></table></div><p className="footnote">Values are returned by the existing database calculation, including the configured product/channel mappings and damage rates. A missing opening baseline is not presented as a verified stock balance.</p></div>
        </section>}
        {tab!=="Reports" && ["Consumption","Damages","Daily Summary","Monthly Summary","Financial Year Summary"].includes(tab) && <section>
          <div className="section-head"><div><span className="eyebrow">PACKING PLANT REPORTS</span><h1>{tab==="Consumption"?"Packing Plant Consumption":tab==="Damages"?"Packing Bags Damages":tab==="Daily Summary"?"Daily Packing Summary":tab==="Monthly Summary"?"Bag-wise Monthly Summary":"Bag-wise Financial Year Summary"}</h1><p className="muted">Calculated from the existing verified Packing Bags Stock Statement response. No source records are modified.</p></div><div className="date-tools"><label>Report date<input type="date" value={reportDate} onChange={e=>setReportDate(e.target.value)}/></label><button className="secondary" onClick={loadData}><RefreshCw size={16}/>Refresh</button></div></div>
          <div className="panel"><div className="panel-title"><h3>{tab}</h3><span className="pill">{reportDate}</span></div>
            <div className="table-scroll"><table><thead><tr><th>Sl. No.</th><th>Bag Type</th>{(tab==="Consumption"?["OD","MTD","YTD"]:tab==="Damages"?["OD","MTD","YTD"]:tab==="Daily Summary"?["Receipts OD","Consumption OD","Damages OD","Closing"]:tab==="Monthly Summary"?["Receipts MTD","Consumption MTD","Damages MTD"]:["Opening","Receipts YTD","Consumption YTD","Damages YTD","Closing"]).map(h=><th className="num" key={h}>{h}</th>)}</tr></thead><tbody>
            {stockRows.map((r,i)=><tr key={r.code}><td>{i+1}</td><td><b>{r.name}</b></td>
              {(tab==="Consumption"?[r.consumption_od,r.consumption_mtd,r.consumption_ytd]:tab==="Damages"?[r.damages_od,r.damages_mtd,r.damages_ytd]:tab==="Daily Summary"?[r.receipts_od,r.consumption_od,r.damages_od,r.opening_balance_set?r.closing_balance:"Not Set"]:tab==="Monthly Summary"?[r.receipts_mtd,r.consumption_mtd,r.damages_mtd]:[r.opening_balance_set?r.opening_balance:"Not Set",r.receipts_ytd,r.consumption_ytd,r.damages_ytd,r.opening_balance_set?r.closing_balance:"Not Set"]).map((v,j)=><td className="num" key={j}>{v==="Not Set"?v:fmt(v)}</td>)}
            </tr>)}
            </tbody></table></div>
            <p className="footnote">{tab==="Monthly Summary"?"MTD means the first day of the selected month through the selected report date.":tab==="Financial Year Summary"?"YTD means 1 April through the selected report date (April–March financial year).":"OD means the selected report date. MTD and YTD values are provided by the existing database calculation."} A historical month-by-month ledger is not yet available from the verified report function, so this screen shows the available period totals rather than inventing historical rows.</p>
          </div>
        </section>}
        {tab==="Packing Bags Receipts" && <section><div className="section-head"><div><span className="eyebrow">PACKING PLANT · RECEIPT REGISTER</span><h1>Packing Bags Receipts</h1><p className="muted">Receipt transactions recorded in the existing database.</p></div><button className="secondary" onClick={loadData}><RefreshCw size={16}/>Refresh</button></div><div className="panel"><div className="table-scroll"><table><thead><tr><th>Receipt Date</th><th>Bag Type</th><th className="num">Quantity</th><th>Source Reference</th><th>Remarks</th><th>Recorded At</th></tr></thead><tbody>{receipts.map(r=><tr key={r.id}><td>{r.receipt_date}</td><td>{bagTypes.find(b=>b.id===r.bag_type_id)?.name||"—"}</td><td className="num">{fmt(r.quantity)}</td><td>{r.source_ref||"—"}</td><td>{r.remarks||"—"}</td><td>{new Date(r.created_at).toLocaleString()}</td></tr>)}</tbody></table></div></div></section>}
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

function ProductWiseDispatchView({data}) {
  const grouped = new Map();
  const add = (label,row) => {
    const current=grouped.get(label)||{product:label,on_date_qty:0,mtd_qty:0,ytd_qty:0};
    current.on_date_qty+=Number(row.on_date_qty||0);
    current.mtd_qty+=Number(row.mtd_qty||0);
    current.ytd_qty+=Number(row.ytd_qty||0);
    grouped.set(label,current);
  };
  for (const row of data?.products||[]) {
    const code=String(row.product_code||"").trim().toUpperCase();
    let label=code||"Unmapped Product";
    if (code==="OPC53B") label="OPC53 Bulk";
    else if (code.includes("OPC")||code==="CEMENT") label="OPC53 Bag";
    else if (code==="PPCB") label="PPC Bulk";
    else if (code==="PPCL") label="PPC Laminated";
    else if (code.includes("PPC")) label="PPC Bag";
    add(label,row);
  }
  if (data?.clinker) add("Clinker",data.clinker);
  const rows=[...grouped.values()].sort((a,b)=>a.product.localeCompare(b.product));
  const totals=rows.reduce((t,r)=>({on_date_qty:t.on_date_qty+r.on_date_qty,mtd_qty:t.mtd_qty+r.mtd_qty,ytd_qty:t.ytd_qty+r.ytd_qty}),{on_date_qty:0,mtd_qty:0,ytd_qty:0});
  return <div className="panel"><div className="panel-title"><h3>Product-wise Dispatch Summary</h3><span className="pill">{data?.report_date||""} · MT</span></div>
    <div className="table-scroll"><table><thead><tr><th>Sl. No.</th><th>Product</th><th className="num">On Date (MT)</th><th className="num">MTD (MT)</th><th className="num">YTD (MT)</th></tr></thead><tbody>
      {rows.map((r,i)=><tr key={r.product}><td>{i+1}</td><td><b>{r.product}</b></td><td className="num">{fmt(r.on_date_qty)}</td><td className="num">{fmt(r.mtd_qty)}</td><td className="num">{fmt(r.ytd_qty)}</td></tr>)}
      <tr className="total"><td colSpan="2">Grand Total</td><td className="num">{fmt(totals.on_date_qty)}</td><td className="num">{fmt(totals.mtd_qty)}</td><td className="num">{fmt(totals.ytd_qty)}</td></tr>
    </tbody></table></div>
    <p className="footnote">Product totals are grouped using the approved mapping: OPC-related to OPC53 Bag, OPC53B to OPC53 Bulk, PPC-related to PPC Bag, PPCB to PPC Bulk, PPCL as PPC Laminated, and CLN/CLINKER as Clinker. Source: the authenticated State/District report’s product totals.</p>
  </div>;
}

function ReportDataView({data}) {
  const arrays = [];
  const summaries = [];
  function walk(value,path="Report") {
    if (Array.isArray(value)) {
      if (!value.length || value.every(x=>x && typeof x==="object" && !Array.isArray(x))) {
        arrays.push({name:path,rows:value});
      }
      return;
    }
    if (value && typeof value==="object") {
      for (const [k,v] of Object.entries(value)) walk(v,path+" / "+k.replace(/_/g," "));
      return;
    }
    if (path!=="Report") summaries.push({name:path,value});
  }
  walk(data);
  const fmtValue = v => v===null || v===undefined ? "—" : typeof v==="object" ? JSON.stringify(v) : String(v);
  return <section>
    {summaries.length>0 && <div className="stats">{summaries.map(({name,value})=><div className="stat" key={name}><span>{name}</span><b>{fmtValue(value)}</b></div>)}</div>}
    {arrays.length>0 ? arrays.map((section,index)=>{
      const columns=[...new Set(section.rows.flatMap(r=>Object.keys(r)))];
      return <div className="panel" key={section.name+"-"+index}>
        <div className="panel-title"><h3>{section.name}</h3><span className="pill">{section.rows.length} rows</span></div>
        {section.rows.length ? <div className="table-scroll"><table><thead><tr>{columns.map(col=><th key={col}>{col.replace(/_/g," ")}</th>)}</tr></thead><tbody>{section.rows.map((row,rowIndex)=><tr key={rowIndex}>{columns.map(col=><td key={col}>{fmtValue(row[col])}</td>)}</tr>)}</tbody></table></div> : <p className="muted">No rows returned for this section.</p>}
      </div>;
    }) : <div className="panel"><h3>Report response</h3><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",fontSize:12}}>{JSON.stringify(data,null,2)}</pre></div>}
  </section>;
}

function SetupScreen(){return <div className="login-wrap"><div className="login-card"><div className="brand-mark">AC</div><h1>Portal setup required</h1><p>Add the Supabase project URL and public anon/publishable key to a local <code>.env</code> file using <code>.env.example</code>. Never use a service-role key in this browser application.</p></div></div>}
function toISODate(value){
  if(value instanceof Date && !Number.isNaN(value.getTime())) return value.getFullYear()+"-"+String(value.getMonth()+1).padStart(2,"0")+"-"+String(value.getDate()).padStart(2,"0");
  if(typeof value==="number" && value>0){const d=XLSX.SSF.parse_date_code(value);if(d)return d.y+"-"+String(d.m).padStart(2,"0")+"-"+String(d.d).padStart(2,"0");}
  const s=String(value??"").trim();if(!s)return "";
  let m=s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);if(m)return m[3]+"-"+m[2].padStart(2,"0")+"-"+m[1].padStart(2,"0");
  m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);if(m)return m[1]+"-"+m[2].padStart(2,"0")+"-"+m[3].padStart(2,"0");return "";
}
function fmt(v){return Number(v||0).toLocaleString("en-IN",{maximumFractionDigits:2})}
createRoot(document.getElementById("root")).render(<App/>);
