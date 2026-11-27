import React,{useEffect,useMemo,useRef,useState} from "react";
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
 const [rows,setRows]=useState([]);
 const [employees,setEmployees]=useState([]),[name,setName]=useState(""),[code,setCode]=useState(""),[category,setCategory]=useState(STAFF[0]);
 const [employeeFile,setEmployeeFile]=useState(""),[employeeImportRows,setEmployeeImportRows]=useState([]),[employeeImportBusy,setEmployeeImportBusy]=useState(false);
 const [attendance,setAttendance]=useState({}),[attendanceRows,setAttendanceRows]=useState([]),[employeeSearch,setEmployeeSearch]=useState(""),[attendanceFile,setAttendanceFile]=useState(""),[attendanceImportRows,setAttendanceImportRows]=useState([]),[attendanceImportBusy,setAttendanceImportBusy]=useState(false),[holiday,setHoliday]=useState(null),[holidayDate,setHolidayDate]=useState(""),[holidayText,setHolidayText]=useState("");
 const [reasons,setReasons]=useState([]),[reasonCategory,setReasonCategory]=useState(CATS[0]),[reason,setReason]=useState(""),[editReason,setEditReason]=useState(null);
 const [loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[notice,setNotice]=useState("");
 const [reportFrom,setReportFrom]=useState(today().slice(0,7)+"-01"),[reportTo,setReportTo]=useState(today()),[reportShift,setReportShift]=useState("ALL"),[reportSearch,setReportSearch]=useState(""),[attendanceReportRows,setAttendanceReportRows]=useState([]),[reportBusy,setReportBusy]=useState(false),[reportLoaded,setReportLoaded]=useState(false);
 const [bagReportFrom,setBagReportFrom]=useState(today().slice(0,7)+"-01"),[bagReportTo,setBagReportTo]=useState(today()),[bagFile,setBagFile]=useState(null),[bagFileName,setBagFileName]=useState(""),[bagPreview,setBagPreview]=useState([]),[bagSessions,setBagSessions]=useState([]),[bagMatches,setBagMatches]=useState([]),[bagBusy,setBagBusy]=useState(false);
 const [packslipFile,setPackslipFile]=useState(null),[packslipFileName,setPackslipFileName]=useState(""),[packslipPreview,setPackslipPreview]=useState([]),[packslipBusy,setPackslipBusy]=useState(false),[packslipImported,setPackslipImported]=useState(0);
 const [packerFrom,setPackerFrom]=useState(today().slice(0,7)+"-01"),[packerTo,setPackerTo]=useState(today()),[packerShift,setPackerShift]=useState("ALL"),[packerFilter,setPackerFilter]=useState("ALL"),[packerReportRows,setPackerReportRows]=useState([]),[packerBulkRows,setPackerBulkRows]=useState([]),[packerUnmatchedDispatch,setPackerUnmatchedDispatch]=useState([]),[packerUnmatchedPackslips,setPackerUnmatchedPackslips]=useState([]),[packerReportLoaded,setPackerReportLoaded]=useState(false),[packerReportBusy,setPackerReportBusy]=useState(false),[packerSearch,setPackerSearch]=useState("");
 const employeeSearchInput=useRef(null);
 const admin=profile?.role==="admin",canEdit=admin||profile?.role==="uploader";
 async function load(){
  setLoading(true);setNotice("");
  try{
   const [dispatch,e,h,r]=await Promise.all([
    supabase.rpc("get_pp_dispatch_matches",{p_date_from:date,p_date_to:date}),
    supabase.from("pp_employees").select("*").eq("is_active",true).order("full_name"),
    supabase.from("pp_holidays").select("*").eq("holiday_date",date).eq("is_active",true).maybeSingle(),
    supabase.from("pp_stoppage_reasons").select("*").order("category").order("reason")
   ]);
   for(const x of [dispatch,e,h,r])if(x.error)throw x.error;
   const truckGroups=new Map();
   (dispatch.data||[]).forEach(x=>{
    const code=String(x.product_code||"").trim().toUpperCase();
    const family=code.startsWith("OPC")?"OPC":code.startsWith("PPC")?"PPC":"";
    const kind=code==="OPC53B"||code==="PPCB"?"Bulk":code==="OPC53H"||code==="PPCH"||code==="PPCL"?"Bag":"";
    const vehicle=String(x.vehicle_no||"").trim().toUpperCase();
    if(!family||!kind||!vehicle)return;
    const product=family+" "+kind,key=vehicle+"|"+code;
    const row=truckGroups.get(key)||{id:key,dispatch_date:x.dispatch_date,vehicle_number:vehicle,product_code:product,product_family:family,dispatch_kind:kind,source_product_codes:new Set(),invoice_numbers:new Set(),quantity_mt:0};
    row.source_product_codes.add(code);
    if(x.invoice_no)row.invoice_numbers.add(String(x.invoice_no));
    row.quantity_mt+=Number(x.qty||0);
    truckGroups.set(key,row);
   });
   const truckRows=[...truckGroups.values()].map(x=>({...x,source_product_codes:[...x.source_product_codes].sort().join(", "),invoice_numbers:[...x.invoice_numbers].sort().join(", "),quantity_mt:Number(x.quantity_mt.toFixed(3))})).sort((a,b)=>a.vehicle_number.localeCompare(b.vehicle_number)||a.product_code.localeCompare(b.product_code));
   setRows(truckRows);setEmployees(e.data||[]);setHoliday(h.data||null);setReasons(r.data||[]);
   const {data:a,error:ae}=await supabase.from("pp_attendance").select("id,employee_id,attendance_status,duty_classification").eq("business_date",date).eq("shift_code",shift);
   if(ae)throw ae;setAttendanceRows(a||[]);const map={};for(const x of a||[])map[x.employee_id]=x.attendance_status==="present";setAttendance(map);
  }catch(err){setNotice("Unable to load register: "+err.message);}
  finally{setLoading(false);}
 }
 useEffect(()=>{load();},[date,shift]);
 useEffect(()=>{if(section==="Bag Counting Upload")loadBagSessions();},[section,bagReportFrom,bagReportTo]);
 
 async function loadBagSessions(){
  if(!bagReportFrom||!bagReportTo||bagReportFrom>bagReportTo){setNotice("Select a valid Bag Counting date range.");return;}
  const {data,error}=await supabase.from("pp_bag_counting_sessions").select("*").gte("business_date",bagReportFrom).lte("business_date",bagReportTo).order("loading_start");
  if(error){setNotice("Unable to load bag-counting sessions: "+error.message);return;}
  setBagSessions((data||[]).filter(x=>Number(x.target_bags)>0));
  setBagMatches([]);
 }
 async function loadPackerReport(){
  if(!packerFrom||!packerTo||packerFrom>packerTo){setNotice("Select a valid Packer Report date range.");return;}
  setPackerReportBusy(true);setNotice("");
  try{
   const {data,error}=await supabase.from("pp_bag_counting_sessions").select("*").gte("business_date",packerFrom).lte("business_date",packerTo).order("loading_start");
   if(error)throw error;
   const sessions=(data||[]).filter(x=>(packerShift==="ALL"||x.shift_code===packerShift)&&(packerFilter==="ALL"||x.packer_code===packerFilter)).map(x=>({...x,packerLabel:x.packer_code==="P1"?"Packer 1":x.packer_code==="P2"?"Packer 2":"Packer 3"}));
   setPackerReportRows(sessions);setPackerBulkRows([]);setPackerUnmatchedDispatch([]);setPackerUnmatchedPackslips([]);setPackerReportLoaded(true);
   setNotice("Packer summary generated from "+sessions.length+" uploaded bag-counting sessions. No dispatch, invoice, packslip or weighbridge matching is used.");
  }catch(err){setNotice("Unable to generate Packer Report: "+err.message);}finally{setPackerReportBusy(false);}
 }
 const truckQuantitySummary=(list)=>{
  const trucks=new Set(list.map(x=>String(x.vehicle_number||"").trim().toUpperCase()).filter(Boolean));
  const out={trucks:trucks.size,opcYellow:0,opcWhite:0,ppcYellow:0,ppcWhite:0,ppcLaminated:0,quantityMt:0};
  list.forEach(x=>{
   const grade=String(x.grade||"").toUpperCase(),bagType=String(x.bag_type||"").toUpperCase(),bags=Number(x.target_bags);
   if(!Number.isFinite(bags)||bags<=0||!["OPC","PPC"].includes(grade)||!["YELLOW","WHITE","LAMINATED"].includes(bagType)||(grade==="OPC"&&bagType==="LAMINATED"))return;
   const mt=bags/20;
   out.quantityMt+=mt;
   if(grade==="OPC"&&bagType==="YELLOW")out.opcYellow+=mt;
   if(grade==="OPC"&&bagType==="WHITE")out.opcWhite+=mt;
   if(grade==="PPC"&&bagType==="YELLOW")out.ppcYellow+=mt;
   if(grade==="PPC"&&bagType==="WHITE")out.ppcWhite+=mt;
   if(grade==="PPC"&&bagType==="LAMINATED")out.ppcLaminated+=mt;
  });
  return out;
 };
 const packerSummary=["P1","P2","P3"].map(code=>{
  const list=packerReportRows.filter(x=>x.packer_code===code);
  return {code,label:code==="P1"?"Packer 1":code==="P2"?"Packer 2":"Packer 3",...truckQuantitySummary(list)};
 });
 const packerShiftSummary=[...new Set(packerReportRows.map(x=>x.packer_code+"|"+x.shift_code))].sort().map(k=>{
  const [pc,sh]=k.split("|"),list=packerReportRows.filter(x=>x.packer_code===pc&&x.shift_code===sh);
  return {packer:pc==="P1"?"Packer 1":pc==="P2"?"Packer 2":"Packer 3",shift:sh,...truckQuantitySummary(list)};
 });
 function durationText(seconds){const n=Math.max(0,Math.round(Number(seconds||0))),h=Math.floor(n/3600),m=Math.floor((n%3600)/60),sec=n%60;return [h,m,sec].map(v=>String(v).padStart(2,"0")).join(":");}
 function downloadPackerReport(){
  if(!packerReportRows.length){setNotice("No Packer Report records to download.");return;}
  const columns=x=>({"No. of Trucks Loaded":x.trucks,"OPC Yellow (MT)":x.opcYellow,"OPC White (MT)":x.opcWhite,"PPC Yellow (MT)":x.ppcYellow,"PPC White (MT)":x.ppcWhite,"PPC Laminated (MT)":x.ppcLaminated,"Total Quantity (MT)":x.quantityMt});
  const summary=packerSummary.map(x=>({"Packer":x.label,...columns(x)}));
  const shifts=packerShiftSummary.map(x=>({"Packer":x.packer,"Shift":x.shift,...columns(x)}));
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(summary),"Packer Summary");XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(shifts),"Packer Shift Summary");
  XLSX.writeFile(wb,"Packing-Plant-Packer-Summary-"+packerFrom+"-to-"+packerTo+".xlsx");
 }

  function parsePackslipDate(value){
   if(value instanceof Date&&!Number.isNaN(value.getTime()))return isoLocalDate(value);
   const raw=String(value??"").trim();if(!raw)return "";
   let m=raw.match(/^(\\d{4})[/-](\\d{1,2})[/-](\\d{1,2})/);
   if(m)return m[1]+"-"+String(m[2]).padStart(2,"0")+"-"+String(m[3]).padStart(2,"0");
   m=raw.match(/^(\\d{1,2})[/-](\\d{1,2})[/-](\\d{4})/);
   if(m)return m[3]+"-"+String(m[1]).padStart(2,"0")+"-"+String(m[2]).padStart(2,"0");
   const d=new Date(raw);return Number.isNaN(d.getTime())?"":isoLocalDate(d);
  }
  function parsePackslipTimestamp(value){
   if(value instanceof Date&&!Number.isNaN(value.getTime()))return isoLocalDateTime(value);
   const raw=String(value??"").trim();if(!raw)return "";
   const d=new Date(raw);if(!Number.isNaN(d.getTime()))return isoLocalDateTime(d);
   const m=raw.match(/^(\\d{1,2})[/-](\\d{1,2})[/-](\\d{4})\\s+(\\d{1,2}):(\\d{2})(?::(\\d{2}))?\\s*(AM|PM)?$/i);
   if(!m)return "";
   let h=Number(m[4]);const ap=(m[7]||"").toUpperCase();if(ap==="PM"&&h<12)h+=12;if(ap==="AM"&&h===12)h=0;
   return m[3]+"-"+String(m[1]).padStart(2,"0")+"-"+String(m[2]).padStart(2,"0")+"T"+String(h).padStart(2,"0")+":"+m[5]+":"+String(m[6]||"00").padStart(2,"0");
  }
  async function previewPackslipFile(file){
   setPackslipFile(file);setPackslipFileName(file?.name||"");setPackslipPreview([]);setNotice("");if(!file)return;
   try{
    const wb=XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:true});
    const ws=wb.Sheets[wb.SheetNames[0]],grid=XLSX.utils.sheet_to_json(ws,{header:1,defval:"",raw:false});
    const hi=grid.findIndex(row=>{const h=row.map(normHeader);return ["packslipdate","packslipno","itemcode","quantity","createddate","packslipshippeddate","vehicleno"].every(k=>h.includes(k));});
    if(hi<0)throw new Error("Required headings not found. Expected PackslipDate, PackslipNo, ItemCode, Quantity, CreatedDate, PackSlipShippedDate and VehicleNo.");
    const h=grid[hi].map(normHeader),ix=(...keys)=>h.findIndex(v=>keys.includes(v));
    const col={date:ix("packslipdate"),no:ix("packslipno"),item:ix("itemcode"),cust:ix("customercode"),name:ix("customername"),qty:ix("quantity"),created:ix("createddate"),shipped:ix("packslipshippeddate"),diff:ix("timedifference"),carrier:ix("carriercode"),vehicle:ix("vehicleno","vehiclenumber","vehicle"),destination:ix("destinationname"),company:ix("companycode")};
    const parsed=grid.slice(hi+1).map((r,i)=>({rowNo:hi+i+2,packslip_date:parsePackslipDate(r[col.date]),packslip_no:String(r[col.no]??"").trim(),item_code:String(r[col.item]??"").trim().toUpperCase(),customer_code:String(r[col.cust]??"").trim(),customer_name:String(r[col.name]??"").trim(),quantity:Number(String(r[col.qty]??"").replace(/,/g,"")),created_date:parsePackslipTimestamp(r[col.created]),packslip_shipped_date:parsePackslipTimestamp(r[col.shipped]),time_difference:String(r[col.diff]??"").trim(),carrier_code:String(r[col.carrier]??"").trim(),vehicle_no:String(r[col.vehicle]??"").trim().toUpperCase(),destination_name:String(r[col.destination]??"").trim(),company_code:String(r[col.company]??"ACL").trim().toUpperCase()||"ACL",source_row_number:hi+i+2,invalid:[]}))
     .filter(x=>x.packslip_no||x.item_code||x.vehicle_no);
    const seen=new Set();parsed.forEach(x=>{if(!x.packslip_no)x.invalid.push("PackslipNo missing");if(!x.packslip_date)x.invalid.push("PackslipDate invalid");if(!x.item_code)x.invalid.push("ItemCode missing");if(!Number.isFinite(x.quantity)||x.quantity<=0)x.invalid.push("Quantity invalid");if(!x.created_date)x.invalid.push("CreatedDate invalid");if(!x.vehicle_no)x.invalid.push("VehicleNo missing");const key=x.company_code+"|"+x.packslip_no;if(seen.has(key))x.invalid.push("Duplicate packslip in this file");seen.add(key);});
    setPackslipPreview(parsed);setNotice("Packslip preview: "+parsed.length+" rows; "+parsed.filter(x=>!x.invalid.length).length+" valid; "+parsed.filter(x=>x.invalid.length).length+" rows need correction.");
   }catch(err){setNotice("Packslip file could not be read: "+err.message);}
  }
  async function importPackslipFile(){
   if(!canEdit||!packslipPreview.some(x=>!x.invalid.length))return;setPackslipBusy(true);setNotice("");
   try{
    const valid=packslipPreview.filter(x=>!x.invalid.length);
    const payload=valid.map(x=>({packslip_date:x.packslip_date,packslip_no:x.packslip_no,item_code:x.item_code,customer_code:x.customer_code||null,customer_name:x.customer_name||null,quantity:x.quantity,created_date:x.created_date.replace("T"," "),packslip_shipped_date:x.packslip_shipped_date?x.packslip_shipped_date.replace("T"," "):null,time_difference:x.time_difference||null,carrier_code:x.carrier_code||null,vehicle_no:x.vehicle_no||null,destination_name:x.destination_name||null,company_code:x.company_code,source_file_name:packslipFileName,source_row_number:x.source_row_number,imported_by:session.user.id,imported_at:new Date().toISOString(),updated_at:new Date().toISOString()}));
    for(let i=0;i<payload.length;i+=500){const {error}=await supabase.from("pp_packslip_timestamps").upsert(payload.slice(i,i+500),{onConflict:"company_code,packslip_no"});if(error)throw error;}
    const skipped=packslipPreview.length-valid.length;setPackslipImported(valid.length);setPackslipPreview([]);setPackslipFile(null);setPackslipFileName("");setNotice("Uploaded "+valid.length+" packslip timestamp records. "+skipped+" invalid rows skipped. Existing company + packslip numbers were updated.");
   }catch(err){setNotice("Packslip upload failed: "+err.message);}finally{setPackslipBusy(false);}
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
   const ix={counter:find("counterno","counter"),vehicle:find("truckno","trucknumber","vehicleno"),start:find("starttime"),end:find("endtime"),duration:find("difftime","duration"),grade:find("grade"),bagType:find("bagtype","bagtypecode"),target:find("target","targetbags","targetquantity")};
   if([ix.grade,ix.bagType,ix.target].some(i=>i<0))throw new Error("Required headings not found: Grade, Bag Type and Target (number of bags).");
   const rows=grid.slice(headerIndex+1).filter(r=>r.some(v=>String(v??"").trim())).map((r,i)=>{
    const counter=Number(String(r[ix.counter]??"").trim());
    const truck=String(r[ix.vehicle]??"").trim().toUpperCase();
    const start=parseBagDateTime(r[ix.start],bagReportFrom);
    const end=parseBagDateTime(r[ix.end],start?isoLocalDate(start):bagReportFrom);
    const grade=String(r[ix.grade]??"").trim().toUpperCase();
    const bagTypeRaw=String(r[ix.bagType]??"").trim().toUpperCase();
    const bagType=bagTypeRaw.includes("LAMIN")?"LAMINATED":bagTypeRaw.includes("WHITE")?"WHITE":bagTypeRaw.includes("YELLOW")?"YELLOW":bagTypeRaw;
    const rawTarget=String(r[ix.target]??"").replace(/,/g,"").trim();
    const target=rawTarget===""?NaN:Number(rawTarget);
    const invalid=[];
    if(!["OPC","PPC"].includes(grade))invalid.push("Grade must be OPC or PPC");
    if(!["YELLOW","WHITE","LAMINATED"].includes(bagType))invalid.push("Bag Type must be Yellow, White or Laminated");
    if(grade==="OPC"&&bagType==="LAMINATED")invalid.push("Laminated bags are applicable to PPC only");
    if(!Number.isFinite(target)||target<=0)invalid.push("Target must be a positive number of bags");
    if(![1,2,3,4].includes(counter))invalid.push("Invalid counter");
    if(!truck||/X{4,}/i.test(truck))invalid.push("Truck number missing/invalid");
    if(!start||!end||end<start)invalid.push("Start/end time missing or invalid");
    if(start&&(isoLocalDate(start)<bagReportFrom||isoLocalDate(start)>bagReportTo))invalid.push("Loading start date is outside selected upload range");
    if(start&&end&&secondsBetween(start,end)>12*3600)invalid.push("Loading duration exceeds 12 hours");
    if(invalid.length)return {rowNo:headerIndex+i+2,counter,truck,start,end,grade,bagType,target,invalid,valid:false};
    const shiftCode=shiftForStart(start);
    const business=new Date(start.getFullYear(),start.getMonth(),start.getDate());
    if(shiftCode==="C"&&start.getHours()<6)business.setDate(business.getDate()-1);
    const duration=secondsBetween(start,end);
    return {rowNo:headerIndex+i+2,counter,truck,start,end,grade,bagType,target,quantityMt:target/20,shiftCode,businessDate:isoLocalDate(business),duration,packer:packerForCounter(counter),importKey:[isoLocalDate(start),counter,truck,isoLocalDateTime(start),isoLocalDateTime(end)].join("|"),valid:true,invalid:[]};
   });
   const zeroTargetRows=rows.filter(x=>x.target===0).length;
   const nonZeroRows=rows.filter(x=>x.target!==0);
   const seenImportKeys=new Set();
   const checkedRows=nonZeroRows.map(x=>{
    if(!x.valid)return x;
    if(seenImportKeys.has(x.importKey))return {...x,valid:false,invalid:[...(x.invalid||[]),"Duplicate loading session in Excel — skipped"]};
    seenImportKeys.add(x.importKey);return x;
   });
   setBagPreview(checkedRows);
   const good=checkedRows.filter(x=>x.valid).length;
   const duplicates=checkedRows.filter(x=>(x.invalid||[]).some(v=>v.startsWith("Duplicate loading session"))).length;
   setNotice("Preview ready: "+checkedRows.length+" rows; "+good+" valid loading sessions; "+duplicates+" duplicate rows; "+zeroTargetRows+" zero-target rows ignored; "+(checkedRows.length-good)+" other rows will be skipped.");
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
   const payload=uniqueValid.map(x=>({import_key:x.importKey,source_report_date:isoLocalDate(x.start),business_date:x.businessDate,shift_code:x.shiftCode,counter_no:x.counter,packer_code:x.packer,vehicle_number:x.truck,grade:x.grade,bag_type:x.bagType,target_bags:x.target,loading_start:x.start.toISOString(),loading_end:x.end.toISOString(),duration_seconds:x.duration,source_file_name:bagFileName,imported_by:session.user.id}));
   if(!payload.length)throw new Error("No unique valid loading sessions remain to import.");
   const {error:saveError}=await supabase.from("pp_bag_counting_sessions").upsert(payload,{onConflict:"import_key"});
   if(saveError)throw saveError;
   await loadBagSessions();
   setNotice("Imported "+uniqueValid.length+" unique bag-counting sessions. "+(duplicateCount?"Skipped "+duplicateCount+" duplicate rows. ":"")+"Dispatch reconciliation refreshed. Sessions without an eligible invoice remain Pending Invoice.");
  }catch(err){setNotice("Bag Counting import failed: "+err.message);}
  finally{setBagBusy(false);}
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
   const [{data:staff,error:staffError}]=await Promise.all([
    supabase.from("pp_employees").select("id,employee_code,full_name,staff_category").eq("is_active",true).order("full_name",{ascending:true})
   ]);
   if(staffError)throw staffError;
   // PostgREST applies a row limit (commonly 1,000). Fetch every attendance page so later dates are not silently omitted from the register.
   const att=[];const pageSize=1000;let offset=0;
   while(true){
    const {data,error}=await supabase.from("pp_attendance").select("id,employee_id,business_date,shift_code,attendance_status,duty_classification").gte("business_date",reportFrom).lte("business_date",reportTo).order("business_date",{ascending:true}).order("employee_id",{ascending:true}).order("shift_code",{ascending:true}).range(offset,offset+pageSize-1);
    if(error)throw error;
    const page=data||[];att.push(...page);if(page.length<pageSize)break;offset+=pageSize;
   }
   const staffById=new Map((staff||[]).map(e=>[e.id,e]));
   setEmployees(staff||[]);
   setAttendanceReportRows(att.map(x=>({...x,employee:staffById.get(x.employee_id)||null})));
   setReportLoaded(true);setNotice("Attendance register generated for "+(staff||[]).length+" employees and "+att.length+" duty entries.");
  }catch(err){setNotice("Unable to load attendance register: "+err.message);}
  finally{setReportBusy(false);}
 }
 const attendanceRegisterDates=(()=>{const out=[];const d=new Date(reportFrom+"T00:00:00"),last=new Date(reportTo+"T00:00:00");for(;d<=last;d.setDate(d.getDate()+1))out.push(isoLocalDate(d));return out;})();
 const filteredAttendanceRegister=employees.filter(e=>{const q=reportSearch.trim().toLowerCase();return !q||[e.employee_code,e.full_name,e.staff_category].some(v=>String(v||"").toLowerCase().includes(q));}).map(e=>{
  const records=attendanceReportRows.filter(x=>x.employee_id===e.id&&x.attendance_status==="present");
  const byDate={};for(const x of records){(byDate[x.business_date]??=[]).push(x);}
  const duties=Object.values(byDate).reduce((n,list)=>n+list.length,0);
  const presentDays=Object.keys(byDate).length;
  return {...e,byDate,duties,presentDays,extra:records.filter(x=>x.duty_classification==="extra_duty").length};
 });
 const attendanceRegisterTotals={
  byDate:Object.fromEntries(attendanceRegisterDates.map(d=>[d,filteredAttendanceRegister.reduce((n,e)=>n+(e.byDate[d]?.length||0),0)])),
  presentDays:filteredAttendanceRegister.reduce((n,e)=>n+e.presentDays,0),
  duties:filteredAttendanceRegister.reduce((n,e)=>n+e.duties,0)
 };
 function downloadAttendanceReport(){
  if(!filteredAttendanceRegister.length){setNotice("No employee records to download.");return;}
  const dateHeaders=attendanceRegisterDates.map(d=>d.slice(8,10)+"-"+d.slice(5,7));
  const rows=filteredAttendanceRegister.map((e,i)=>{const row={"S.No.":i+1,"Employee Code":e.employee_code||"","Employee Name":e.full_name||"","Designation":e.staff_category||""};attendanceRegisterDates.forEach((d,j)=>{const shifts=(e.byDate[d]||[]).map(x=>x.shift_code).sort();row[dateHeaders[j]]=shifts.join(" + ");});row["Present Days"]=e.presentDays;row["Total Duties"]=e.duties;return row;});
  const totalRow={"S.No.":"","Employee Code":"","Employee Name":"TOTAL","Designation":""};
  attendanceRegisterDates.forEach((d,j)=>{totalRow[dateHeaders[j]]=attendanceRegisterTotals.byDate[d]||0;});
  totalRow["Present Days"]=attendanceRegisterTotals.presentDays;totalRow["Total Duties"]=attendanceRegisterTotals.duties;rows.push(totalRow);
  const ws=XLSX.utils.json_to_sheet(rows);ws["!cols"]=[{wch:7},{wch:16},{wch:30},{wch:24},...dateHeaders.map(()=>({wch:7})),{wch:13},{wch:13}];
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Attendance Register");
  XLSX.writeFile(wb,"Packing-Plant-Attendance-Register-"+reportFrom+"-to-"+reportTo+".xlsx");
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

 async function readAttendanceFile(file){
  if(!file)return;setAttendanceFile(file.name);setAttendanceImportRows([]);setNotice("");
  try{
   const wb=XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:true});
   // Preserve Excel date cells as Date objects. raw:false formats this workbook's mm-dd-yy dates as text and reverses the expected day/month order.
   const ws=wb.Sheets[wb.SheetNames[0]],grid=XLSX.utils.sheet_to_json(ws,{header:1,defval:"",raw:true});
   if(!grid.length)throw new Error("The selected Excel sheet is empty.");
   const norm=v=>String(v??"").toLowerCase().replace(/[^a-z0-9]/g,"");
   const aliases={date:["date","attendancedate"],code:["idno","idnumber","employeeid","employeecode"],name:["nameofworkmen","nameofworkman","nameoftheworkmen","nameoftheworkman","workmenname","workmanname","name","employeename"],shift:["shift","shiftcode"]};
   let headerRow=-1,ix=null;
   for(let r=0;r<Math.min(grid.length,20);r++){
    const headers=grid[r].map(norm),find=key=>headers.findIndex(h=>aliases[key].includes(h));
    const candidate={date:find("date"),code:find("code"),name:find("name"),shift:find("shift")};
    if(Object.values(candidate).every(v=>v>=0)){headerRow=r;ix=candidate;break;}
   }
   if(headerRow<0){const headers=grid[0].map(norm),find=key=>headers.findIndex(h=>aliases[key].includes(h)),candidate={date:find("date"),code:find("code"),name:find("name"),shift:find("shift")};const missing=Object.entries(candidate).filter(([,v])=>v<0).map(([k])=>({date:"Date",code:"ID No",name:"Name of the workmen",shift:"Shift"}[k]));throw new Error("Missing column heading(s): "+missing.join(", ")+". Accepted name headings include 'Name of the workmen'.");}
   // Excel "ID No" is matched against Employee Master employee_code.
   // Normalise numeric Excel IDs (e.g. 20240, 20240.0, "20,240") consistently.
   const normalizeEmployeeId=value=>{
    let id=String(value??"").trim().replace(/\u00a0/g,"").replace(/,/g,"").replace(/\s+/g,"").toLowerCase();
    if(/^\d+\.0+$/.test(id))id=id.replace(/\.0+$/,"");
    if(/^\d+$/.test(id))id=id.replace(/^0+(?=\d)/,"");
    return id;
   };
   const employeeMap=new Map(employees.filter(e=>e.is_active&&e.employee_code!=null).map(e=>[normalizeEmployeeId(e.employee_code),e]));
   const parseDate=v=>{
    if(v instanceof Date&&!Number.isNaN(v.getTime()))return v.toISOString().slice(0,10);
    const s=String(v??"").trim();if(!s)return "";
    const valid=(y,mo,d)=>{const dt=new Date(Date.UTC(y,mo-1,d));return dt.getUTCFullYear()===y&&dt.getUTCMonth()===mo-1&&dt.getUTCDate()===d?dt.toISOString().slice(0,10):"";};
    let m=s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:[ T].*)?$/);
    if(m){let y=Number(m[3]);if(y<100)y+=y>=50?1900:2000;return valid(y,Number(m[2]),Number(m[1]));}
    m=s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/);
    if(m)return valid(Number(m[1]),Number(m[2]),Number(m[3]));
    m=s.match(/^(\d{1,2})[-\s]([A-Za-z]{3,})[-\s,]+(\d{2}|\d{4})$/);
    if(m){const mo={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12}[m[2].slice(0,3).toLowerCase()];let y=Number(m[3]);if(y<100)y+=y>=50?1900:2000;if(mo)return valid(y,mo,Number(m[1]));}
    if(/^\d+(\.\d+)?$/.test(s)){const n=Number(s);if(n>20000&&n<80000){const d=new Date(Date.UTC(1899,11,30)+Math.floor(n)*86400000);return d.toISOString().slice(0,10);}}
    return "";
   };
   const parsed=grid.slice(headerRow+1).filter(row=>row.some(v=>String(v??"").trim())).map((row,i)=>{
    const rawShift=String(row[ix.shift]??"").trim().toUpperCase().replace(/\s+/g,"");
    const shiftCode=rawShift.replace(/SHIFT$/,""),employeeCode=String(row[ix.code]??"").trim(),employee=employeeMap.get(normalizeEmployeeId(row[ix.code]));
    const businessDate=parseDate(row[ix.date]),workmenName=String(row[ix.name]??"").trim(),issues=[];
    if(!businessDate)issues.push("Invalid date");if(!employeeCode)issues.push("Missing ID No");if(!employee)issues.push("ID No not found in active Employee Master");if(!workmenName)issues.push("Missing workmen name");
    if(!["A","B","C","G"].includes(shiftCode))issues.push("Shift must be A, B, C or G");if(businessDate&&businessDate>today())issues.push("Future attendance date");
    return {business_date:businessDate,employee_code:employeeCode,full_name:employee?.full_name||workmenName,source_name:workmenName,employee_id:employee?.id||null,shift_code:shiftCode,source_row:headerRow+i+2,issues};
   });
   if(!parsed.length)throw new Error("No attendance rows found below the headings.");
   // Keep genuine double duty (same employee/date, different shifts). Automatically skip only exact duplicate employee/date/shift rows, retaining the first occurrence.
   const seen=new Set(),uniqueParsed=[];let skippedDuplicates=0;
   for(const r of parsed){
    if(r.business_date&&r.employee_id&&r.shift_code){const k=[r.business_date,r.shift_code,r.employee_id].join("|");if(seen.has(k)){skippedDuplicates++;continue;}seen.add(k);}
    uniqueParsed.push(r);
   }
   setAttendanceImportRows(uniqueParsed);const bad=uniqueParsed.filter(x=>x.issues.length).length;
   setNotice("Attendance preview ready: "+uniqueParsed.length+" rows; "+(uniqueParsed.length-bad)+" valid and "+bad+" need correction."+(skippedDuplicates?" Automatically skipped "+skippedDuplicates+" exact duplicate employee/date/shift rows.":""));
  }catch(err){setNotice("Attendance file not accepted: "+err.message);}
 }
 async function uploadAttendanceFile(replaceRange=false){
  if(!canEdit||!attendanceImportRows.length)return;
  if(attendanceImportRows.some(x=>x.issues.length)){setNotice("Correct all invalid rows before uploading.");return;}
  setAttendanceImportBusy(true);setNotice("");
  try{
   const keys=[...new Set(attendanceImportRows.map(x=>x.business_date+"|"+x.shift_code))];
   if(!admin)for(const key of keys){const [d,s]=key.split("|");const {count,error}=await supabase.from("pp_attendance").select("id",{count:"exact",head:true}).eq("business_date",d).eq("shift_code",s);if(error)throw error;if(count>0)throw new Error("Attendance already exists for "+d+" / Shift "+s+". Only an administrator can update it.");}
   const dates=[...new Set(attendanceImportRows.map(x=>x.business_date))],employeeIds=[...new Set(attendanceImportRows.map(x=>x.employee_id))];
   const [holidayResult,priorResult]=await Promise.all([
    supabase.from("pp_holidays").select("holiday_date").in("holiday_date",dates).eq("is_active",true),
    supabase.from("pp_attendance").select("employee_id,business_date").in("employee_id",employeeIds).eq("attendance_status","present").eq("duty_classification","actual_duty").gte("business_date",dates.map(d=>d.slice(0,7)+"-01").sort()[0]).lt("business_date",dates.slice().sort().at(-1))
   ]);
   if(holidayResult.error)throw holidayResult.error;if(priorResult.error)throw priorResult.error;
   const holidaySet=new Set((holidayResult.data||[]).map(x=>x.holiday_date));
   const payload=attendanceImportRows.map(r=>{const monthStart=r.business_date.slice(0,7)+"-01",priorDays=new Set((priorResult.data||[]).filter(x=>x.employee_id===r.employee_id&&x.business_date>=monthStart&&x.business_date<r.business_date).map(x=>x.business_date)).size;return {business_date:r.business_date,shift_code:r.shift_code,employee_id:r.employee_id,attendance_status:"present",duty_classification:holidaySet.has(r.business_date)&&priorDays>=7?"extra_duty":"actual_duty",created_by:session.user.id};});
   if(replaceRange){
    if(!admin)throw new Error("Only an administrator can replace attendance for a date range.");
    const dateFrom=dates.slice().sort()[0],dateTo=dates.slice().sort().at(-1);
    const confirmed=window.confirm("REPLACE ATTENDANCE\n\nThis will permanently replace all existing attendance records from "+dateFrom+" through "+dateTo+" with the "+payload.length+" records in the selected Excel file. Records outside this date range will remain unchanged. Continue only after checking the preview.");
    if(!confirmed)return;
    const {data,error}=await supabase.rpc("replace_pp_attendance_range",{p_date_from:dateFrom,p_date_to:dateTo,p_rows:payload,p_expected_count:payload.length});
    if(error)throw new Error("Attendance replacement failed: "+error.message);
    const replaced=Number(data);
    if(replaced!==payload.length)throw new Error("Replacement verification mismatch: expected "+payload.length+" rows, server confirmed "+replaced+".");
    setNotice("Attendance replaced and verified successfully: "+replaced+" records from "+dateFrom+" through "+dateTo+". Records outside this range were preserved.");
    setAttendanceImportRows([]);setAttendanceFile("");await load();return;
   }
   // Upload in small batches so a large annual workbook is not sent as one oversized request.
   const batchSize=500;let uploaded=0;
   for(let i=0;i<payload.length;i+=batchSize){
    const batch=payload.slice(i,i+batchSize);
    const {data,error}=await supabase.from("pp_attendance").upsert(batch,{onConflict:"business_date,shift_code,employee_id"}).select("id");
    if(error)throw new Error("Attendance upload stopped after "+uploaded+" of "+payload.length+" rows: "+error.message);
    if((data||[]).length!==batch.length)throw new Error("Attendance upload verification mismatch in batch starting at row "+(i+1)+": expected "+batch.length+" rows but confirmed "+(data||[]).length+".");
    uploaded+=(data||[]).length;
    setNotice("Uploading attendance: "+uploaded+" / "+payload.length+" records completed...");
   }
   setNotice("Attendance uploaded and verified successfully: "+uploaded+" present records across "+keys.length+" date/shift combinations. Employees not listed were not entered as present.");
   setAttendanceImportRows([]);setAttendanceFile("");await load();
  }catch(err){setNotice("Attendance upload failed: "+err.message);}finally{setAttendanceImportBusy(false);}
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
 const sumQty=list=>list.reduce((s,x)=>s+Number(x.quantity_mt||0),0),total=sumQty(rows),ppc=sumQty(rows.filter(x=>x.product_family==="PPC")),opc=sumQty(rows.filter(x=>x.product_family==="OPC")),bulkOpc=sumQty(rows.filter(x=>x.product_family==="OPC"&&x.dispatch_kind==="Bulk")),bulkPpc=sumQty(rows.filter(x=>x.product_family==="PPC"&&x.dispatch_kind==="Bulk")),bagOpc=sumQty(rows.filter(x=>x.product_family==="OPC"&&x.dispatch_kind==="Bag")),bagPpc=sumQty(rows.filter(x=>x.product_family==="PPC"&&x.dispatch_kind==="Bag")),truckCount=new Set(rows.map(x=>x.vehicle_number)).size;
 return <section className="pp-registers">
  <div className="section-head"><div><span className="eyebrow">PACKING PLANT · LIVE DATABASE</span><h1>Shift Registers &amp; Masters</h1><p className="muted">Truck loading, attendance, employee and stoppage reason registers</p></div><span className="pill">{admin?"Administrator":canEdit?"Uploader":"Read-only"}</span></div>
  <div className="panel"><div className="mapping-grid pp-register-grid"><label>Business date<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>{section!=="Truck Loading"&&<label>Shift<select value={shift} onChange={e=>setShift(e.target.value)}><option value="A">A Shift · 06:00–14:00</option><option value="B">B Shift · 14:00–22:00</option><option value="C">C Shift · 22:00–06:00</option>{(section==="Attendance"||section==="Attendance Report")&&<option value="G">G Shift · 08:00–17:00</option>}</select></label>}<div className="pp-kpi"><span>Shift business date</span><b>{date}</b></div></div></div>
  <div className="pp-register-tabs">{["Truck Loading","Bag Counting Upload","Packslip Timestamp Upload","Packer Reports","Attendance","Attendance Report","Employee Master","Holiday Master","Stoppage Reason Master"].map(x=><button key={x} className={section===x?"primary":"secondary"} onClick={()=>setSection(x)}>{x}</button>)}</div>
  {section==="Truck Loading"&&<><div className="panel"><div className="panel-title"><h3>Truck loading from dispatch data</h3><span className="pill">Automatic · No manual entry</span></div><p className="footnote">Vehicle number, PPC/OPC product and quantity are populated directly from the uploaded Cement Dispatch Details for the selected business date. This register is read-only; no separate truck entry is saved.</p></div>
    <div className="stats pp-truck-stats"><div className="stat"><span>Trucks</span><b>{truckCount}</b></div><div className="stat"><span>Total quantity (MT)</span><b>{money(total)}</b></div><div className="stat"><span>OPC total (MT)</span><b>{money(opc)}</b></div><div className="stat"><span>PPC total (MT)</span><b>{money(ppc)}</b></div><div className="stat"><span>OPC Bulk (MT)</span><b>{money(bulkOpc)}</b></div><div className="stat"><span>PPC Bulk (MT)</span><b>{money(bulkPpc)}</b></div><div className="stat"><span>OPC Bag (MT)</span><b>{money(bagOpc)}</b></div><div className="stat"><span>PPC Bag (MT)</span><b>{money(bagPpc)}</b></div></div>
   <div className="panel"><h3>Truck loading register · Vehicle-wise dispatch summary</h3><div className="table-scroll"><table><thead><tr><th>Dispatch Date</th><th>Vehicle Number</th><th>Product</th><th>Quantity (MT)</th><th>Invoice No(s).</th><th>Dispatch Product Code(s)</th></tr></thead><tbody>{rows.map(x=><tr key={x.id}><td>{x.dispatch_date}</td><td>{x.vehicle_number}</td><td>{x.product_code}</td><td className="num">{money(x.quantity_mt)}</td><td>{x.invoice_numbers||"—"}</td><td>{x.source_product_codes}</td></tr>)}{!rows.length&&<tr><td colSpan="6" className="muted">No OPC/PPC dispatch records with a vehicle number are available for this date.</td></tr>}</tbody></table></div></div></>}}
  
  {section==="Bag Counting Upload"&&<><div className="panel"><h3>Bag Counting Data · Excel Import</h3><p className="footnote">Upload the bag-counting Excel data. Rows outside the selected date range are rejected. Counter 1 = Packer 1, Counter 2 = Packer 2, Counters 3 and 4 = Packer 3. Shift is assigned from loading start time. These records are summarized in Packer Reports; no dispatch matching is required.</p><div className="mapping-grid pp-register-grid"><label>From Date<input type="date" value={bagReportFrom} max={today()} onChange={e=>setBagReportFrom(e.target.value)} disabled={!canEdit}/></label><label>To Date<input type="date" value={bagReportTo} min={bagReportFrom} max={today()} onChange={e=>setBagReportTo(e.target.value)} disabled={!canEdit}/></label><label>Excel file (.xlsx / .xls)<input type="file" accept=".xlsx,.xls" onChange={e=>previewBagFile(e.target.files?.[0]||null)} disabled={!canEdit}/></label></div>{bagFileName&&<p className="footnote">Selected file: {bagFileName}</p>}{bagPreview.length>0&&<><div className="stats pp-truck-stats"><div className="stat"><span>Rows</span><b>{bagPreview.length}</b></div><div className="stat"><span>Valid sessions</span><b>{bagPreview.filter(x=>x.valid).length}</b></div><div className="stat"><span>Invalid rows</span><b>{bagPreview.filter(x=>!x.valid).length}</b></div></div><div className="table-scroll"><table><thead><tr><th>Excel Row</th><th>Counter</th><th>Packer</th><th>Vehicle</th><th>Shift</th><th>Business Date</th><th>Start</th><th>End</th><th>Duration</th><th>Grade</th><th>Bag Type</th><th>Target (Bags)</th><th>Quantity (MT)</th><th>Status</th></tr></thead><tbody>{bagPreview.map(x=><tr key={x.rowNo}><td>{x.rowNo}</td><td>{x.counter||"—"}</td><td>{x.packer||"—"}</td><td>{x.truck||"—"}</td><td>{x.shiftCode||"—"}</td><td>{x.businessDate||"—"}</td><td>{x.start?x.start.toLocaleString():"—"}</td><td>{x.end?x.end.toLocaleString():"—"}</td><td>{x.duration!=null?new Date(x.duration*1000).toISOString().slice(11,19):"—"}</td><td>{x.grade||"—"}</td><td>{x.bagType||"—"}</td><td>{x.target??"—"}</td><td>{x.quantityMt!=null?money(x.quantityMt):"—"}</td><td>{x.valid?"Ready":x.invalid.join(", ")}</td></tr>)}</tbody></table></div><button className="primary" onClick={importBagCounting} disabled={!canEdit||bagBusy||!bagPreview.some(x=>x.valid)}>{bagBusy?"Importing…":"Import Bag Counting Data"}</button></>}</div>
   <div className="panel"><h3>Imported Bag Counting sessions · {bagReportFrom} to {bagReportTo}</h3><div className="table-scroll"><table><thead><tr><th>Packer</th><th>Counter</th><th>Shift</th><th>Vehicle</th><th>Start</th><th>End</th><th>Duration</th></tr></thead><tbody>{bagSessions.map(x=><tr key={x.id}><td>{x.packer_code==="P1"?"Packer 1":x.packer_code==="P2"?"Packer 2":"Packer 3"}</td><td>{x.counter_no}</td><td>{x.shift_code}</td><td>{x.vehicle_number}</td><td>{new Date(x.loading_start).toLocaleString()}</td><td>{new Date(x.loading_end).toLocaleString()}</td><td>{new Date(x.duration_seconds*1000).toISOString().slice(11,19)}</td></tr>)}{!bagSessions.length&&<tr><td colSpan="7" className="muted">No imported sessions for this Packing Plant business date.</td></tr>}</tbody></table></div></div></>}
  {section==="Packslip Timestamp Upload"&&<><div className="panel"><h3>Packslip Timestamp Register · Excel Import</h3><p className="footnote">Upload the complete packslip file containing both bagged and bulk cement for all dates. PackslipNo links to dispatch data; CreatedDate is the invoice-generation timestamp; PackSlipShippedDate is retained for audit. Re-uploading updates the same Company Code + Packslip No. without creating duplicates.</p><div className="mapping-grid pp-register-grid"><label>Excel file (.xlsx / .xls)<input type="file" accept=".xlsx,.xls" disabled={!canEdit||packslipBusy} onChange={e=>previewPackslipFile(e.target.files?.[0]||null)}/></label><div className="pp-kpi"><span>Selected file</span><b>{packslipFileName||"No file selected"}</b></div><div className="pp-kpi"><span>Last preview / upload</span><b>{packslipPreview.length?packslipPreview.length+" rows":packslipImported?packslipImported+" uploaded":"—"}</b></div></div>{packslipPreview.length>0&&<><div className="stats pp-truck-stats"><div className="stat"><span>Total rows</span><b>{packslipPreview.length}</b></div><div className="stat"><span>Valid rows</span><b>{packslipPreview.filter(x=>!x.invalid.length).length}</b></div><div className="stat"><span>Invalid rows</span><b>{packslipPreview.filter(x=>x.invalid.length).length}</b></div></div><div className="table-scroll"><table><thead><tr><th>Excel Row</th><th>Packslip Date</th><th>Packslip No.</th><th>Product</th><th>Qty</th><th>Vehicle</th><th>Created Date</th><th>Shipped Date</th><th>Validation</th></tr></thead><tbody>{packslipPreview.slice(0,100).map(x=><tr key={x.rowNo}><td>{x.rowNo}</td><td>{x.packslip_date||"—"}</td><td>{x.packslip_no||"—"}</td><td>{x.item_code||"—"}</td><td>{money(x.quantity)}</td><td>{x.vehicle_no||"—"}</td><td>{x.created_date||"—"}</td><td>{x.packslip_shipped_date||"—"}</td><td>{x.invalid.join("; ")||"Valid"}</td></tr>)}</tbody></table></div><p className="footnote">Showing first 100 rows in preview. All valid rows will be uploaded; invalid rows are skipped.</p><button className="primary" onClick={importPackslipFile} disabled={!canEdit||packslipBusy||!packslipPreview.some(x=>!x.invalid.length)}>{packslipBusy?"Uploading…":"Import Valid Packslip Rows"}</button><button className="secondary" onClick={()=>{setPackslipPreview([]);setPackslipFile(null);setPackslipFileName("");}}>Clear Preview</button></>}</div></>}
  {section==="Packer Reports"&&<><div className="panel"><h3>Packing Plant · Packer Performance Summary</h3><p className="footnote">Truck count and quantity are calculated directly from Bag Counting data: Grade (OPC/PPC), Bag Type (Yellow/White/Laminated), and Target bags ÷ 20 = Quantity (MT). No dispatch, invoice, packslip or weighbridge matching is performed. Re-import older files containing these columns to populate their quantity figures.</p><div className="mapping-grid pp-register-grid">
    <label>From Date<input type="date" value={packerFrom} max={today()} onChange={e=>setPackerFrom(e.target.value)}/></label><label>To Date<input type="date" value={packerTo} max={today()} onChange={e=>setPackerTo(e.target.value)}/></label>
    <label>Shift<select value={packerShift} onChange={e=>setPackerShift(e.target.value)}><option value="ALL">All Shifts</option><option value="A">A Shift</option><option value="B">B Shift</option><option value="C">C Shift</option></select></label>
    <label>Packer<select value={packerFilter} onChange={e=>setPackerFilter(e.target.value)}><option value="ALL">All Packers</option><option value="P1">Packer 1</option><option value="P2">Packer 2</option><option value="P3">Packer 3</option></select></label>
   </div><div className="button-row"><button className="primary" onClick={loadPackerReport} disabled={packerReportBusy}>{packerReportBusy?"Generating…":"Generate Report"}</button><button className="secondary" onClick={()=>{setPackerFrom(today().slice(0,7)+"-01");setPackerTo(today());setPackerShift("ALL");setPackerFilter("ALL");setPackerReportRows([]);setPackerReportLoaded(false);}}>Clear Filters</button>{packerReportLoaded&&<button className="secondary" onClick={downloadPackerReport}>Download Excel</button>}</div></div>
   {packerReportLoaded&&<><div className="stats pp-truck-stats"><div className="stat"><span>Total loading sessions</span><b>{packerReportRows.length}</b></div><div className="stat"><span>Total loading duration</span><b>{durationText(packerReportRows.reduce((n,x)=>n+Number(x.duration_seconds||0),0))}</b></div><div className="stat"><span>Average session duration</span><b>{durationText(packerReportRows.length?packerReportRows.reduce((n,x)=>n+Number(x.duration_seconds||0),0)/packerReportRows.length:0)}</b></div></div>
    <div className="panel"><h3>Packer-wise summary</h3><div className="table-scroll"><table><thead><tr><th>Packer</th><th>No. of Trucks Loaded</th><th>OPC Yellow (MT)</th><th>OPC White (MT)</th><th>PPC Yellow (MT)</th><th>PPC White (MT)</th><th>PPC Laminated (MT)</th><th>Total Quantity (MT)</th></tr></thead><tbody>{packerSummary.filter(x=>packerFilter==="ALL"||x.code===packerFilter).map(x=><tr key={x.code}><td>{x.label}</td><td>{x.trucks}</td><td>{money(x.opcYellow)}</td><td>{money(x.opcWhite)}</td><td>{money(x.ppcYellow)}</td><td>{money(x.ppcWhite)}</td><td>{money(x.ppcLaminated)}</td><td><b>{money(x.quantityMt)}</b></td></tr>)}</tbody></table></div></div>
    <div className="panel"><h3>Packer-wise and shift-wise truck loading summary</h3><div className="table-scroll"><table><thead><tr><th>Packer</th><th>Counter</th><th>Shift</th><th>No. of Trucks Loaded</th><th>OPC Yellow (MT)</th><th>OPC White (MT)</th><th>PPC Yellow (MT)</th><th>PPC White (MT)</th><th>PPC Laminated (MT)</th><th>Total Quantity (MT)</th></tr></thead><tbody>{packerShiftSummary.map(x=><tr key={x.packer+"-"+x.counter+"-"+x.shift}><td>{x.packer}</td><td>{x.counter}</td><td>{x.shift}</td><td>{x.trucks}</td><td>{money(x.opcYellow)}</td><td>{money(x.opcWhite)}</td><td>{money(x.ppcYellow)}</td><td>{money(x.ppcWhite)}</td><td>{money(x.ppcLaminated)}</td><td><b>{money(x.quantityMt)}</b></td></tr>)}{!packerShiftSummary.length&&<tr><td colSpan="9" className="muted">No bag-counting sessions for the selected filters.</td></tr>}</tbody></table></div></div></>}
  </>}
   {section==="Attendance"&&<div className="panel"><h3>Shift-wise employee attendance</h3>{holiday&&<div className="alert">Holiday: {holiday.description}. Extra Duty applies only after at least 7 regular attended days earlier in this calendar month.</div>}
   <div className="mapping-grid pp-register-grid">
    <label>Attendance date<input type="date" value={date} max={today()} onChange={e=>setDate(e.target.value)} disabled={!admin&&attendanceRows.length>0}/></label>
    <label>Shift<select value={shift} onChange={e=>setShift(e.target.value)} disabled={!admin&&attendanceRows.length>0}><option value="A">A Shift · 06:00–14:00</option><option value="B">B Shift · 14:00–22:00</option><option value="C">C Shift · 22:00–06:00</option><option value="G">G Shift · 08:00–17:00</option></select></label>
   </div>
   {attendanceRows.length>0&&!admin&&<div className="alert">Submitted attendance is locked. Only an administrator can modify this shift's attendance.</div>}
   <div className="panel" style={{marginTop:"12px"}}><h3>Attendance Excel Upload</h3><p className="footnote">Required headings: Date, ID No, Name of the workmen, Shift. Each listed employee is marked Present. Employees not listed are not added as present. ID No must match an active Employee Master record.</p><label>Choose attendance Excel file (.xlsx / .xls)<input type="file" accept=".xlsx,.xls" disabled={!canEdit||attendanceImportBusy} onChange={e=>readAttendanceFile(e.target.files?.[0]||null)}/></label>{attendanceFile&&<p className="footnote">Selected file: {attendanceFile}</p>}{attendanceImportRows.length>0&&<><div className="stats pp-truck-stats"><div className="stat"><span>Total rows</span><b>{attendanceImportRows.length}</b></div><div className="stat"><span>Valid rows</span><b>{attendanceImportRows.filter(x=>!x.issues.length).length}</b></div><div className="stat"><span>Invalid rows</span><b>{attendanceImportRows.filter(x=>x.issues.length).length}</b></div></div><div className="table-scroll"><table><thead><tr><th>Excel Row</th><th>Date</th><th>ID No</th><th>Workmen Name</th><th>Matched Employee</th><th>Shift</th><th>Status</th></tr></thead><tbody>{attendanceImportRows.map(x=><tr key={x.source_row}><td>{x.source_row}</td><td>{x.business_date||"—"}</td><td>{x.employee_code}</td><td>{x.source_name}</td><td>{x.full_name}</td><td>{x.shift_code}</td><td>{x.issues.length?x.issues.join("; "):"Ready · Present"}</td></tr>)}</tbody></table></div><div className="button-row"><button className="primary" onClick={()=>uploadAttendanceFile(false)} disabled={!canEdit||attendanceImportBusy||attendanceImportRows.some(x=>x.issues.length)}>{attendanceImportBusy?"Uploading…":"Confirm & Upload Attendance"}</button>{admin&&<button className="danger" onClick={()=>uploadAttendanceFile(true)} disabled={attendanceImportBusy||attendanceImportRows.some(x=>x.issues.length)}>Replace Attendance for File Date Range</button>}<button className="secondary" onClick={()=>{setAttendanceImportRows([]);setAttendanceFile("");}} disabled={attendanceImportBusy}>Clear File</button></div></>}</div>

   <div className="mapping-grid pp-register-grid">
    <label>Search by employee code or name<input ref={employeeSearchInput} value={employeeSearch} onChange={e=>setEmployeeSearch(e.target.value)} placeholder="Type employee code or employee name…" disabled={!canEdit||(!admin&&attendanceRows.length>0)}/></label>
   </div>
   {attendanceMatches.length>0&&<div className="panel" style={{padding:"10px",marginTop:"8px"}}><strong>Matching employees — select one to add</strong><div className="table-scroll"><table><thead><tr><th>Employee code</th><th>Employee name</th><th>Job</th><th>Action</th></tr></thead><tbody>{attendanceMatches.map(e=><tr key={e.id}><td>{e.employee_code||"—"}</td><td>{e.full_name}</td><td>{e.staff_category}</td><td><button className="secondary" disabled={!canEdit||(!admin&&attendanceRows.length>0)} onClick={()=>{setAttendance(v=>({...v,[e.id]:true}));setEmployeeSearch("");employeeSearchInput.current?.focus();}}>Add</button></td></tr>)}</tbody></table></div></div>}
   <div className="table-scroll"><table><thead><tr><th>S.No.</th><th>Employee code</th><th>Employee name</th><th>Job</th><th>Action</th></tr></thead><tbody>{employees.filter(e=>attendance[e.id]).map((e,i)=><tr key={e.id}><td>{i+1}</td><td>{e.employee_code||"—"}</td><td>{e.full_name}</td><td>{e.staff_category}</td><td><button className="text-btn" disabled={!admin&&attendanceRows.length>0} onClick={()=>setAttendance(v=>({...v,[e.id]:false}))}>Remove</button></td></tr>)}{!employees.some(e=>attendance[e.id])&&<tr><td colSpan="5" className="muted">Search by employee code or name and select an employee.</td></tr>}</tbody></table></div>
   <button className="primary" onClick={saveAttendance} disabled={!canEdit||saving||(!admin&&attendanceRows.length>0)||!employees.some(e=>attendance[e.id])}>{saving?"Saving…":attendanceRows.length>0&&admin?"Update attendance":"Save / Submit attendance"}</button>
   <p className="footnote">Only employees added to this shift are recorded as Present. Uploaders can submit attendance once for each date and shift. Administrators can add, remove or update submitted entries.</p>
  </div>}
  {section==="Attendance Report"&&<><div className="panel"><h3>Packing Plant Attendance Report</h3><p className="footnote">View submitted employee attendance by date and shift. Select a date range and click Generate Report.</p><div className="mapping-grid pp-register-grid">
   <label>From Date<input type="date" value={reportFrom} max={today()} onChange={e=>setReportFrom(e.target.value)}/></label>
   <label>To Date<input type="date" value={reportTo} max={today()} onChange={e=>setReportTo(e.target.value)}/></label>
   <label>Shift<select value={reportShift} onChange={e=>setReportShift(e.target.value)}><option value="ALL">All Shifts</option><option value="A">A Shift</option><option value="B">B Shift</option><option value="C">C Shift</option><option value="G">G Shift</option></select></label>
  </div><div className="button-row"><button className="primary" onClick={loadAttendanceReport} disabled={reportBusy}>{reportBusy?"Loading…":"Generate Report"}</button><button className="secondary" onClick={()=>{setReportFrom(today().slice(0,7)+"-01");setReportTo(today());setReportShift("ALL");setReportSearch("");setAttendanceReportRows([]);setReportLoaded(false);}}>Clear Filters</button>{reportLoaded&&<button className="secondary" onClick={downloadAttendanceReport}>Download Excel</button>}</div></div>
  {reportLoaded&&<><div className="stats pp-truck-stats"><div className="stat"><span>Employees in register</span><b>{filteredAttendanceRegister.length}</b></div><div className="stat"><span>Total duty entries</span><b>{filteredAttendanceRegister.reduce((n,x)=>n+x.duties,0)}</b></div><div className="stat"><span>Present employee-days</span><b>{filteredAttendanceRegister.reduce((n,x)=>n+x.presentDays,0)}</b></div><div className="stat"><span>Extra duty shifts</span><b>{filteredAttendanceRegister.reduce((n,x)=>n+x.extra,0)}</b></div></div>
  <div className="panel"><h3>Standard Attendance Register</h3><p className="footnote">One employee per row. Each date column shows the shift attended (A, B, C or G). If an employee worked two shifts on the same date, both shifts are shown in that date cell. A dash indicates no attendance entry.</p><div className="mapping-grid pp-register-grid"><label>Search employee code / name / designation<input value={reportSearch} onChange={e=>setReportSearch(e.target.value)} placeholder="Search employee code, name or designation…"/></label></div><div className="table-scroll"><table className="attendance-register-table"><thead><tr><th>S.No.</th><th>Employee Code</th><th>Employee Name</th><th>Designation</th>{attendanceRegisterDates.map(d=><th key={d}>{d.slice(8,10)}-{d.slice(5,7)}</th>)}<th>Present Days</th><th>Total Duties</th></tr></thead><tbody>{filteredAttendanceRegister.map((e,i)=><tr key={e.id}><td>{i+1}</td><td>{e.employee_code||"—"}</td><td>{e.full_name}</td><td>{e.staff_category||"—"}</td>{attendanceRegisterDates.map(d=>{const shifts=(e.byDate[d]||[]).map(x=>x.shift_code).sort();return <td key={d}>{shifts.length?shifts.join(" + "):"—"}</td>;})}<td>{e.presentDays}</td><td>{e.duties}</td></tr>)}{filteredAttendanceRegister.length>0&&<tr className="total-row"><td></td><td></td><td><strong>TOTAL</strong></td><td></td>{attendanceRegisterDates.map(d=><td key={d}><strong>{attendanceRegisterTotals.byDate[d]||0}</strong></td>)}<td><strong>{attendanceRegisterTotals.presentDays}</strong></td><td><strong>{attendanceRegisterTotals.duties}</strong></td></tr>}{!filteredAttendanceRegister.length&&<tr><td colSpan={6+attendanceRegisterDates.length} className="muted">No employees match this search.</td></tr>}</tbody></table></div></div></>}
  </>}
  {section==="Employee Master"&&<><div className="panel"><h3>Add employee · Admin only</h3>{admin?<><div className="mapping-grid pp-register-grid"><label>Employee code (optional)<input value={code} onChange={e=>setCode(e.target.value)}/></label><label>Employee name<input value={name} onChange={e=>setName(e.target.value)}/></label><label>Staff category<select value={category} onChange={e=>setCategory(e.target.value)}>{STAFF.map(x=><option key={x}>{x}</option>)}</select></label></div><button className="primary" onClick={addEmployee}>Add employee</button></>:<p className="muted">Administrator access is required to maintain employees.</p>}</div><div className="panel"><h3>Active employees</h3><div className="table-scroll"><table><thead><tr><th>Code</th><th>Name</th><th>Category</th></tr></thead><tbody>{employees.map(x=><tr key={x.id}><td>{x.employee_code||"—"}</td><td>{x.full_name}</td><td>{x.staff_category}</td></tr>)}</tbody></table></div></div></>}
  {section==="Holiday Master"&&<><div className="panel"><h3>Add holiday / festival · Admin only</h3>{admin?<><div className="mapping-grid pp-register-grid"><label>Holiday date<input type="date" value={holidayDate} onChange={e=>setHolidayDate(e.target.value)}/></label><label>Description<input value={holidayText} onChange={e=>setHolidayText(e.target.value)} placeholder="Holiday / festival name"/></label></div><button className="primary" onClick={addHoliday}>Save holiday</button></>:<p className="muted">Administrator access is required to maintain holidays.</p>}</div><div className="panel"><h3>Holiday for selected date</h3><p>{holiday?holiday.description:"No active holiday is recorded for this date."}</p></div></>}
  {section==="Stoppage Reason Master"&&<><div className="panel"><h3>{editReason?"Edit stoppage reason":"Add stoppage reason"} · Admin only</h3>{admin?<><div className="mapping-grid pp-register-grid"><label>Category<select value={reasonCategory} onChange={e=>setReasonCategory(e.target.value)}>{CATS.map(x=><option key={x}>{x}</option>)}</select></label><label>Reason<input value={reason} onChange={e=>setReason(e.target.value)}/></label></div><button className="primary" onClick={saveReason}>{editReason?"Update reason":"Add reason"}</button>{editReason&&<button className="secondary" onClick={()=>{setEditReason(null);setReason("");}}>Cancel</button>}</>:<p className="muted">Administrator access is required to maintain stoppage reasons.</p>}</div><div className="panel"><h3>Stoppage reasons</h3><div className="table-scroll"><table><thead><tr><th>Category</th><th>Reason</th><th>Status</th>{admin&&<th>Actions</th>}</tr></thead><tbody>{reasons.map(x=><tr key={x.id}><td>{x.category}</td><td>{x.reason}</td><td>{x.is_active?"Active":"Inactive"}</td>{admin&&<td><button className="text-btn" onClick={()=>{setEditReason(x.id);setReasonCategory(x.category);setReason(x.reason);}}>Edit</button><button className="text-btn" onClick={()=>toggleReason(x)}>{x.is_active?"Deactivate":"Activate"}</button></td>}</tr>)}</tbody></table></div></div></>}
  {loading&&<p className="muted">Loading register…</p>}{notice&&<div className={notice.includes("not saved")||notice.includes("failed")?"alert error":"alert"}>{notice}</div>}
 </section>;
}
