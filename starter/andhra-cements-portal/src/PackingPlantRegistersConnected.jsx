import React,{useEffect,useMemo,useState} from "react";
import * as XLSX from "xlsx";
const CATS=["Mechanical","Electrical","Instrumentation","Operational","Planned"];
const STAFF=["Packer Operator","Loading Operator","Bulk Loading Operator","Belt Helper","Packing PLC Operator","Truck Loading Supervisor","Shift Incharge"];
const today=()=>{const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");};
const money=n=>Number(n||0).toLocaleString("en-IN",{maximumFractionDigits:2});
const normHeader=v=>String(v??"").toLowerCase().replace(/[^a-z0-9]/g,"");
function parseBagDateTime(value,fallbackDate){
 if(value instanceof Date&&!Number.isNaN(value.getTime()))return new Date(value.getFullYear(),value.getMonth(),value.getDate(),value.getHours(),value.getMinutes(),value.getSeconds());
 const s=String(value??"").trim();
 let m=s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
 if(m)return new Date(Number(m[3]),Number(m[2])-1,Number(m[1]),Number(m[4]),Number(m[5]),Number(m[6]||0));
 m=s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
 if(m)return new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),Number(m[4]),Number(m[5]),Number(m[6]||0));
 m=s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
 if(m&&fallbackDate){const [y,mo,d]=fallbackDate.split("-").map(Number);return new Date(y,mo-1,d,Number(m[1]),Number(m[2]),Number(m[3]||0));}
 const parsed=new Date(s);return Number.isNaN(parsed.getTime())?null:parsed;
}
const isoLocalDate=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const isoLocalDateTime=d=>isoLocalDate(d)+"T"+String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0")+":"+String(d.getSeconds()).padStart(2,"0");
const secondsBetween=(a,b)=>Math.max(0,Math.round((b-a)/1000));
const packerForCounter=n=>n===1?"P1":n===2?"P2":"P3";
const shiftForStart=d=>{const m=d.getHours()*60+d.getMinutes();return m>=360&&m<840?"A":m>=840&&m<1320?"B":"C";};

export default function PackingPlantRegistersConnected({supabase,session,profile,initialSection="Truck Loading"}){
 const [section,setSection]=useState(initialSection),[date,setDate]=useState(today()),[shift,setShift]=useState("A");
 const [rows,setRows]=useState([]),[vehicle,setVehicle]=useState(""),[product,setProduct]=useState("PPC"),[qty,setQty]=useState(""),[remarks,setRemarks]=useState("");
 const [employees,setEmployees]=useState([]),[name,setName]=useState(""),[code,setCode]=useState(""),[category,setCategory]=useState(STAFF[0]);
 const [employeeFile,setEmployeeFile]=useState(""),[employeeImportRows,setEmployeeImportRows]=useState([]),[employeeImportBusy,setEmployeeImportBusy]=useState(false);
 const [attendance,setAttendance]=useState({}),[attendanceRows,setAttendanceRows]=useState([]),[employeeSearch,setEmployeeSearch]=useState(""),[holiday,setHoliday]=useState(null),[holidayDate,setHolidayDate]=useState(""),[holidayText,setHolidayText]=useState("");
 const [reasons,setReasons]=useState([]),[reasonCategory,setReasonCategory]=useState(CATS[0]),[reason,setReason]=useState(""),[editReason,setEditReason]=useState(null);
 const [loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[notice,setNotice]=useState("");
 const [reportFrom,setReportFrom]=useState(today().slice(0,7)+"-01"),[reportTo,setReportTo]=useState(today()),[reportShift,setReportShift]=useState("ALL"),[reportSearch,setReportSearch]=useState(""),[attendanceReportRows,setAttendanceReportRows]=useState([]),[reportBusy,setReportBusy]=useState(false),[reportLoaded,setReportLoaded]=useState(false);
 const [bagReportFrom,setBagReportFrom]=useState(today().slice(0,7)+"-01"),[bagReportTo,setBagReportTo]=useState(today()),[bagFile,setBagFile]=useState(null),[bagFileName,setBagFileName]=useState(""),[bagPreview,setBagPreview]=useState([]),[bagSessions,setBagSessions]=useState([]),[bagMatches,setBagMatches]=useState([]),[bagBusy,setBagBusy]=useState(false);
 const [packerFrom,setPackerFrom]=useState(today().slice(0,7)+"-01"),[packerTo,setPackerTo]=useState(today()),[packerShift,setPackerShift]=useState("ALL"),[packerFilter,setPackerFilter]=useState("ALL"),[packerReportRows,setPackerReportRows]=useState([]), [packerUnmatchedDispatch,setPackerUnmatchedDispatch]=useState([]),[packerReportLoaded,setPackerReportLoaded]=useState(false),[packerReportBusy,setPackerReportBusy]=useState(false),[packerSearch,setPackerSearch]=useState("");
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
 useEffect(()=>{load();},[date,shift]);
 useEffect(()=>{if(section==="Bag Counting Upload")loadBagSessions();},[section,bagReportFrom,bagReportTo]);
 
 function invoiceCutoffDate(start,end){
  const isMonthEnd=d=>{const next=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1);return next.getDate()===1;};
  const monthEndActivity=isMonthEnd(start)||isMonthEnd(end)||start.getMonth()!==end.getMonth()||start.getFullYear()!==end.getFullYear();
  const cutoff=new Date(end.getTime()+(monthEndActivity?48:8)*60*60*1000);
  return {date:isoLocalDate(cutoff),hours:monthEndActivity?48:8};
 }
 async function fetchDispatchForSessions(sessions){
  const dates=new Set();
  sessions.forEach(x=>{
   const start=new Date(x.loading_start),end=new Date(x.loading_end);
   const from=new Date(isoLocalDate(start)+"T00:00:00");
   const to=new Date(invoiceCutoffDate(start,end).date+"T00:00:00");
   for(let d=new Date(from);d<=to;d.setDate(d.getDate()+1))dates.add(isoLocalDate(d));
  });
  const all=[];
  for(const day of [...dates].sort()){
   const {data,error}=await supabase.rpc("get_pp_dispatch_matches",{p_date_from:day,p_date_to:day});
   if(error)throw error;
   all.push(...(data||[]));
  }
  return all;
 }
 async function loadBagSessions(){
  if(!bagReportFrom||!bagReportTo||bagReportFrom>bagReportTo){setNotice("Select a valid Bag Counting date range.");return;}
  const {data,error}=await supabase.from("pp_bag_counting_sessions").select("*").gte("business_date",bagReportFrom).lte("business_date",bagReportTo).order("loading_start");
  if(error){setNotice("Unable to load bag-counting sessions: "+error.message);return;}
  setBagSessions(data||[]);
  if(!(data||[]).length){setBagMatches([]);return;}
  try{
   const dispatch=await fetchDispatchForSessions(data);
   setBagMatches(data.map(x=>{
    const start=new Date(x.loading_start),end=new Date(x.loading_end),startDate=isoLocalDate(start),cutoff=invoiceCutoffDate(start,end);
    const vehicle=String(x.vehicle_number||"").replace(/\s/g,"").toUpperCase();
    const match=dispatch.filter(d=>String(d.vehicle_no||"").replace(/\s/g,"").toUpperCase()===vehicle&&d.dispatch_date>=startDate&&d.dispatch_date<=cutoff.date);
    return {...x,packer:x.packer_code==="P1"?"Packer 1":x.packer_code==="P2"?"Packer 2":"Packer 3",counter:x.counter_no,truck:x.vehicle_number,shiftCode:x.shift_code,start,end,duration:x.duration_seconds,dispatchLines:match,dispatchStatus:match.length?"Matched":(x.business_date===today()?"Pending Invoice":"Missing Invoice"),invoiceWindowHours:cutoff.hours,invoiceCutoffDate:cutoff.date,importKey:x.import_key};
   }));
  }catch(dispatchError){setNotice("Sessions loaded, but dispatch matching failed: "+dispatchError.message);}
 }
 async function fetchDispatchDateRange(from,to){
   const dates=[];const d=new Date(from+"T00:00:00"),last=new Date(to+"T00:00:00");
   for(;d<=last;d.setDate(d.getDate()+1))dates.push(isoLocalDate(d));
   const all=[];
   for(const day of dates){const {data,error}=await supabase.rpc("get_pp_dispatch_matches",{p_date_from:day,p_date_to:day});if(error)throw error;all.push(...(data||[]));}
   return all;
  }
  async function loadPackerReport(){
   if(!packerFrom||!packerTo||packerFrom>packerTo){setNotice("Select a valid Packer Report date range.");return;}
   setPackerReportBusy(true);setNotice("");
   try{
    const {data,error}=await supabase.from("pp_bag_counting_sessions").select("*").gte("business_date",packerFrom).lte("business_date",packerTo).order("loading_start");
    if(error)throw error;
    const allSessions=data||[];
    const sessions=allSessions.filter(x=>(packerShift==="ALL"||x.shift_code===packerShift)&&(packerFilter==="ALL"||x.packer_code===packerFilter));
    const latestCutoff=allSessions.reduce((max,x)=>{const end=invoiceCutoffDate(new Date(x.loading_start),new Date(x.loading_end)).date;return end>max?end:max;},packerTo);
    const dispatch=await fetchDispatchDateRange(packerFrom,latestCutoff);
    const normVehicle=v=>String(v||"").replace(/\s/g,"").toUpperCase();
    const sessionWindow=x=>{const start=new Date(x.loading_start),end=new Date(x.loading_end);return {vehicle:normVehicle(x.vehicle_number),from:isoLocalDate(start),to:invoiceCutoffDate(start,end).date};};
    const windows=allSessions.map(x=>({...sessionWindow(x),session:x}));
    const report=sessions.map(x=>{
     const w=sessionWindow(x),lines=dispatch.filter(d=>normVehicle(d.vehicle_no)===w.vehicle&&d.dispatch_date>=w.from&&d.dispatch_date<=w.to);
     const status=lines.length?"Matched":(x.business_date===today()?"Pending Invoice":"Missing Invoice");
     return {...x,dispatchLines:lines,dispatchQty:lines.reduce((n,d)=>n+Number(d.qty||0),0),dispatchInvoices:[...new Set(lines.map(d=>d.invoice_no).filter(Boolean))],dispatchStatus:status,packerLabel:x.packer_code==="P1"?"Packer 1":x.packer_code==="P2"?"Packer 2":"Packer 3"};
    });
    const unmatched=dispatch.filter(d=>!windows.some(w=>normVehicle(d.vehicle_no)===w.vehicle&&d.dispatch_date>=w.from&&d.dispatch_date<=w.to));
    setPackerUnmatchedDispatch(unmatched);setPackerReportRows(report);setPackerReportLoaded(true);
    setNotice("Packer report generated: "+report.length+" loading sessions; "+unmatched.length+" unmatched dispatch invoice lines.");
   }catch(err){setNotice("Unable to generate Packer Report: "+err.message);}
   finally{setPackerReportBusy(false);}
  }
  const packerSummary=["P1","P2","P3"].map(code=>{
   const list=packerReportRows.filter(x=>x.packer_code===code),seconds=list.reduce((n,x)=>n+Number(x.duration_seconds||0),0);
   return {code,label:code==="P1"?"Packer 1":code==="P2"?"Packer 2":"Packer 3",trucks:list.length,matched:list.filter(x=>x.dispatchLines.length).length,pending:list.filter(x=>x.dispatchStatus==="Pending Invoice").length,missing:list.filter(x=>x.dispatchStatus==="Missing Invoice").length,dispatchQty:list.reduce((n,x)=>n+Number(x.dispatchQty||0),0),loadingSeconds:seconds,avgSeconds:list.length?seconds/list.length:0};
  });
  const packerDetailRows=packerReportRows.filter(x=>{
   const q=packerSearch.trim().toLowerCase();return !q||[x.packerLabel,x.counter_no,x.shift_code,x.vehicle_number,x.business_date,...x.dispatchLines.map(d=>d.invoice_no),...x.dispatchLines.map(d=>d.product_code)].some(v=>String(v??"").toLowerCase().includes(q));
  });
  function durationText(seconds){const n=Math.max(0,Math.round(Number(seconds||0))),h=Math.floor(n/3600),m=Math.floor((n%3600)/60),sec=n%60;return [h,m,sec].map(v=>String(v).padStart(2,"0")).join(":");}
  function downloadPackerReport(){
   if(!packerReportRows.length){setNotice("No Packer Report records to download.");return;}
   const summary=packerSummary.map(x=>({"Packer":x.label,"Loading Sessions / Trucks":x.trucks,"Matched Sessions":x.matched,"Pending Invoice":x.pending,"Missing Invoice":x.missing,"Dispatch Quantity (MT)":Number(x.dispatchQty.toFixed(3)),"Total Loading Duration":durationText(x.loadingSeconds),"Average Loading Duration":durationText(x.avgSeconds)}));
   const details=packerDetailRows.map((x,i)=>({"S.No.":i+1,"Business Date":x.business_date,"Shift":x.shift_code,"Packer":x.packerLabel,"Counter":x.counter_no,"Vehicle":x.vehicle_number,"Loading Start":new Date(x.loading_start).toLocaleString(),"Loading End":new Date(x.loading_end).toLocaleString(),"Duration":durationText(x.duration_seconds),"Dispatch Status":x.dispatchStatus,"Invoice Numbers":x.dispatchInvoices.join(", "),"Products":[...new Set(x.dispatchLines.map(d=>d.product_code))].join(", "),"Dispatch Quantity (MT)":Number(x.dispatchQty.toFixed(3))}));
   const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(summary),"Packer Summary");XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(details),"Loading Details");
   XLSX.writeFile(wb,"Packing-Plant-Packer-Report-"+packerFrom+"-to-"+packerTo+".xlsx");
  }
  async function previewBagFile(file){
  setBagFile(file);setBagFileName(file?.name||"");setBagPreview([]);setBagMatches([]);setNotice("");
  if(!file)return;
  try{
   const wb=XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:true});
   const sheet=wb.Sheets[wb.SheetNames[0]];
   const grid=XLSX.utils.sheet_to_json(sheet,{header:1,defval:"",raw:false});
   const headerIndex=grid.findIndex(row=>{const h=row.map(normHeader);return h.some(x=>x==="counterno"||x==="counter")&&h.some(x=>x==="truckno"||x==="trucknumber"||x==="vehicleno")&&h.some(x=>x==="starttime")&&h.some(x=>x==="endtime");});
   if(headerIndex<0)throw new Error("Could not find headings Counter No, Truck No, Start Time and End Time.");
   const headers=grid[headerIndex].map(normHeader);
   const find=(...keys)=>headers.findIndex(h=>keys.includes(h));
   const ix={counter:find("counterno","counter"),vehicle:find("truckno","trucknumber","vehicleno"),start:find("starttime"),end:find("endtime"),duration:find("difftime","duration")};
   const rows=grid.slice(headerIndex+1).filter(r=>r.some(v=>String(v??"").trim())).map((r,i)=>{
    const counter=Number(String(r[ix.counter]??"").trim());
    const truck=String(r[ix.vehicle]??"").trim().toUpperCase();
    const start=parseBagDateTime(r[ix.start],bagReportFrom);
    const end=parseBagDateTime(r[ix.end],start?isoLocalDate(start):bagReportFrom);
    const invalid=[];
    if(![1,2,3,4].includes(counter))invalid.push("Invalid counter");
    if(!truck||/X{4,}/i.test(truck))invalid.push("Truck number missing/invalid");
    if(!start||!end||end<start)invalid.push("Start/end time missing or invalid");
    if(start&&(isoLocalDate(start)<bagReportFrom||isoLocalDate(start)>bagReportTo))invalid.push("Loading start date is outside selected upload range");
    if(start&&end&&secondsBetween(start,end)>12*3600)invalid.push("Loading duration exceeds 12 hours");
    if(invalid.length)return {rowNo:headerIndex+i+2,counter,truck,start,end,invalid,valid:false};
    const shiftCode=shiftForStart(start);
    const business=new Date(start.getFullYear(),start.getMonth(),start.getDate());
    if(shiftCode==="C"&&start.getHours()<6)business.setDate(business.getDate()-1);
    const duration=secondsBetween(start,end);
    return {rowNo:headerIndex+i+2,counter,truck,start,end,shiftCode,businessDate:isoLocalDate(business),duration,packer:packerForCounter(counter),importKey:[isoLocalDate(start),counter,truck,isoLocalDateTime(start),isoLocalDateTime(end)].join("|"),valid:true,invalid:[]};
   });
   const seenImportKeys=new Set();
   const checkedRows=rows.map(x=>{
    if(!x.valid)return x;
    if(seenImportKeys.has(x.importKey))return {...x,valid:false,invalid:[...(x.invalid||[]),"Duplicate loading session in Excel — skipped"]};
    seenImportKeys.add(x.importKey);return x;
   });
   setBagPreview(checkedRows);
   const good=checkedRows.filter(x=>x.valid).length;
   const duplicates=checkedRows.filter(x=>(x.invalid||[]).some(v=>v.startsWith("Duplicate loading session"))).length;
   setNotice("Preview ready: "+checkedRows.length+" rows; "+good+" valid loading sessions; "+duplicates+" duplicate rows; "+(checkedRows.length-good)+" rows will be skipped.");
  }catch(err){setNotice("Bag Counting Excel could not be read: "+err.message);}
 }
 async function importBagCounting(){
  if(!canEdit||!bagPreview.some(x=>x.valid))return;
  setBagBusy(true);setNotice("");
  try{
   const valid=bagPreview.filter(x=>x.valid);
   const uniqueValid=[...new Map(valid.map(x=>[x.importKey,x])).values()];
   const duplicateCount=valid.length-uniqueValid.length;
   if(!bagReportFrom||!bagReportTo||bagReportFrom>bagReportTo)throw new Error("Select a valid From Date and To Date before importing.");
   const payload=uniqueValid.map(x=>({import_key:x.importKey,source_report_date:isoLocalDate(x.start),business_date:x.businessDate,shift_code:x.shiftCode,counter_no:x.counter,packer_code:x.packer,vehicle_number:x.truck,loading_start:x.start.toISOString(),loading_end:x.end.toISOString(),duration_seconds:x.duration,source_file_name:bagFileName,imported_by:session.user.id}));
   if(!payload.length)throw new Error("No unique valid loading sessions remain to import.");
   const {error:saveError}=await supabase.from("pp_bag_counting_sessions").upsert(payload,{onConflict:"import_key"});
   if(saveError)throw saveError;
   await loadBagSessions();
   setNotice("Imported "+uniqueValid.length+" unique bag-counting sessions. "+(duplicateCount?"Skipped "+duplicateCount+" duplicate rows. ":"")+"Dispatch reconciliation refreshed. Sessions without an eligible invoice remain Pending Invoice.");
  }catch(err){setNotice("Bag Counting import failed: "+err.message);}
  finally{setBagBusy(false);}
 }
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
  <div className="panel"><div className="mapping-grid pp-register-grid"><label>Business date<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>Shift<select value={shift} onChange={e=>setShift(e.target.value)}><option value="A">A Shift · 06:00–14:00</option><option value="B">B Shift · 14:00–22:00</option><option value="C">C Shift · 22:00–06:00</option>{(section==="Attendance"||section==="Attendance Report")&&<option value="G">G Shift · 08:00–17:00</option>}</select></label><div className="pp-kpi"><span>Shift business date</span><b>{date}</b></div></div></div>
  <div className="pp-register-tabs">{["Truck Loading","Bag Counting Upload","Packer Reports","Attendance","Attendance Report","Employee Master","Holiday Master","Stoppage Reason Master"].map(x=><button key={x} className={section===x?"primary":"secondary"} onClick={()=>setSection(x)}>{x}</button>)}</div>
  {section==="Truck Loading"&&<><div className="panel"><h3>Individual truck loading entry</h3><div className="mapping-grid pp-register-grid"><label>Vehicle number<input value={vehicle} onChange={e=>setVehicle(e.target.value)} placeholder="Vehicle number" disabled={!canEdit}/></label><label>Product<select value={product} onChange={e=>setProduct(e.target.value)} disabled={!canEdit}><option>PPC</option><option>OPC</option></select></label><label>Quantity (MT)<input type="number" min="0" step="0.01" value={qty} onChange={e=>setQty(e.target.value)} disabled={!canEdit}/></label><label>Remarks (optional)<input value={remarks} onChange={e=>setRemarks(e.target.value)} disabled={!canEdit}/></label></div><button className="primary" onClick={addTruck} disabled={!canEdit||saving}>{saving?"Saving…":"Save truck entry"}</button></div>
   <div className="stats pp-truck-stats"><div className="stat"><span>Trucks</span><b>{rows.length}</b></div><div className="stat"><span>Total quantity (MT)</span><b>{money(total)}</b></div><div className="stat"><span>PPC (MT)</span><b>{money(ppc)}</b></div><div className="stat"><span>OPC (MT)</span><b>{money(opc)}</b></div></div>
   <div className="panel"><h3>Truck loading register</h3><div className="table-scroll"><table><thead><tr><th>Vehicle</th><th>Product</th><th>Quantity MT</th><th>Remarks</th><th>Recorded</th></tr></thead><tbody>{rows.map(x=><tr key={x.id}><td>{x.vehicle_number}</td><td>{x.product_code}</td><td className="num">{money(x.quantity_mt)}</td><td>{x.remarks||"—"}</td><td>{new Date(x.created_at).toLocaleString()}</td></tr>)}{!rows.length&&<tr><td colSpan="5" className="muted">No truck entries for this shift.</td></tr>}</tbody></table></div></div></>}
  
  {section==="Bag Counting Upload"&&<><div className="panel"><h3>Cement Bag Counting System · Excel Import</h3><p className="footnote">Select the report date range covered by the Excel file. Rows outside this range are rejected. Counter 1 = Packer 1, Counter 2 = Packer 2, Counters 3 and 4 = Packer 3. Shift is suggested from loading start time.</p><div className="mapping-grid pp-register-grid"><label>From Date<input type="date" value={bagReportFrom} max={today()} onChange={e=>setBagReportFrom(e.target.value)} disabled={!canEdit}/></label><label>To Date<input type="date" value={bagReportTo} min={bagReportFrom} max={today()} onChange={e=>setBagReportTo(e.target.value)} disabled={!canEdit}/></label><label>Excel file (.xlsx / .xls)<input type="file" accept=".xlsx,.xls" onChange={e=>previewBagFile(e.target.files?.[0]||null)} disabled={!canEdit}/></label></div>{bagFileName&&<p className="footnote">Selected file: {bagFileName}</p>}{bagPreview.length>0&&<><div className="stats pp-truck-stats"><div className="stat"><span>Rows</span><b>{bagPreview.length}</b></div><div className="stat"><span>Valid sessions</span><b>{bagPreview.filter(x=>x.valid).length}</b></div><div className="stat"><span>Invalid rows</span><b>{bagPreview.filter(x=>!x.valid).length}</b></div></div><div className="table-scroll"><table><thead><tr><th>Excel Row</th><th>Counter</th><th>Packer</th><th>Vehicle</th><th>Shift</th><th>Business Date</th><th>Start</th><th>End</th><th>Duration</th><th>Status</th></tr></thead><tbody>{bagPreview.map(x=><tr key={x.rowNo}><td>{x.rowNo}</td><td>{x.counter||"—"}</td><td>{x.packer||"—"}</td><td>{x.truck||"—"}</td><td>{x.shiftCode||"—"}</td><td>{x.businessDate||"—"}</td><td>{x.start?x.start.toLocaleString():"—"}</td><td>{x.end?x.end.toLocaleString():"—"}</td><td>{x.duration!=null?new Date(x.duration*1000).toISOString().slice(11,19):"—"}</td><td>{x.valid?"Ready":x.invalid.join(", ")}</td></tr>)}</tbody></table></div><button className="primary" onClick={importBagCounting} disabled={!canEdit||bagBusy||!bagPreview.some(x=>x.valid)}>{bagBusy?"Importing…":"Import & Reconcile with Dispatch"}</button></>}</div>
   {bagMatches.length>0&&<div className="panel"><h3>Dispatch reconciliation · Imported sessions</h3><div className="table-scroll"><table><thead><tr><th>Packer</th><th>Counter</th><th>Shift</th><th>Vehicle</th><th>Loading Start</th><th>Loading End</th><th>Duration</th><th>Dispatch Match</th><th>Invoice / Product / Qty</th></tr></thead><tbody>{bagMatches.map((x,i)=><tr key={x.importKey}><td>{x.packer}</td><td>{x.counter}</td><td>{x.shiftCode}</td><td>{x.truck}</td><td>{x.start.toLocaleString()}</td><td>{x.end.toLocaleString()}</td><td>{new Date(x.duration*1000).toISOString().slice(11,19)}</td><td>{x.dispatchStatus}</td><td>{x.dispatchLines.length?x.dispatchLines.map(d=>d.invoice_no+" · "+d.product_code+" · "+money(d.qty)+" MT").join("; "):(x.dispatchStatus==="Pending Invoice"?"Awaiting invoice upload · "+x.invoiceWindowHours+"h window through "+x.invoiceCutoffDate:"Invoice missing for completed loading")}</td></tr>)}</tbody></table></div></div>}
   <div className="panel"><h3>Imported Bag Counting sessions · {bagReportFrom} to {bagReportTo}</h3><div className="table-scroll"><table><thead><tr><th>Packer</th><th>Counter</th><th>Shift</th><th>Vehicle</th><th>Start</th><th>End</th><th>Duration</th></tr></thead><tbody>{bagSessions.map(x=><tr key={x.id}><td>{x.packer_code==="P1"?"Packer 1":x.packer_code==="P2"?"Packer 2":"Packer 3"}</td><td>{x.counter_no}</td><td>{x.shift_code}</td><td>{x.vehicle_number}</td><td>{new Date(x.loading_start).toLocaleString()}</td><td>{new Date(x.loading_end).toLocaleString()}</td><td>{new Date(x.duration_seconds*1000).toISOString().slice(11,19)}</td></tr>)}{!bagSessions.length&&<tr><td colSpan="7" className="muted">No imported sessions for this Packing Plant business date.</td></tr>}</tbody></table></div></div></>}
  {section==="Packer Reports"&&<><div className="panel"><h3>Packing Plant · Packer Performance Report</h3><p className="footnote">Calculated from imported Bag Counting sessions and matched Dispatch invoice lines. Dispatch quantity is summed from matched invoice/product lines; pending invoices are shown separately.</p><div className="mapping-grid pp-register-grid">
    <label>From Date<input type="date" value={packerFrom} max={today()} onChange={e=>setPackerFrom(e.target.value)}/></label><label>To Date<input type="date" value={packerTo} max={today()} onChange={e=>setPackerTo(e.target.value)}/></label>
    <label>Shift<select value={packerShift} onChange={e=>setPackerShift(e.target.value)}><option value="ALL">All Shifts</option><option value="A">A Shift</option><option value="B">B Shift</option><option value="C">C Shift</option></select></label>
    <label>Packer<select value={packerFilter} onChange={e=>setPackerFilter(e.target.value)}><option value="ALL">All Packers</option><option value="P1">Packer 1</option><option value="P2">Packer 2</option><option value="P3">Packer 3</option></select></label>
   </div><div className="button-row"><button className="primary" onClick={loadPackerReport} disabled={packerReportBusy}>{packerReportBusy?"Generating…":"Generate Report"}</button><button className="secondary" onClick={()=>{setPackerFrom(today().slice(0,7)+"-01");setPackerTo(today());setPackerShift("ALL");setPackerFilter("ALL");setPackerSearch("");setPackerReportRows([]);setPackerUnmatchedDispatch([]);setPackerReportLoaded(false);}}>Clear Filters</button>{packerReportLoaded&&<button className="secondary" onClick={downloadPackerReport}>Download Excel</button>}</div></div>
    {packerReportLoaded&&<><div className="stats pp-truck-stats"><div className="stat"><span>Total loading sessions</span><b>{packerReportRows.length}</b></div><div className="stat"><span>Matched sessions</span><b>{packerReportRows.filter(x=>x.dispatchLines.length).length}</b></div><div className="stat"><span>Pending invoices (today only)</span><b>{packerReportRows.filter(x=>x.dispatchStatus==="Pending Invoice").length}</b></div><div className="stat"><span>Missing invoices (past dates)</span><b>{packerReportRows.filter(x=>x.dispatchStatus==="Missing Invoice").length}</b></div><div className="stat"><span>Dispatch quantity (MT)</span><b>{money(packerReportRows.reduce((n,x)=>n+Number(x.dispatchQty||0),0))}</b></div></div>
    <div className="panel"><h3>Packer-wise summary</h3><div className="table-scroll"><table><thead><tr><th>Packer</th><th>Loading Sessions / Trucks</th><th>Matched</th><th>Pending Invoice</th><th>Missing Invoice</th><th>Dispatch Qty (MT)</th><th>Total Loading Duration</th><th>Average Duration</th></tr></thead><tbody>{packerSummary.filter(x=>packerFilter==="ALL"||x.code===packerFilter).map(x=><tr key={x.code}><td>{x.label}</td><td>{x.trucks}</td><td>{x.matched}</td><td>{x.pending}</td><td>{x.missing}</td><td className="num">{money(x.dispatchQty)}</td><td>{durationText(x.loadingSeconds)}</td><td>{durationText(x.avgSeconds)}</td></tr>)}</tbody></table></div></div>
    <div className="panel"><h3>Shift-wise and counter-wise details</h3><div className="table-scroll"><table><thead><tr><th>Packer</th><th>Counter</th><th>Shift</th><th>Sessions</th><th>Matched</th><th>Dispatch Qty (MT)</th><th>Loading Duration</th></tr></thead><tbody>{[...new Set(packerReportRows.map(x=>x.packer_code+"|"+x.counter_no+"|"+x.shift_code))].sort().map(k=>{const [pc,cn,sh]=k.split("|"),list=packerReportRows.filter(x=>x.packer_code===pc&&String(x.counter_no)===cn&&x.shift_code===sh);return <tr key={k}><td>{pc==="P1"?"Packer 1":pc==="P2"?"Packer 2":"Packer 3"}</td><td>{cn}</td><td>{sh}</td><td>{list.length}</td><td>{list.filter(x=>x.dispatchLines.length).length}</td><td className="num">{money(list.reduce((n,x)=>n+Number(x.dispatchQty||0),0))}</td><td>{durationText(list.reduce((n,x)=>n+Number(x.duration_seconds||0),0))}</td></tr>;})}</tbody></table></div></div>
    <div className="panel"><h3>Unmatched Dispatch Invoices</h3><p className="footnote">Dispatch invoice lines in the selected date range that do not match any Bag Counting truck session within its permitted invoice window.</p><div className="table-scroll"><table><thead><tr><th>S.No.</th><th>Dispatch Date</th><th>Invoice No.</th><th>Vehicle</th><th>Product</th><th>Qty (MT)</th><th>Packslip</th><th>Customer</th></tr></thead><tbody>{packerUnmatchedDispatch.map((d,i)=><tr key={String(d.invoice_no)+"-"+String(d.packslip_no)+"-"+i}><td>{i+1}</td><td>{d.dispatch_date}</td><td>{d.invoice_no}</td><td>{d.vehicle_no}</td><td>{d.product_code}</td><td className="num">{money(d.qty)}</td><td>{d.packslip_no||"—"}</td><td>{d.customer_name||"—"}</td></tr>)}{!packerUnmatchedDispatch.length&&<tr><td colSpan="8" className="muted">No unmatched dispatch invoice lines.</td></tr>}</tbody></table></div></div>
    <div className="panel"><h3>Truck loading details</h3><div className="mapping-grid pp-register-grid"><label>Search date / packer / counter / shift / vehicle / invoice<input value={packerSearch} onChange={e=>setPackerSearch(e.target.value)} placeholder="Search report details…"/></label></div><div className="table-scroll"><table><thead><tr><th>S.No.</th><th>Date</th><th>Packer</th><th>Counter</th><th>Shift</th><th>Vehicle</th><th>Start</th><th>End</th><th>Duration</th><th>Dispatch Match</th><th>Invoice / Product / Qty</th></tr></thead><tbody>{packerDetailRows.map((x,i)=><tr key={x.id}><td>{i+1}</td><td>{x.business_date}</td><td>{x.packerLabel}</td><td>{x.counter_no}</td><td>{x.shift_code}</td><td>{x.vehicle_number}</td><td>{new Date(x.loading_start).toLocaleString()}</td><td>{new Date(x.loading_end).toLocaleString()}</td><td>{durationText(x.duration_seconds)}</td><td>{x.dispatchStatus}</td><td>{x.dispatchLines.length?x.dispatchLines.map(d=>d.invoice_no+" · "+d.product_code+" · "+money(d.qty)+" MT").join("; "):(x.dispatchStatus==="Pending Invoice"?"Invoice awaited for current date":"Invoice missing for completed loading")}</td></tr>)}{!packerDetailRows.length&&<tr><td colSpan="11" className="muted">No loading details match the search.</td></tr>}</tbody></table></div></div></>}
   </>}
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
