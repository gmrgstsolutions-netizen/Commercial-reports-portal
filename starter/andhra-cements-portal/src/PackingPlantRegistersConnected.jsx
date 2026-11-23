import React,{useEffect,useMemo,useState} from "react";
import * as XLSX from "xlsx";
const CATS=["Mechanical","Electrical","Instrumentation","Operational","Planned"];
const STAFF=["Packer Operator","Loading Operator","Bulk Loading Operator","Belt Helper","Packing PLC Operator","Truck Loading Operator","Shift Incharge"];
const today=()=>{const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");};
const money=n=>Number(n||0).toLocaleString("en-IN",{maximumFractionDigits:2});
export default function PackingPlantRegistersConnected({supabase,session,profile}){
 const [section,setSection]=useState("Truck Loading"),[date,setDate]=useState(today()),[shift,setShift]=useState("A");
 const [rows,setRows]=useState([]),[vehicle,setVehicle]=useState(""),[product,setProduct]=useState("PPC"),[qty,setQty]=useState(""),[remarks,setRemarks]=useState("");
 const [employees,setEmployees]=useState([]),[name,setName]=useState(""),[code,setCode]=useState(""),[category,setCategory]=useState(STAFF[0]);
 const [employeeFile,setEmployeeFile]=useState(""),[employeeImportRows,setEmployeeImportRows]=useState([]),[employeeImportBusy,setEmployeeImportBusy]=useState(false);
 const [attendance,setAttendance]=useState({}),[holiday,setHoliday]=useState(null),[holidayDate,setHolidayDate]=useState(""),[holidayText,setHolidayText]=useState("");
 const [reasons,setReasons]=useState([]),[reasonCategory,setReasonCategory]=useState(CATS[0]),[reason,setReason]=useState(""),[editReason,setEditReason]=useState(null);
 const [loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[notice,setNotice]=useState("");
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
   const {data:a,error:ae}=await supabase.from("pp_attendance").select("employee_id,attendance_status,duty_classification").eq("business_date",date).eq("shift_code",shift);
   if(ae)throw ae;const map={};for(const x of a||[])map[x.employee_id]=x.attendance_status==="present";setAttendance(map);
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
  if(!canEdit){setNotice("Read-only access.");return;}setSaving(true);setNotice("");
  try{
   const monthStart=date.slice(0,7)+"-01";
   const {data:prior,error:pe}=await supabase.from("pp_attendance").select("employee_id,business_date").in("employee_id",employees.map(x=>x.id)).eq("attendance_status","present").eq("duty_classification","actual_duty").gte("business_date",monthStart).lt("business_date",date);
   if(pe)throw pe;
   const counts={};for(const x of prior||[]){counts[x.employee_id]??=new Set();counts[x.employee_id].add(x.business_date);}
   const records=employees.map(emp=>{const present=!!attendance[emp.id];const extra=!!holiday&&present&&(counts[emp.id]?.size||0)>=7;return {business_date:date,shift_code:shift,employee_id:emp.id,attendance_status:present?"present":"absent",duty_classification:extra?"extra_duty":"actual_duty",created_by:session.user.id};});
   if(records.length){const {error}=await supabase.from("pp_attendance").upsert(records,{onConflict:"business_date,shift_code,employee_id"});if(error)throw error;}
   setNotice("Attendance saved. Holiday extra-duty eligibility was calculated from prior regular attendance in this calendar month.");
  }catch(err){setNotice("Attendance not saved: "+err.message);}finally{setSaving(false);}
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
    staff_category:String(row[ix.job]??"").trim(),mobile_no:String(row[ix.mobile]??"").trim(),source_row:i+2
   }));
   if(!parsed.length)throw new Error("No employee rows found below the headings.");
   const errors=[];const seen=new Set();
   parsed.forEach(r=>{if(!r.employee_code||!r.full_name||!r.staff_category||!r.mobile_no)errors.push("Excel row "+r.source_row+": all four columns are required.");if(seen.has(r.employee_code.toLowerCase()))errors.push("Duplicate ID No. "+r.employee_code+" in the Excel file.");seen.add(r.employee_code.toLowerCase());});
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
 const total=rows.reduce((s,x)=>s+Number(x.quantity_mt),0),ppc=rows.filter(x=>x.product_code==="PPC").reduce((s,x)=>s+Number(x.quantity_mt),0),opc=total-ppc;
 return <section className="pp-registers">
  <div className="section-head"><div><span className="eyebrow">PACKING PLANT · LIVE DATABASE</span><h1>Shift Registers &amp; Masters</h1><p className="muted">Truck loading, attendance, employee and stoppage reason registers</p></div><span className="pill">{admin?"Administrator":canEdit?"Uploader":"Read-only"}</span></div>
  <div className="panel"><div className="mapping-grid pp-register-grid"><label>Business date<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>Shift<select value={shift} onChange={e=>setShift(e.target.value)}><option value="A">A Shift · 06:00–14:00</option><option value="B">B Shift · 14:00–22:00</option><option value="C">C Shift · 22:00–06:00</option></select></label><div className="pp-kpi"><span>Shift business date</span><b>{date}</b></div></div></div>
  <div className="pp-register-tabs">{["Truck Loading","Attendance","Employee Master","Employee Upload","Holiday Master","Stoppage Reason Master"].map(x=><button key={x} className={section===x?"primary":"secondary"} onClick={()=>setSection(x)}>{x}</button>)}</div>
  {section==="Truck Loading"&&<><div className="panel"><h3>Individual truck loading entry</h3><div className="mapping-grid pp-register-grid"><label>Vehicle number<input value={vehicle} onChange={e=>setVehicle(e.target.value)} placeholder="Vehicle number" disabled={!canEdit}/></label><label>Product<select value={product} onChange={e=>setProduct(e.target.value)} disabled={!canEdit}><option>PPC</option><option>OPC</option></select></label><label>Quantity (MT)<input type="number" min="0" step="0.01" value={qty} onChange={e=>setQty(e.target.value)} disabled={!canEdit}/></label><label>Remarks (optional)<input value={remarks} onChange={e=>setRemarks(e.target.value)} disabled={!canEdit}/></label></div><button className="primary" onClick={addTruck} disabled={!canEdit||saving}>{saving?"Saving…":"Save truck entry"}</button></div>
   <div className="stats pp-truck-stats"><div className="stat"><span>Trucks</span><b>{rows.length}</b></div><div className="stat"><span>Total quantity (MT)</span><b>{money(total)}</b></div><div className="stat"><span>PPC (MT)</span><b>{money(ppc)}</b></div><div className="stat"><span>OPC (MT)</span><b>{money(opc)}</b></div></div>
   <div className="panel"><h3>Truck loading register</h3><div className="table-scroll"><table><thead><tr><th>Vehicle</th><th>Product</th><th>Quantity MT</th><th>Remarks</th><th>Recorded</th></tr></thead><tbody>{rows.map(x=><tr key={x.id}><td>{x.vehicle_number}</td><td>{x.product_code}</td><td className="num">{money(x.quantity_mt)}</td><td>{x.remarks||"—"}</td><td>{new Date(x.created_at).toLocaleString()}</td></tr>)}{!rows.length&&<tr><td colSpan="5" className="muted">No truck entries for this shift.</td></tr>}</tbody></table></div></div></>}
  {section==="Attendance"&&<div className="panel"><h3>Shift attendance</h3>{holiday&&<div className="alert">Holiday: {holiday.description}. Extra Duty applies only after at least 7 regular attended days earlier in this calendar month.</div>}<div className="table-scroll"><table><thead><tr><th>Employee</th><th>Category</th><th>Present</th></tr></thead><tbody>{employees.map(e=><tr key={e.id}><td>{e.full_name}</td><td>{e.staff_category}</td><td><input type="checkbox" checked={!!attendance[e.id]} disabled={!canEdit} onChange={ev=>setAttendance(a=>({...a,[e.id]:ev.target.checked}))}/></td></tr>)}{!employees.length&&<tr><td colSpan="3" className="muted">Add employees in Employee Master first.</td></tr>}</tbody></table></div><button className="primary" onClick={saveAttendance} disabled={!canEdit||saving||!employees.length}>{saving?"Saving…":"Save attendance"}</button><p className="footnote">Employees not marked present are saved as Absent. The seven-day test uses prior Actual Duty records in this calendar month.</p></div>}
  {section==="Employee Master"&&<><div className="panel"><h3>Add employee · Admin only</h3>{admin?<><div className="mapping-grid pp-register-grid"><label>Employee code (optional)<input value={code} onChange={e=>setCode(e.target.value)}/></label><label>Employee name<input value={name} onChange={e=>setName(e.target.value)}/></label><label>Staff category<select value={category} onChange={e=>setCategory(e.target.value)}>{STAFF.map(x=><option key={x}>{x}</option>)}</select></label></div><button className="primary" onClick={addEmployee}>Add employee</button></>:<p className="muted">Administrator access is required to maintain employees.</p>}</div><div className="panel"><h3>Active employees</h3><div className="table-scroll"><table><thead><tr><th>Code</th><th>Name</th><th>Category</th></tr></thead><tbody>{employees.map(x=><tr key={x.id}><td>{x.employee_code||"—"}</td><td>{x.full_name}</td><td>{x.staff_category}</td></tr>)}</tbody></table></div></div></>}
  {section==="Employee Upload"&&<><div className="panel"><h3>Upload employee master from Excel · Admin only</h3>{admin?<><p className="footnote">Upload an .xlsx, .xls or .csv file. The first worksheet must contain these exact column headings (capitalization and punctuation may vary): ID No., Name, Job, Mobile No.</p><div className="mapping-grid pp-register-grid"><label>Employee Excel file<input type="file" accept=".xlsx,.xls,.csv" onChange={e=>readEmployeeFile(e.target.files?.[0])}/></label><div className="pp-kpi"><span>Selected file</span><b>{employeeFile||"No file selected"}</b></div></div>{employeeImportRows.length>0&&<><p className="footnote">{employeeImportRows.length} records ready for upload. Existing employee IDs will be updated; new IDs will be inserted.</p><div className="table-scroll"><table><thead><tr><th>ID No.</th><th>Name</th><th>Job</th><th>Mobile No.</th></tr></thead><tbody>{employeeImportRows.slice(0,20).map((x,i)=><tr key={i}><td>{x.employee_code}</td><td>{x.full_name}</td><td>{x.staff_category}</td><td>{x.mobile_no}</td></tr>)}</tbody></table></div>{employeeImportRows.length>20&&<p className="muted">Showing first 20 of {employeeImportRows.length} records.</p>}<button className="primary" onClick={uploadEmployees} disabled={employeeImportBusy}>{employeeImportBusy?"Uploading…":"Confirm & Upload Employees"}</button><button className="secondary" onClick={()=>{setEmployeeImportRows([]);setEmployeeFile("");}}>Clear selected file</button></>}</>:<p className="muted">Administrator access is required to upload employees.</p>}</div></>}
  {section==="Holiday Master"&&<><div className="panel"><h3>Add holiday / festival · Admin only</h3>{admin?<><div className="mapping-grid pp-register-grid"><label>Holiday date<input type="date" value={holidayDate} onChange={e=>setHolidayDate(e.target.value)}/></label><label>Description<input value={holidayText} onChange={e=>setHolidayText(e.target.value)} placeholder="Holiday / festival name"/></label></div><button className="primary" onClick={addHoliday}>Save holiday</button></>:<p className="muted">Administrator access is required to maintain holidays.</p>}</div><div className="panel"><h3>Holiday for selected date</h3><p>{holiday?holiday.description:"No active holiday is recorded for this date."}</p></div></>}
  {section==="Stoppage Reason Master"&&<><div className="panel"><h3>{editReason?"Edit stoppage reason":"Add stoppage reason"} · Admin only</h3>{admin?<><div className="mapping-grid pp-register-grid"><label>Category<select value={reasonCategory} onChange={e=>setReasonCategory(e.target.value)}>{CATS.map(x=><option key={x}>{x}</option>)}</select></label><label>Reason<input value={reason} onChange={e=>setReason(e.target.value)}/></label></div><button className="primary" onClick={saveReason}>{editReason?"Update reason":"Add reason"}</button>{editReason&&<button className="secondary" onClick={()=>{setEditReason(null);setReason("");}}>Cancel</button>}</>:<p className="muted">Administrator access is required to maintain stoppage reasons.</p>}</div><div className="panel"><h3>Stoppage reasons</h3><div className="table-scroll"><table><thead><tr><th>Category</th><th>Reason</th><th>Status</th>{admin&&<th>Actions</th>}</tr></thead><tbody>{reasons.map(x=><tr key={x.id}><td>{x.category}</td><td>{x.reason}</td><td>{x.is_active?"Active":"Inactive"}</td>{admin&&<td><button className="text-btn" onClick={()=>{setEditReason(x.id);setReasonCategory(x.category);setReason(x.reason);}}>Edit</button><button className="text-btn" onClick={()=>toggleReason(x)}>{x.is_active?"Deactivate":"Activate"}</button></td>}</tr>)}</tbody></table></div></div></>}
  {loading&&<p className="muted">Loading register…</p>}{notice&&<div className={notice.includes("not saved")||notice.includes("failed")?"alert error":"alert"}>{notice}</div>}
 </section>;
}
