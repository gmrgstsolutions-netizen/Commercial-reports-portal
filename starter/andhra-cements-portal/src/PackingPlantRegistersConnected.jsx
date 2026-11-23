import React,{useEffect,useMemo,useState} from "react";
import * as XLSX from "xlsx";
const CATS=["Mechanical","Electrical","Instrumentation","Operational","Planned"];
const STAFF=["Packer Operator","Loading Operator","Bulk Loading Operator","Belt Helper","Packing PLC Operator","Truck Loading Supervisor","Shift Incharge"];
const today=()=>{const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");};
const money=n=>Number(n||0).toLocaleString("en-IN",{maximumFractionDigits:2});
export default function PackingPlantRegistersConnected({supabase,session,profile,initialSection="Truck Loading"}){
 const [section,setSection]=useState(initialSection),[date,setDate]=useState(today()),[shift,setShift]=useState("A");
 const [rows,setRows]=useState([]),[vehicle,setVehicle]=useState(""),[product,setProduct]=useState("PPC"),[qty,setQty]=useState(""),[remarks,setRemarks]=useState("");
 const [employees,setEmployees]=useState([]),[name,setName]=useState(""),[code,setCode]=useState(""),[category,setCategory]=useState(STAFF[0]);
 const [employeeFile,setEmployeeFile]=useState(""),[employeeImportRows,setEmployeeImportRows]=useState([]),[employeeImportBusy,setEmployeeImportBusy]=useState(false);
 const [attendance,setAttendance]=useState({}),[attendanceRows,setAttendanceRows]=useState([]),[employeeSearch,setEmployeeSearch]=useState(""),[holiday,setHoliday]=useState(null),[holidayDate,setHolidayDate]=useState(""),[holidayText,setHolidayText]=useState("");
 const [reasons,setReasons]=useState([]),[reasonCategory,setReasonCategory]=useState(CATS[0]),[reason,setReason]=useState(""),[editReason,setEditReason]=useState(null);
 const [loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[notice,setNotice]=useState("");
 const [reportFrom,setReportFrom]=useState(today().slice(0,7)+"-01"),[reportTo,setReportTo]=useState(today()),[reportShift,setReportShift]=useState("ALL"),[reportSearch,setReportSearch]=useState(""),[attendanceReportRows,setAttendanceReportRows]=useState([]),[reportBusy,setReportBusy]=useState(false),[reportLoaded,setReportLoaded]=useState(false);
 const admin=profile?.role==="admin",canEdit=admin||profile?.role==="uploader";
 async function load(){
  setLoading(true);setNotice("");
  try{
   const [t,e,h,r]=await Promise.all([
    supabase.from("pp_truck_loading").select("*").eq("business_date",date).eq("shift_code",shift).order("created_at",{ascending:false}),
    supabase.from("pp_employees").select("*").eq("is_active",true).order("full_name"),
    supabase.from("pp_holidays").select("*").eq("holiday_date",date).eq("is_active",true).maybeSingle(),
    supabase.from("pp_stoppage_reasons").select("*").order("category").order("reason")
   ]);
   for(const x of [t,e,h,r])if(x.error)throw x.error;
   setRows(t.data||[]);setEmployees(e.data||[]);setHoliday(h.data||null);setReasons(r.data||[]);
   const {data:a,error:ae}=await supabase.from("pp_attendance").select("id,employee_id,attendance_status,duty_classification").eq("business_date",date).eq("shift_code",shift);
   if(ae)throw ae;setAttendanceRows(a||[]);const map={};for(const x of a||[])map[x.employee_id]=x.attendance_status==="present";setAttendance(map);
  }catch(err){setNotice("Unable to load register: "+err.message);}
  finally{setLoading(false);}
 }
 useEffect(()=>{load();},[date,shift,section]);
 async function addTruck(){
  const n=Number(qty);if(!vehicle.trim()||!Number.isFinite(n)||n<=0){setNotice("Enter vehicle number and quantity greater than zero.");return;}
  setSaving(true);setNotice("");
  const {error}=await supabase.from("pp_truck_loading").insert({business_date:date,shift_code:shift,vehicle_number:vehicle.trim().toUpperCase(),product_code:product,quantity_mt:n,remarks:remarks.trim()||null,created_by:session.user.id});
  setSaving(false);if(error){setNotice("Truck entry was not saved: "+error.message);return;}setVehicle("");setQty("");setRemarks("");setNotice("Truck loading entry saved.");load();
 }
 async function saveAttendance(){
  if(!canEdit){setNotice("Read-only access.");return;}
  if(!admin&&attendanceRows.length){setNotice("Attendance for this date and shift has already been submitted. Only an administrator can modify it.");return;}
  const selectedIds=Object.keys(attendance).filter(id=>attendance[id]);
  if(!selectedIds.length){setNotice("Select at least one employee before submitting attendance.");return;}
  setSaving(true);setNotice("");
  try{
   const monthStart=date.slice(0,7)+"-01";
   const {data:prior,error:pe}=await supabase.from("pp_attendance").select("employee_id,business_date").in("employee_id",selectedIds).eq("attendance_status","present").eq("duty_classification","actual_duty").gte("business_date",monthStart).lt("business_date",date);
   if(pe)throw pe;
   const counts={};for(const x of prior||[]){counts[x.employee_id]??=new Set();counts[x.employee_id].add(x.business_date);}
   const records=selectedIds.map(employee_id=>{const extra=!!holiday&&(counts[employee_id]?.size||0)>=7;return {business_date:date,shift_code:shift,employee_id,attendance_status:"present",duty_classification:extra?"extra_duty":"actual_duty",created_by:session.user.id};});
   if(admin){
    const {error}=await supabase.from("pp_attendance").upsert(records,{onConflict:"business_date,shift_code,employee_id"});if(error)throw error;
    const removeIds=attendanceRows.filter(x=>!selectedIds.includes(x.employee_id)).map(x=>x.id);
    if(removeIds.length){const {error:de}=await supabase.from("pp_attendance").delete().in("id",removeIds);if(de)throw de;}
   }else{
    const {error}=await supabase.from("pp_attendance").insert(records);if(error)throw error;
   }
   setNotice("Attendance submitted successfully for "+selectedIds.length+" employees.");
   await load();
  }catch(err){setNotice("Attendance not saved: "+err.message);}finally{setSaving(false);}
 }
 async function loadAttendanceReport(){
  if(!reportFrom||!reportTo||reportFrom>reportTo){setNotice("Select a valid From Date and To Date.");return;}
  setReportBusy(true);setNotice("");
  try{
   let q=supabase.from("pp_attendance").select("id,business_date,shift_code,attendance_status,duty_classification,employee:pp_employees(employee_code,full_name,staff_category)").gte("business_date",reportFrom).lte("business_date",reportTo).order("business_date",{ascending:true}).order("shift_code",{ascending:true});
   if(reportShift!=="ALL")q=q.eq("shift_code",reportShift);
   const {data,error}=await q;if(error)throw error;
   setAttendanceReportRows(data||[]);setReportLoaded(true);setNotice("Attendance report loaded: "+(data||[]).length+" records.");
  }catch(err){setNotice("Unable to load attendance report: "+err.message);}
  finally{setReportBusy(false);}
 }
 const filteredAttendanceReport=attendanceReportRows.filter(x=>{
  const q=reportSearch.trim().toLowerCase();if(!q)return true;
  const e=x.employee||{};return [e.employee_code,e.full_name,e.staff_category,x.shift_code,x.duty_classification].some(v=>String(v||"").toLowerCase().includes(q));
 });
 const attendanceSummary=Object.values(filteredAttendanceReport.reduce((acc,x)=>{
  const e=x.employee||{},id=x.employee_id;acc[id]??={employee_code:e.employee_code||"—",full_name:e.full_name||"Unknown employee",staff_category:e.staff_category||"—",days:new Set(),shifts:0,extra:0};
  if(x.attendance_status==="present"){acc[id].days.add(x.business_date);acc[id].shifts++;if(x.duty_classification==="extra_duty")acc[id].extra++;}
  return acc;
 },{})).map(x=>({...x,days:x.days.size}));
 function downloadAttendanceReport(){
  if(!filteredAttendanceReport.length){setNotice("No attendance records to download.");return;}
  const detail=filteredAttendanceReport.map((x,i)=>({ "S.No.":i+1,"Date":x.business_date,"Shift":x.shift_code,"Employee Code":x.employee?.employee_code||"","Employee Name":x.employee?.full_name||"","Job":x.employee?.staff_category||"","Attendance":x.attendance_status,"Duty Type":x.duty_classification==="extra_duty"?"Extra Duty":"Actual Duty"}));
  const summary=attendanceSummary.map((x,i)=>({"S.No.":i+1,"Employee Code":x.employee_code,"Employee Name":x.full_name,"Job":x.staff_category,"Present Days":x.days,"Present Shifts":x.shifts,"Extra Duty Shifts":x.extra}));
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(detail),"Attendance Details");XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(summary),"Employee Summary");
  XLSX.writeFile(wb,"Packing-Plant-Attendance-"+reportFrom+"-to-"+reportTo+".xlsx");
 }
 async function readEmployeeFile(file){
  if(!file)return;setNotice("");setEmployeeFile(file.name);setEmployeeImportRows([]);
  try{
   const buffer=await file.arrayBuffer();const wb=XLSX.read(buffer,{type:"array",cellDates:false});
   const ws=wb.Sheets[wb.SheetNames[0]];const grid=XLSX.utils.sheet_to_json(ws,{header:1,defval:"",raw:false});
   if(!grid.length)throw new Error("The selected Excel sheet is empty.");
   const norm=v=>String(v??"").toLowerCase().replace(/[^a-z0-9]/g,"");
   const headers=grid[0].map(norm);
   const find=(...names)=>headers.findIndex(h=>names.includes(h));
   const ix={code:find("idno","idnumber","id"),name:find("name","employeename","fullname"),job:find("job","designation","staffcategory"),mobile:find("mobileno","mobilenumber","mobile","phone")};
   const missing=Object.entries(ix).filter(([,v])=>v<0).map(([k])=>({code:"ID No.",name:"Name",job:"Job",mobile:"Mobile No."}[k]));
   if(missing.length)throw new Error("Missing column heading(s): "+missing.join(", ")+". Use ID No., Name, Job, Mobile No.");
   const parsed=grid.slice(1).filter(row=>row.some(v=>String(v??"").trim())).map((row,i)=>({
    employee_code:String(row[ix.code]??"").trim(),full_name:String(row[ix.name]??"").trim(),
    staff_category:(()=>{const job=String(row[ix.job]??"").trim();const aliases={"packer":"Packer Operator","loader":"Loading Operator","helper":"Belt Helper","bulker":"Bulk Loading Operator","truck loading operator":"Truck Loading Supervisor"};return aliases[job.toLowerCase()]??job;})(),mobile_no:String(row[ix.mobile]??"").trim(),source_row:i+2
   }));
   if(!parsed.length)throw new Error("No employee rows found below the headings.");
   const errors=[];const seen=new Set();
   parsed.forEach(r=>{if(!r.employee_code||!r.full_name||!r.staff_category||!r.mobile_no)errors.push("Excel row "+r.source_row+": all four columns are required.");if(r.staff_category&&!STAFF.includes(r.staff_category))errors.push("Excel row "+r.source_row+": Job must be one of: "+STAFF.join(", ")+". Use Packer for Packer Operator.");if(seen.has(r.employee_code.toLowerCase()))errors.push("Duplicate ID No. "+r.employee_code+" in the Excel file.");seen.add(r.employee_code.toLowerCase());});
   if(errors.length)throw new Error(errors.slice(0,8).join(" "));
   setEmployeeImportRows(parsed);setNotice("Preview ready: "+parsed.length+" employee records. Existing matching ID numbers will be updated; new IDs will be added.");
  }catch(err){setNotice("Excel file not accepted: "+err.message);}
 }
 async function uploadEmployees(){
  if(!admin||!employeeImportRows.length)return;setEmployeeImportBusy(true);setNotice("");
  try{
   const payload=employeeImportRows.map(({employee_code,full_name,staff_category,mobile_no})=>({employee_code,full_name,staff_category,mobile_no,is_active:true,created_by:session.user.id}));
   const {error}=await supabase.from("pp_employees").upsert(payload,{onConflict:"employee_code"});
   if(error)throw error;
   setNotice(employeeImportRows.length+" employee records uploaded successfully. Existing IDs were updated.");setEmployeeImportRows([]);setEmployeeFile("");await load();
  }catch(err){setNotice("Employee upload failed: "+err.message);}
  finally{setEmployeeImportBusy(false);}
 }
 async function addEmployee(){
  if(!admin)return;if(!name.trim()){setNotice("Enter employee name.");return;}
  const {error}=await supabase.from("pp_employees").insert({employee_code:code.trim()||null,full_name:name.trim(),staff_category:category,created_by:session.user.id});
  if(error){setNotice("Employee not saved: "+error.message);return;}setName("");setCode("");setNotice("Employee added.");load();
 }
 async function addHoliday(){
  if(!admin||!holidayDate)return;const {error}=await supabase.from("pp_holidays").upsert({holiday_date:holidayDate,description:holidayText.trim()||"Holiday / Festival",is_active:true,created_by:session.user.id},{onConflict:"holiday_date"});
  if(error){setNotice("Holiday not saved: "+error.message);return;}setHolidayDate("");setHolidayText("");setNotice("Holiday saved.");load();
 }
 async function saveReason(){
  if(!admin)return;if(!reason.trim()){setNotice("Enter a stoppage reason.");return;}
  const payload={category:reasonCategory,reason:reason.trim(),is_active:true,created_by:session.user.id};
  const result=editReason?await supabase.from("pp_stoppage_reasons").update({category:reasonCategory,reason:reason.trim()}).eq("id",editReason):await supabase.from("pp_stoppage_reasons").insert(payload);
  if(result.error){setNotice("Reason not saved: "+result.error.message);return;}setEditReason(null);setReason("");setNotice("Stoppage reason saved.");load();
 }
 async function toggleReason(r){const {error}=await supabase.from("pp_stoppage_reasons").update({is_active:!r.is_active}).eq("id",r.id);setNotice(error?"Update failed: "+error.message:"Reason status updated.");load();}
 const attendanceMatches=employees.filter(e=>{const q=employeeSearch.trim().toLowerCase();return q&&!attendance[e.id]&&((e.employee_code||"").toLowerCase().includes(q)||(e.full_name||"").toLowerCase().includes(q));}).slice(0,12);
 const total=rows.reduce((s,x)=>s+Number(x.quantity_mt),0),ppc=rows.filter(x=>x.product_code==="PPC").reduce((s,x)=>s+Number(x.quantity_mt),0),opc=total-ppc;
 return <section className="pp-registers">
  <div className="section-head"><div><span className="eyebrow">PACKING PLANT · LIVE DATABASE</span><h1>Shift Registers &amp; Masters</h1><p className="muted">Truck loading, attendance, employee and stoppage reason registers</p></div><span className="pill">{admin?"Administrator":canEdit?"Uploader":"Read-only"}</span></div>
  <div className="panel"><div className="mapping-grid pp-register-grid"><label>Business date<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>Shift<select value={shift} onChange={e=>setShift(e.target.value)}><option value="A">A Shift · 06:00–14:00</option><option value="B">B Shift · 14:00–22:00</option><option value="C">C Shift · 22:00–06:00</option><option value="G">G Shift · 08:00–17:00</option></select></label><div className="pp-kpi"><span>Shift business date</span><b>{date}</b></div></div></div>
  <div className="pp-register-tabs">{["Truck Loading","Attendance","Attendance Report","Employee Master","Holiday Master","Stoppage Reason Master"].map(x=><button key={x} className={section===x?"primary":"secondary"} onClick={()=>setSection(x)}>{x}</button>)}</div>
  {section==="Truck Loading"&&<><div className="panel"><h3>Individual truck loading entry</h3><div className="mapping-grid pp-register-grid"><label>Vehicle number<input value={vehicle} onChange={e=>setVehicle(e.target.value)} placeholder="Vehicle number" disabled={!canEdit}/></label><label>Product<select value={product} onChange={e=>setProduct(e.target.value)} disabled={!canEdit}><option>PPC</option><option>OPC</option></select></label><label>Quantity (MT)<input type="number" min="0" step="0.01" value={qty} onChange={e=>setQty(e.target.value)} disabled={!canEdit}/></label><label>Remarks (optional)<input value={remarks} onChange={e=>setRemarks(e.target.value)} disabled={!canEdit}/></label></div><button className="primary" onClick={addTruck} disabled={!canEdit||saving}>{saving?"Saving…":"Save truck entry"}</button></div>
   <div className="stats pp-truck-stats"><div className="stat"><span>Trucks</span><b>{rows.length}</b></div><div className="stat"><span>Total quantity (MT)</span><b>{money(total)}</b></div><div className="stat"><span>PPC (MT)</span><b>{money(ppc)}</b></div><div className="stat"><span>OPC (MT)</span><b>{money(opc)}</b></div></div>
   <div className="panel"><h3>Truck loading register</h3><div className="table-scroll"><table><thead><tr><th>Vehicle</th><th>Product</th><th>Quantity MT</th><th>Remarks</th><th>Recorded</th></tr></thead><tbody>{rows.map(x=><tr key={x.id}><td>{x.vehicle_number}</td><td>{x.product_code}</td><td className="num">{money(x.quantity_mt)}</td><td>{x.remarks||"—"}</td><td>{new Date(x.created_at).toLocaleString()}</td></tr>)}{!rows.length&&<tr><td colSpan="5" className="muted">No truck entries for this shift.</td></tr>}</tbody></table></div></div></>}
  {section==="Attendance"&&<div className="panel"><h3>Shift-wise employee attendance</h3>{holiday&&<div className="alert">Holiday: {holiday.description}. Extra Duty applies only after at least 7 regular attended days earlier in this calendar month.</div>}
   <div className="mapping-grid pp-register-grid">
    <label>Attendance date<input type="date" value={date} max={today()} onChange={e=>setDate(e.target.value)} disabled={!admin&&attendanceRows.length>0}/></label>
    <label>Shift<select value={shift} onChange={e=>setShift(e.target.value)} disabled={!admin&&attendanceRows.length>0}><option value="A">A Shift · 06:00–14:00</option><option value="B">B Shift · 14:00–22:00</option><option value="C">C Shift · 22:00–06:00</option><option value="G">G Shift · 08:00–17:00</option></select></label>
   </div>
   {attendanceRows.length>0&&!admin&&<div className="alert">Submitted attendance is locked. Only an administrator can modify this shift's attendance.</div>}
   <div className="mapping-grid pp-register-grid">
    <label>Search by employee code or name<input value={employeeSearch} onChange={e=>setEmployeeSearch(e.target.value)} placeholder="Type employee code or employee name…" disabled={!canEdit||(!admin&&attendanceRows.length>0)}/></label>
   </div>
   {attendanceMatches.length>0&&<div className="panel" style={{padding:"10px",marginTop:"8px"}}><strong>Matching employees — select one to add</strong><div className="table-scroll"><table><thead><tr><th>Employee code</th><th>Employee name</th><th>Job</th><th>Action</th></tr></thead><tbody>{attendanceMatches.map(e=><tr key={e.id}><td>{e.employee_code||"—"}</td><td>{e.full_name}</td><td>{e.staff_category}</td><td><button className="secondary" disabled={!canEdit||(!admin&&attendanceRows.length>0)} onClick={()=>{setAttendance(v=>({...v,[e.id]:true}));setEmployeeSearch("");}}>Add</button></td></tr>)}</tbody></table></div></div>}
   <div className="table-scroll"><table><thead><tr><th>S.No.</th><th>Employee code</th><th>Employee name</th><th>Job</th><th>Action</th></tr></thead><tbody>{employees.filter(e=>attendance[e.id]).map((e,i)=><tr key={e.id}><td>{i+1}</td><td>{e.employee_code||"—"}</td><td>{e.full_name}</td><td>{e.staff_category}</td><td><button className="text-btn" disabled={!admin&&attendanceRows.length>0} onClick={()=>setAttendance(v=>({...v,[e.id]:false}))}>Remove</button></td></tr>)}{!employees.some(e=>attendance[e.id])&&<tr><td colSpan="5" className="muted">Search by employee code or name and select an employee.</td></tr>}</tbody></table></div>
   <button className="primary" onClick={saveAttendance} disabled={!canEdit||saving||(!admin&&attendanceRows.length>0)||!employees.some(e=>attendance[e.id])}>{saving?"Saving…":attendanceRows.length>0&&admin?"Update attendance":"Save / Submit attendance"}</button>
   <p className="footnote">Only employees added to this shift are recorded as Present. Uploaders can submit attendance once for each date and shift. Administrators can add, remove or update submitted entries.</p>
  </div>}
  {section==="Attendance Report"&&<><div className="panel"><h3>Packing Plant Attendance Report</h3><p className="footnote">View submitted employee attendance by date and shift. Select a date range and click Generate Report.</p><div className="mapping-grid pp-register-grid">
   <label>From Date<input type="date" value={reportFrom} max={today()} onChange={e=>setReportFrom(e.target.value)}/></label>
   <label>To Date<input type="date" value={reportTo} max={today()} onChange={e=>setReportTo(e.target.value)}/></label>
   <label>Shift<select value={reportShift} onChange={e=>setReportShift(e.target.value)}><option value="ALL">All Shifts</option><option value="A">A Shift</option><option value="B">B Shift</option><option value="C">C Shift</option><option value="G">G Shift</option></select></label>
  </div><div className="button-row"><button className="primary" onClick={loadAttendanceReport} disabled={reportBusy}>{reportBusy?"Loading…":"Generate Report"}</button><button className="secondary" onClick={()=>{setReportFrom(today().slice(0,7)+"-01");setReportTo(today());setReportShift("ALL");setReportSearch("");setAttendanceReportRows([]);setReportLoaded(false);}}>Clear Filters</button>{reportLoaded&&<button className="secondary" onClick={downloadAttendanceReport}>Download Excel</button>}</div></div>
  {reportLoaded&&<><div className="stats pp-truck-stats"><div className="stat"><span>Attendance entries</span><b>{filteredAttendanceReport.length}</b></div><div className="stat"><span>Employees</span><b>{attendanceSummary.length}</b></div><div className="stat"><span>Present days (employee total)</span><b>{attendanceSummary.reduce((n,x)=>n+x.days,0)}</b></div><div className="stat"><span>Extra duty shifts</span><b>{attendanceSummary.reduce((n,x)=>n+x.extra,0)}</b></div></div>
  <div className="panel"><h3>Attendance details</h3><div className="mapping-grid pp-register-grid"><label>Search employee code / name / job<input value={reportSearch} onChange={e=>setReportSearch(e.target.value)} placeholder="Search attendance records…"/></label></div><div className="table-scroll"><table><thead><tr><th>S.No.</th><th>Date</th><th>Shift</th><th>Employee Code</th><th>Employee Name</th><th>Job</th><th>Attendance</th><th>Duty Type</th></tr></thead><tbody>{filteredAttendanceReport.map((x,i)=><tr key={x.id}><td>{i+1}</td><td>{x.business_date}</td><td>{x.shift_code}</td><td>{x.employee?.employee_code||"—"}</td><td>{x.employee?.full_name||"—"}</td><td>{x.employee?.staff_category||"—"}</td><td>{x.attendance_status==="present"?"Present":x.attendance_status}</td><td>{x.duty_classification==="extra_duty"?"Extra Duty":"Actual Duty"}</td></tr>)}{!filteredAttendanceReport.length&&<tr><td colSpan="8" className="muted">No attendance records match these filters.</td></tr>}</tbody></table></div></div>
  <div className="panel"><h3>Employee-wise summary</h3><div className="table-scroll"><table><thead><tr><th>S.No.</th><th>Employee Code</th><th>Employee Name</th><th>Job</th><th>Present Days</th><th>Present Shifts</th><th>Extra Duty Shifts</th></tr></thead><tbody>{attendanceSummary.map((x,i)=><tr key={x.employee_code+"-"+i}><td>{i+1}</td><td>{x.employee_code}</td><td>{x.full_name}</td><td>{x.staff_category}</td><td>{x.days}</td><td>{x.shifts}</td><td>{x.extra}</td></tr>)}{!attendanceSummary.length&&<tr><td colSpan="7" className="muted">No employee summary available.</td></tr>}</tbody></table></div></div></>}
  </>}
  {section==="Employee Master"&&<><div className="panel"><h3>Add employee · Admin only</h3>{admin?<><div className="mapping-grid pp-register-grid"><label>Employee code (optional)<input value={code} onChange={e=>setCode(e.target.value)}/></label><label>Employee name<input value={name} onChange={e=>setName(e.target.value)}/></label><label>Staff category<select value={category} onChange={e=>setCategory(e.target.value)}>{STAFF.map(x=><option key={x}>{x}</option>)}</select></label></div><button className="primary" onClick={addEmployee}>Add employee</button></>:<p className="muted">Administrator access is required to maintain employees.</p>}</div><div className="panel"><h3>Active employees</h3><div className="table-scroll"><table><thead><tr><th>Code</th><th>Name</th><th>Category</th></tr></thead><tbody>{employees.map(x=><tr key={x.id}><td>{x.employee_code||"—"}</td><td>{x.full_name}</td><td>{x.staff_category}</td></tr>)}</tbody></table></div></div></>}
  {section==="Holiday Master"&&<><div className="panel"><h3>Add holiday / festival · Admin only</h3>{admin?<><div className="mapping-grid pp-register-grid"><label>Holiday date<input type="date" value={holidayDate} onChange={e=>setHolidayDate(e.target.value)}/></label><label>Description<input value={holidayText} onChange={e=>setHolidayText(e.target.value)} placeholder="Holiday / festival name"/></label></div><button className="primary" onClick={addHoliday}>Save holiday</button></>:<p className="muted">Administrator access is required to maintain holidays.</p>}</div><div className="panel"><h3>Holiday for selected date</h3><p>{holiday?holiday.description:"No active holiday is recorded for this date."}</p></div></>}
  {section==="Stoppage Reason Master"&&<><div className="panel"><h3>{editReason?"Edit stoppage reason":"Add stoppage reason"} · Admin only</h3>{admin?<><div className="mapping-grid pp-register-grid"><label>Category<select value={reasonCategory} onChange={e=>setReasonCategory(e.target.value)}>{CATS.map(x=><option key={x}>{x}</option>)}</select></label><label>Reason<input value={reason} onChange={e=>setReason(e.target.value)}/></label></div><button className="primary" onClick={saveReason}>{editReason?"Update reason":"Add reason"}</button>{editReason&&<button className="secondary" onClick={()=>{setEditReason(null);setReason("");}}>Cancel</button>}</>:<p className="muted">Administrator access is required to maintain stoppage reasons.</p>}</div><div className="panel"><h3>Stoppage reasons</h3><div className="table-scroll"><table><thead><tr><th>Category</th><th>Reason</th><th>Status</th>{admin&&<th>Actions</th>}</tr></thead><tbody>{reasons.map(x=><tr key={x.id}><td>{x.category}</td><td>{x.reason}</td><td>{x.is_active?"Active":"Inactive"}</td>{admin&&<td><button className="text-btn" onClick={()=>{setEditReason(x.id);setReasonCategory(x.category);setReason(x.reason);}}>Edit</button><button className="text-btn" onClick={()=>toggleReason(x)}>{x.is_active?"Deactivate":"Activate"}</button></td>}</tr>)}</tbody></table></div></div></>}
  {loading&&<p className="muted">Loading register…</p>}{notice&&<div className={notice.includes("not saved")||notice.includes("failed")?"alert error":"alert"}>{notice}</div>}
 </section>;
}
