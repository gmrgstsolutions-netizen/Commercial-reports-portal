import React, { useEffect, useMemo, useState } from "react";

const PACKERS = [{id:"P1",name:"Packer 1",tph:120},{id:"P2",name:"Packer 2",tph:120},{id:"P3",name:"Packer 3",tph:240}];
const RUNNING_AREAS = [...PACKERS,{id:"BULK",name:"Bulk Loading",tph:120}];
const CATEGORIES = ["Mechanical","Electrical","Instrumentation","Operational","Planned"];
const today = () => { const d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
const shiftStart = code => ({A:360,B:840,C:1320}[code]);
const clock = m => { const n=((m%1440)+1440)%1440; return String(Math.floor(n/60)).padStart(2,"0")+":"+String(n%60).padStart(2,"0"); };
const toMinute = t => { const [h,m]=String(t||"00:00").split(":").map(Number); return h*60+m; };
const toRelative = (t,code) => { let n=toMinute(t)-shiftStart(code); if(n<0)n+=1440; return n; };
const fromRelative = (n,code) => clock(shiftStart(code)+Number(n));
const fmtH = n => (n/60).toFixed(2);
const uid = () => globalThis.crypto?.randomUUID?.() || "pp-"+Date.now()+"-"+Math.random().toString(36).slice(2);

export default function PackingPlantConnected({supabase,session,profile,shiftInchargeName=""}) {
  const [date,setDate]=useState(today());
  const [shift,setShift]=useState("A");
  const [selectedArea,setSelectedArea]=useState("P1");
  const [shiftId,setShiftId]=useState(null);
  const [production,setProduction]=useState({});
  const [intervals,setIntervals]=useState([]);
  const [originalIntervalIds,setOriginalIntervalIds]=useState([]);
  const [staff,setStaff]=useState({packing_plc_operator:"",truck_loading_operator:"",shift_incharge:shiftInchargeName});
  const [reasons,setReasons]=useState([]);
  const [gapChoices,setGapChoices]=useState({});
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState("");
  const canEdit=["admin","uploader"].includes(profile?.role);
  const start=shiftStart(shift), end=start+480;

  const timeline=useMemo(()=>RUNNING_AREAS.map(p=>{
    const own=intervals.filter(x=>x.packer_code===p.id).map(x=>({...x,startMinute:Number(x.start_minute),endMinute:Number(x.end_minute)})).sort((a,b)=>a.startMinute-b.startMinute);
    let previous=0,running=0,overlap=false; const gaps=[];
    for(const x of own){
      if(x.startMinute<previous || x.endMinute>480 || x.endMinute<=x.startMinute) overlap=true;
      if(x.startMinute>previous)gaps.push({start:previous,end:x.startMinute});
      if(x.startMinute>=previous && x.endMinute<=480)running+=x.endMinute-x.startMinute;
      previous=Math.max(previous,x.endMinute);
    }
    if(previous<480)gaps.push({start:previous,end:480});
    const qty=Number(production[p.id]?.PPC||0)+Number(production[p.id]?.OPC||0);
    const expected=p.tph?running/60*p.tph:0;
    return {...p,own,gaps,running,stoppage:gaps.reduce((s,g)=>s+g.end-g.start,0),qty,expected,util:p.tph&&expected?qty/expected*100:null,overlap};
  }),[intervals,production]);
  const selectedTimeline=timeline.find(p=>p.id===selectedArea)||timeline[0];

  async function load() {
    setLoading(true); setMessage("");
    try {
      const {data:sh,error:se}=await supabase.from("pp_shifts").select("id,status").eq("business_date",date).eq("shift_code",shift).maybeSingle();
      if(se)throw se;
      setShiftId(sh?.id||null);
      if(!sh){setProduction({});setIntervals([]);setOriginalIntervalIds([]);setStaff({packing_plc_operator:"",truck_loading_operator:"",shift_incharge:shiftInchargeName});setGapChoices({});}
      else {
        const [pr,iv,st,sp]=await Promise.all([
          supabase.from("pp_production").select("*").eq("shift_id",sh.id),
          supabase.from("pp_running_intervals").select("*").eq("shift_id",sh.id).order("start_minute"),
          supabase.from("pp_shift_staff").select("*").eq("shift_id",sh.id).maybeSingle(),
          supabase.from("pp_stoppages").select("*").eq("shift_id",sh.id)
        ]);
        for(const x of [pr,iv,st,sp])if(x.error)throw x.error;
        const p={}; for(const row of pr.data||[]){p[row.packer_code]??={PPC:"",OPC:""};p[row.packer_code][row.product_code]=String(row.quantity_mt);}
        setProduction(p);const normalizedIntervals=(iv.data||[]).map(x=>{const entered=["PPC","OPC"].filter(k=>p[x.packer_code]?.[k]!==undefined&&p[x.packer_code]?.[k]!==""&&Number(p[x.packer_code][k])>=0);return x.packer_code!=="BULK"&&entered.length===1?{...x,product_code:entered[0]}:x;});setIntervals(normalizedIntervals);setOriginalIntervalIds((iv.data||[]).map(x=>x.id));
        setStaff({packing_plc_operator:st.data?.packing_plc_operator||"",truck_loading_operator:st.data?.truck_loading_operator||"",shift_incharge:st.data?.shift_incharge||shiftInchargeName});
        const choices={};for(const row of sp.data||[]){const marker=" | Additional: ";const saved=String(row.reason_snapshot||"");const split=saved.indexOf(marker);choices[row.packer_code+"-"+row.start_minute+"-"+row.end_minute]={category:row.category,reason:split>=0?saved.slice(0,split):saved,additionalReason:split>=0?saved.slice(split+marker.length):"",reason_id:row.reason_id};}setGapChoices(choices);
      }
      const {data:rs,error:re}=await supabase.from("pp_stoppage_reasons").select("id,category,reason").eq("is_active",true).order("category").order("reason");
      if(re)throw re;setReasons(rs||[]);
    } catch(e){setMessage("Unable to load shift: "+e.message);}
    finally{setLoading(false);}
  }
  useEffect(()=>{load();},[date,shift]);
  const updateQty=(packer,product,value)=>{setProduction(v=>({...v,[packer]:{...(v[packer]||{PPC:"",OPC:""}),[product]:value}}));if(packer!=="BULK"){const next=["PPC","OPC"].filter(k=>k===product?value!==""&&Number(value)>=0:production[packer]?.[k]!==undefined&&production[packer]?.[k]!==""&&Number(production[packer][k])>=0);if(next.length===1)setIntervals(v=>v.map(x=>x.packer_code===packer?{...x,product_code:next[0]}:x));}};
  const addInterval=packer=>{const entered=["PPC","OPC"].filter(k=>production[packer]?.[k]!==undefined&&production[packer]?.[k]!==""&&Number(production[packer][k])>=0);setIntervals(v=>[...v,{id:uid(),packer_code:packer,product_code:packer==="BULK"?"BULK":entered.length===1?entered[0]:"PPC",start_minute:0,end_minute:480}]);};
  const updateInterval=(id,field,value)=>setIntervals(v=>v.map(x=>x.id===id?{...x,[field]:value}:x));
  const removeInterval=id=>setIntervals(v=>v.filter(x=>x.id!==id));

  async function save() {
    if(!canEdit){setMessage("Your account has read-only access. Contact the administrator for uploader access.");return;}
    if(timeline.some(p=>p.overlap)){setMessage("Correct overlapping or out-of-shift running intervals before saving.");return;}
    for(const p of timeline){
      const unclassified=p.gaps.find(g=>!gapChoices[p.id+"-"+g.start+"-"+g.end]?.category);
      if(unclassified){setMessage(p.name+" stoppage from "+fromRelative(unclassified.start,shift)+" to "+fromRelative(unclassified.end,shift)+" needs a category before saving.");return;} const withoutReason=p.gaps.find(g=>!String(gapChoices[p.id+"-"+g.start+"-"+g.end]?.reason||"").trim()); if(withoutReason){setMessage(p.name+" stoppage from "+fromRelative(withoutReason.start,shift)+" to "+fromRelative(withoutReason.end,shift)+" needs a predefined or manually entered reason before saving.");return;}
    }
    for(const p of RUNNING_AREAS)for(const product of ["PPC","OPC"]){const v=production[p.id]?.[product];if(v!==undefined&&v!==""&&(!Number.isFinite(Number(v))||Number(v)<0)){setMessage("Production quantity must be zero or a positive number.");return;}}
    setSaving(true);setMessage("");
    try{
      let id=shiftId;
      if(!id){
        const {data,error}=await supabase.from("pp_shifts").upsert({business_date:date,shift_code:shift,created_by:session.user.id},{onConflict:"business_date,shift_code"}).select("id").single();
        if(error)throw error;id=data.id;setShiftId(id);
      }
      const prodRows=[];
      for(const p of RUNNING_AREAS)for(const product of ["PPC","OPC"]){const raw=production[p.id]?.[product];if(raw!==undefined&&raw!=="")prodRows.push({shift_id:id,packer_code:p.id,product_code:product,quantity_mt:Number(raw)});}
      const {data:oldProduction,error:oldProductionError}=await supabase.from("pp_production").select("id,packer_code,product_code").eq("shift_id",id);if(oldProductionError)throw oldProductionError;
      const keepKeys=new Set(prodRows.map(x=>x.packer_code+"|"+x.product_code));
      const stale=(oldProduction||[]).filter(x=>!keepKeys.has(x.packer_code+"|"+x.product_code)).map(x=>x.id);
      if(stale.length){const {error}=await supabase.from("pp_production").delete().in("id",stale);if(error)throw error;}
      if(prodRows.length){const {error}=await supabase.from("pp_production").upsert(prodRows,{onConflict:"shift_id,packer_code,product_code"});if(error)throw error;}
      const activeIds=intervals.map(x=>x.id).filter(id=>originalIntervalIds.includes(id));
      const removed=originalIntervalIds.filter(id=>!activeIds.includes(id));
      if(removed.length){const {error}=await supabase.from("pp_running_intervals").delete().in("id",removed);if(error)throw error;}
      if(intervals.length){const rows=intervals.map(x=>({id:x.id,shift_id:id,packer_code:x.packer_code,product_code:x.product_code,start_minute:Number(x.start_minute),end_minute:Number(x.end_minute)}));const {error}=await supabase.from("pp_running_intervals").upsert(rows);if(error)throw error;}
      const {error:staffError}=await supabase.from("pp_shift_staff").upsert({shift_id:id,...staff},{onConflict:"shift_id"});if(staffError)throw staffError;
      const stopRows=[];
      for(const p of timeline)for(const gap of p.gaps){const c=gapChoices[p.id+"-"+gap.start+"-"+gap.end];if(c?.category)stopRows.push({shift_id:id,packer_code:p.id,start_minute:gap.start,end_minute:gap.end,category:c.category,reason_id:c.reason_id&&c.reason_id!=="__manual__"?c.reason_id:null,reason_snapshot:String(c.reason||"").trim()+(String(c.additionalReason||"").trim()?" | Additional: "+String(c.additionalReason).trim():"")});}
      const {data:existingStops,error:stopReadError}=await supabase.from("pp_stoppages").select("id").eq("shift_id",id);if(stopReadError)throw stopReadError;
      if(existingStops?.length){const {error}=await supabase.from("pp_stoppages").delete().eq("shift_id",id);if(error)throw error;}
      if(stopRows.length){const {error}=await supabase.from("pp_stoppages").insert(stopRows);if(error)throw error;}
      setOriginalIntervalIds(intervals.map(x=>x.id));setMessage("Saved successfully to the Packing Plant database.");
    }catch(e){setMessage("Save failed: "+e.message);}
    finally{setSaving(false);}
  }

  return <section className="pp-prototype pp-compact">
    <div className="section-head"><div><span className="eyebrow">PACKING PLANT · LIVE DATABASE</span><h1>Production &amp; Running Hours</h1><p className="muted">Shift production, running intervals, stoppages and staff</p></div><span className="pill">{canEdit?"Uploader access":"Read-only access"}</span></div>
    <div className="panel pp-control-panel"><div className="mapping-grid pp-shift-controls">
      <label>Business date<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
      <label>Shift<select value={shift} onChange={e=>setShift(e.target.value)}><option value="A">A Shift · 06:00–14:00</option><option value="B">B Shift · 14:00–22:00</option><option value="C">C Shift · 22:00–06:00 next day</option></select><small className="pp-control-hint">C shift is assigned to its starting date.</small></label>
      <label>Select Packer / Loading Unit<select value={selectedArea} onChange={e=>setSelectedArea(e.target.value)}>{RUNNING_AREAS.map(p=><option key={p.id} value={p.id}>{p.name} · {p.tph} TPH</option>)}</select></label>
    </div>{shift==="C"&&<div className="alert">C Shift covers {date} 22:00–24:00 and the following date 00:00–06:00.</div>}</div>
    <div className="stats pp-compact-stats"><div className="stat"><span>{selectedTimeline.name} production (MT)</span><b>{selectedTimeline.qty.toFixed(2)}</b></div><div className="stat"><span>Expected production (MT)</span><b>{selectedTimeline.expected.toFixed(2)}</b></div><div className="stat"><span>Unit utilisation</span><b>{selectedTimeline.expected?(selectedTimeline.qty/selectedTimeline.expected*100).toFixed(1)+"%":"N/A"}</b></div></div>
    {timeline.filter(p=>p.id===selectedArea).map(p=><div className="panel" key={p.id}>
      <div className="panel-title"><h3>{p.name} · {p.tph} TPH</h3><span className="pill">{p.overlap?"Check intervals":"Intervals valid"}</span></div>
      <div className="mapping-grid pp-production-grid"><label>PPC production (MT)<input type="number" min="0" step="0.01" value={production[p.id]?.PPC||""} onChange={e=>updateQty(p.id,"PPC",e.target.value)} disabled={!canEdit}/></label><label>OPC production (MT)<input type="number" min="0" step="0.01" value={production[p.id]?.OPC||""} onChange={e=>updateQty(p.id,"OPC",e.target.value)} disabled={!canEdit}/></label><div className="pp-kpi"><span>Combined utilisation (OPC + PPC)</span><b>{p.util===null?"N/A":p.util.toFixed(1)+"%"}</b></div></div>
      <div className="panel-title pp-subhead"><h3>Running intervals</h3><button className="secondary" type="button" disabled={!canEdit||(p.id!=="BULK"&&!["PPC","OPC"].some(k=>production[p.id]?.[k]!==undefined&&production[p.id]?.[k]!==""&&Number(production[p.id][k])>=0))} onClick={()=>addInterval(p.id)}>+ Add interval</button></div>
      <div className="table-scroll"><table><thead><tr><th>Product</th><th>Start</th><th>Stop</th><th>Duration</th><th></th></tr></thead><tbody>
      {p.own.map(x=><tr key={x.id}><td>{p.id==="BULK"?<span>OPC + PPC</span>:(()=>{const entered=["PPC","OPC"].filter(k=>production[p.id]?.[k]!==undefined&&production[p.id]?.[k]!==""&&Number(production[p.id][k])>=0);return entered.length===1?<b>{entered[0]}</b>:<select value={x.product_code} disabled={!canEdit} onChange={e=>updateInterval(x.id,"product_code",e.target.value)}>{entered.map(k=><option key={k} value={k}>{k}</option>)}</select>;})()}</td><td><input type="time" value={fromRelative(x.start_minute,shift)} disabled={!canEdit} onChange={e=>updateInterval(x.id,"start_minute",toRelative(e.target.value,shift))}/></td><td><input type="time" value={fromRelative(x.end_minute%480===0&&x.end_minute!==0?x.end_minute: x.end_minute,shift)} disabled={!canEdit} onChange={e=>{const n=toRelative(e.target.value,shift);updateInterval(x.id,"end_minute",n);}}/></td><td>{fmtH(x.end_minute-x.start_minute)} h</td><td><button className="text-btn" disabled={!canEdit} onClick={()=>removeInterval(x.id)}>Remove</button></td></tr>)}
      {!p.own.length&&<tr><td colSpan="5" className="muted">Enter PPC or OPC production first to add a matching running interval.</td></tr>}{p.id!=="BULK"&&p.own.length>0&&!["PPC","OPC"].some(k=>production[p.id]?.[k]!==undefined&&production[p.id]?.[k]!==""&&Number(production[p.id][k])>=0)&&<tr><td colSpan="5" className="muted">Enter production quantity to assign the running interval product.</td></tr>}</tbody></table></div>
      <div className="pp-summary-grid"><div><span>Running time</span><b>{fmtH(p.running)} h</b></div><div><span>Derived stoppage</span><b>{fmtH(p.stoppage)} h</b></div><div><span>Expected MT</span><b>{p.expected.toFixed(2)}</b></div></div>
      <h4 className="pp-subtitle">Stoppage classification</h4>
      {p.gaps.map(g=>{const key=p.id+"-"+g.start+"-"+g.end;const v=gapChoices[key]||{};return <div className="pp-gap-row" key={key}><b>{fromRelative(g.start,shift)}–{fromRelative(g.end,shift)}</b><span>{fmtH(g.end-g.start)} h</span><select disabled={!canEdit} value={v.category||""} onChange={e=>{const r=reasons.find(x=>x.category===e.target.value);setGapChoices(s=>({...s,[key]:{category:e.target.value,reason_id:null,reason:r?.reason||""}}));}}><option value="">Select category</option>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select><select disabled={!canEdit||!v.category} value={v.reason_id||""} onChange={e=>{const r=reasons.find(x=>x.id===e.target.value);setGapChoices(s=>({...s,[key]:{...v,reason_id:r?.id||null,reason:r?.reason||"",additionalReason:v.additionalReason||""}}));}}><option value="">Select predefined reason (optional)</option>{reasons.filter(r=>r.category===v.category).map(r=><option key={r.id} value={r.id}>{r.reason}</option>)}</select><input type="text" disabled={!canEdit||!v.category} value={v.reason_id?(v.additionalReason||""):(v.reason||"")} placeholder={v.reason_id?"Additional reason (optional)":"Or enter stoppage reason manually"} onChange={e=>setGapChoices(s=>({...s,[key]:v.reason_id?{...v,additionalReason:e.target.value}:{...v,reason:e.target.value}}))}/></div>;})}
    </div>)}
    <div className="panel"><h3>Common shift staff</h3><div className="mapping-grid"><label>Packing PLC Operator<input value={staff.packing_plc_operator} disabled={!canEdit} onChange={e=>setStaff(s=>({...s,packing_plc_operator:e.target.value}))}/></label><label>Truck Loading Operator<input value={staff.truck_loading_operator} disabled={!canEdit} onChange={e=>setStaff(s=>({...s,truck_loading_operator:e.target.value}))}/></label><label>Shift Incharge<input value={staff.shift_incharge} disabled={!canEdit} onChange={e=>setStaff(s=>({...s,shift_incharge:e.target.value}))}/></label></div>
      <div className="date-tools"><button className="secondary" onClick={load} disabled={loading||saving}>Reload shift</button><button className="primary" onClick={save} disabled={!canEdit||loading||saving}>{saving?"Saving…":"Save shift to database"}</button></div>
      {loading&&<p className="muted">Loading saved shift…</p>}{message&&<div className={message.startsWith("Saved")?"alert":"alert warning"}>{message}</div>}
    </div>
  </section>;
}
