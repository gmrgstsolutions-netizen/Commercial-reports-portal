import React, { useEffect, useMemo, useState } from "react";

const PACKERS = [{id:"P1",name:"Packer 1",minTph:95,maxTph:102},{id:"P2",name:"Packer 2",minTph:95,maxTph:102},{id:"P3",name:"Packer 3",minTph:130,maxTph:140}];
const RUNNING_AREAS = [...PACKERS,{id:"BULK",name:"Bulk Loading",minTph:115,maxTph:120}];
const CATEGORIES = ["Mechanical","Electrical","Instrumentation","Operational","Planned"];
const today = () => { const d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
const shiftStart = () => 0;
const clock = m => Number(m)===1440 ? "24:00" : String(Math.floor(Number(m)/60)).padStart(2,"0")+":"+String(Number(m)%60).padStart(2,"0");
const TIME_OPTIONS = Array.from({length:289},(_,i)=>i===288?1440:i*5);
const toMinute = t => { const [h,m]=String(t||"00:00").split(":").map(Number); return h*60+m; };
const toRelative = t => toMinute(t);
const fromRelative = n => clock(n);
const fmtH = n => (n/60).toFixed(2);
const uid = () => globalThis.crypto?.randomUUID?.() || "pp-"+Date.now()+"-"+Math.random().toString(36).slice(2);

export default function PackingPlantConnected({supabase,session,profile,shiftInchargeName=""}) {
  const [date,setDate]=useState(today());
  const shift = "D";
  const [selectedArea,setSelectedArea]=useState("P1");
  const [shiftId,setShiftId]=useState(null);
  const [intervals,setIntervals]=useState([]);
  const [originalIntervalIds,setOriginalIntervalIds]=useState([]);
  const [staff,setStaff]=useState({packing_plc_operator:"",truck_loading_operator:"",shift_incharge:shiftInchargeName});
  const [reasons,setReasons]=useState([]);
  const [gapChoices,setGapChoices]=useState({});
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState("");
  const canEdit=["admin","uploader"].includes(profile?.role);
  const start=0, end=1440;

  const timeline=useMemo(()=>RUNNING_AREAS.map(p=>{
    const own=intervals.filter(x=>x.packer_code===p.id).map(x=>({...x,startMinute:Number(x.start_minute),endMinute:Number(x.end_minute)})).sort((a,b)=>a.startMinute-b.startMinute);
    let previous=0,running=0,overlap=false; const gaps=[];
    for(const x of own){
      if(x.startMinute<previous || x.startMinute<0 || x.endMinute>1440 || x.endMinute<=x.startMinute) overlap=true;
      if(x.startMinute>previous)gaps.push({start:previous,end:x.startMinute});
      if(x.startMinute>=previous && x.endMinute<=1440)running+=x.endMinute-x.startMinute;
      previous=Math.max(previous,x.endMinute);
    }
    if(previous<1440)gaps.push({start:previous,end:1440});
    return {...p,own,gaps,running,stoppage:gaps.reduce((s,g)=>s+g.end-g.start,0),overlap};
  }),[intervals]);

  async function load() {
    setLoading(true); setMessage("");
    try {
      const {data:sh,error:se}=await supabase.from("pp_shifts").select("id,status").eq("business_date",date).eq("shift_code",shift).maybeSingle();
      if(se)throw se;
      setShiftId(sh?.id||null);
      if(!sh){setIntervals([]);setOriginalIntervalIds([]);setStaff({packing_plc_operator:"",truck_loading_operator:"",shift_incharge:shiftInchargeName});setGapChoices({});}
      else {
        const [iv,st,sp]=await Promise.all([
          supabase.from("pp_running_intervals").select("*").eq("shift_id",sh.id).order("start_minute"),
          supabase.from("pp_shift_staff").select("*").eq("shift_id",sh.id).maybeSingle(),
          supabase.from("pp_stoppages").select("*").eq("shift_id",sh.id)
        ]);
        for(const x of [iv,st,sp])if(x.error)throw x.error;
        setIntervals(iv.data||[]);setOriginalIntervalIds((iv.data||[]).map(x=>x.id));
        setStaff({packing_plc_operator:st.data?.packing_plc_operator||"",truck_loading_operator:st.data?.truck_loading_operator||"",shift_incharge:st.data?.shift_incharge||shiftInchargeName});
        const choices={};for(const row of sp.data||[]){const marker=" | Additional: ";const saved=String(row.reason_snapshot||"");const split=saved.indexOf(marker);choices[row.packer_code+"-"+row.start_minute+"-"+row.end_minute]={category:row.category,reason:split>=0?saved.slice(0,split):saved,additionalReason:split>=0?saved.slice(split+marker.length):"",reason_id:row.reason_id};}setGapChoices(choices);
      }
      const {data:rs,error:re}=await supabase.from("pp_stoppage_reasons").select("id,category,reason").eq("is_active",true).order("category").order("reason");
      if(re)throw re;setReasons(rs||[]);
    } catch(e){setMessage("Unable to load daily operating hours: "+e.message);}
    finally{setLoading(false);}
  }
  useEffect(()=>{load();},[date]);
  const addInterval=packer=>setIntervals(v=>[...v,{id:uid(),packer_code:packer,product_code:"PPC",start_minute:0,end_minute:1440}]);
  const updateInterval=(id,field,value)=>setIntervals(v=>v.map(x=>x.id===id?{...x,[field]:value}:x));
  const removeInterval=id=>setIntervals(v=>v.filter(x=>x.id!==id));

  async function save() {
    if(!canEdit){setMessage("Your account has read-only access. Contact the administrator for uploader access.");return;}
    if(timeline.some(p=>p.overlap)){setMessage("Correct overlapping intervals and keep all running times between 00:00 and 24:00.");return;}
    for(const p of timeline){
      const unclassified=p.gaps.find(g=>!gapChoices[p.id+"-"+g.start+"-"+g.end]?.category);
      if(unclassified){setMessage(p.name+" stoppage from "+fromRelative(unclassified.start)+" to "+fromRelative(unclassified.end)+" needs a category before saving.");return;} const withoutReason=p.gaps.find(g=>!String(gapChoices[p.id+"-"+g.start+"-"+g.end]?.reason||"").trim()); if(withoutReason){setMessage(p.name+" stoppage from "+fromRelative(withoutReason.start)+" to "+fromRelative(withoutReason.end)+" needs a predefined or manually entered reason before saving.");return;}
    }
    setSaving(true);setMessage("");
    try{
      let id=shiftId;
      if(!id){
        const {data,error}=await supabase.from("pp_shifts").upsert({business_date:date,shift_code:shift,created_by:session.user.id},{onConflict:"business_date,shift_code"}).select("id").single();
        if(error)throw error;id=data.id;setShiftId(id);
      }
      const activeIds=intervals.map(x=>x.id).filter(id=>originalIntervalIds.includes(id));
      const removed=originalIntervalIds.filter(id=>!activeIds.includes(id));
      if(removed.length){const {error}=await supabase.from("pp_running_intervals").delete().in("id",removed);if(error)throw error;}
      if(intervals.length){const rows=intervals.map(x=>({id:x.id,shift_id:id,packer_code:x.packer_code,product_code:x.product_code||"PPC",start_minute:Number(x.start_minute),end_minute:Number(x.end_minute)}));const {error}=await supabase.from("pp_running_intervals").upsert(rows);if(error)throw error;}
      const {error:staffError}=await supabase.from("pp_shift_staff").upsert({shift_id:id,...staff},{onConflict:"shift_id"});if(staffError)throw staffError;
      const stopRows=[];
      for(const p of timeline)for(const gap of p.gaps){const c=gapChoices[p.id+"-"+gap.start+"-"+gap.end];if(c?.category)stopRows.push({shift_id:id,packer_code:p.id,start_minute:gap.start,end_minute:gap.end,category:c.category,reason_id:c.reason_id&&c.reason_id!=="__manual__"?c.reason_id:null,reason_snapshot:String(c.reason||"").trim()+(String(c.additionalReason||"").trim()?" | Additional: "+String(c.additionalReason).trim():"")});}
      const {data:existingStops,error:stopReadError}=await supabase.from("pp_stoppages").select("id").eq("shift_id",id);if(stopReadError)throw stopReadError;
      if(existingStops?.length){const {error}=await supabase.from("pp_stoppages").delete().eq("shift_id",id);if(error)throw error;}
      if(stopRows.length){const {error}=await supabase.from("pp_stoppages").insert(stopRows);if(error)throw error;}
      setOriginalIntervalIds(intervals.map(x=>x.id));setMessage("Daily running hours and stoppages saved successfully.");
    }catch(e){setMessage("Save failed: "+e.message);}
    finally{setSaving(false);}
  }

  return <section className="pp-prototype pp-compact">
    <div className="section-head"><div><span className="eyebrow">PACKING PLANT · LIVE DATABASE</span><h1>Production &amp; Running Hours</h1><p className="muted">Running hours, stoppages and staff. Production is sourced from dispatch data.</p></div><span className="pill">{canEdit?"Uploader access":"Read-only access"}</span></div>
    <div className="panel pp-control-panel"><div className="mapping-grid pp-shift-controls">
      <label>Business date<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
      <label>Operating period<input value="00:00–24:00 (Full day · 24 hours)" readOnly /></label>
      <label>Select Packer / Loading Unit<select value={selectedArea} onChange={e=>setSelectedArea(e.target.value)}>{RUNNING_AREAS.map(p=><option key={p.id} value={p.id}>{p.name} · Target range {p.minTph}–{p.maxTph} TPH</option>)}</select></label>
    </div></div>
    {timeline.filter(p=>p.id===selectedArea).map(p=><div className="panel" key={p.id}>
      <div className="panel-title"><h3>{p.name} · Target range {p.minTph}–{p.maxTph} TPH</h3><span className="pill">{p.overlap?"Check intervals":"Intervals valid"}</span></div>
      <div className="alert">Production quantity is taken automatically from cement dispatch records. Enter only running intervals and stoppage details.</div>
      <div className="panel-title pp-subhead"><h3>Running intervals</h3><button className="secondary pp-add-interval" type="button" disabled={!canEdit} onClick={()=>addInterval(p.id)}>+ Add running-hours entry</button></div>
      <div className="table-scroll"><table><thead><tr><th>Start</th><th>Stop</th><th>Duration</th><th></th></tr></thead><tbody>
      {p.own.map(x=><tr key={x.id}><td><select className="pp-time-select" aria-label="Select running start time" value={Number(x.start_minute)} disabled={!canEdit} onChange={e=>updateInterval(x.id,"start_minute",Number(e.target.value))}>{TIME_OPTIONS.slice(0,-1).map(n=><option key={n} value={n}>{clock(n)}</option>)}</select></td><td><select className="pp-time-select" aria-label="Select running stop time" value={Number(x.end_minute)} disabled={!canEdit} onChange={e=>updateInterval(x.id,"end_minute",Number(e.target.value))}>{TIME_OPTIONS.filter(n=>n>Number(x.start_minute)).map(n=><option key={n} value={n}>{clock(n)}</option>)}</select></td><td>{fmtH(x.end_minute-x.start_minute)} h</td><td><button className="text-btn" disabled={!canEdit} onClick={()=>removeInterval(x.id)}>Remove</button></td></tr>)}
      {!p.own.length&&<tr><td colSpan="4" className="muted">No running intervals recorded for this unit and date.</td></tr>}</tbody></table></div>
      <div className="pp-summary-grid"><div><span>Recorded running time</span><b>{fmtH(p.running)} h</b></div><div><span>Recorded stoppage time</span><b>{fmtH(p.stoppage)} h</b></div></div>
      <h4 className="pp-subtitle">Stoppage classification</h4>
      {p.gaps.map(g=>{const key=p.id+"-"+g.start+"-"+g.end;const v=gapChoices[key]||{};return <div className="pp-gap-row" key={key}><b>{fromRelative(g.start)}–{fromRelative(g.end)}</b><span>{fmtH(g.end-g.start)} h</span><select disabled={!canEdit} value={v.category||""} onChange={e=>{const r=reasons.find(x=>x.category===e.target.value);setGapChoices(s=>({...s,[key]:{category:e.target.value,reason_id:null,reason:r?.reason||""}}));}}><option value="">Select category</option>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select><select disabled={!canEdit||!v.category} value={v.reason_id||""} onChange={e=>{const r=reasons.find(x=>x.id===e.target.value);setGapChoices(s=>({...s,[key]:{...v,reason_id:r?.id||null,reason:r?.reason||"",additionalReason:v.additionalReason||""}}));}}><option value="">Select predefined reason (optional)</option>{reasons.filter(r=>r.category===v.category).map(r=><option key={r.id} value={r.id}>{r.reason}</option>)}</select><input type="text" disabled={!canEdit||!v.category} value={v.reason_id?(v.additionalReason||""):(v.reason||"")} placeholder={v.reason_id?"Additional reason (optional)":"Or enter stoppage reason manually"} onChange={e=>setGapChoices(s=>({...s,[key]:v.reason_id?{...v,additionalReason:e.target.value}:{...v,reason:e.target.value}}))}/></div>;})}
    </div>)}
    <div className="panel"><h3>Daily Operating Staff</h3><div className="mapping-grid"><label>Packing PLC Operator<input value={staff.packing_plc_operator} disabled={!canEdit} onChange={e=>setStaff(s=>({...s,packing_plc_operator:e.target.value}))}/></label><label>Truck Loading Operator<input value={staff.truck_loading_operator} disabled={!canEdit} onChange={e=>setStaff(s=>({...s,truck_loading_operator:e.target.value}))}/></label><label>Daily Incharge<input value={staff.shift_incharge} disabled={!canEdit} onChange={e=>setStaff(s=>({...s,shift_incharge:e.target.value}))}/></label></div>
      <div className="date-tools"><button className="secondary" onClick={load} disabled={loading||saving}>Reload day</button><button className="primary" onClick={save} disabled={!canEdit||loading||saving}>{saving?"Saving…":"Save daily records"}</button></div>
      {loading&&<p className="muted">Loading saved daily records…</p>}{message&&<div className={message.startsWith("Saved")?"alert":"alert warning"}>{message}</div>}
    </div>
  </section>;
}
