import React, { useMemo, useState } from "react";

const PACKERS = [
  { id: "P1", name: "Packer 1", tph: 120 },
  { id: "P2", name: "Packer 2", tph: 120 },
  { id: "P3", name: "Packer 3", tph: 240 },
];
const SHIFTS = {
  A: { label: "A Shift", start: "06:00", end: "14:00" },
  B: { label: "B Shift", start: "14:00", end: "22:00" },
  C: { label: "C Shift", start: "22:00", end: "30:00" },
};
const CATEGORIES = ["Mechanical", "Electrical", "Instrumentation", "Operational", "Planned"];
const sampleIntervals = [
  { id: 1, packer: "P1", product: "PPC", start: "22:00", end: "23:30" },
  { id: 2, packer: "P1", product: "OPC", start: "23:30", end: "02:00" },
  { id: 3, packer: "P1", product: "PPC", start: "02:30", end: "06:00" },
];

function toMinute(time) {
  const [h, m] = String(time || "00:00").split(":").map(Number);
  return h * 60 + m;
}
function clockLabel(minute) {
  const normalized = ((minute % 1440) + 1440) % 1440;
  return String(Math.floor(normalized / 60)).padStart(2, "0") + ":" + String(normalized % 60).padStart(2, "0");
}
function intervalStartMinute(time, shiftStart) {
  let value = toMinute(time);
  if (value < shiftStart) value += 1440;
  return value;
}
function hours(minutes) {
  return (minutes / 60).toFixed(2);
}

export default function PackingPlantPrototype() {
  const [businessDate, setBusinessDate] = useState("2026-11-21");
  const [shiftCode, setShiftCode] = useState("C");
  const [intervals, setIntervals] = useState(sampleIntervals);
  const [production, setProduction] = useState({ P1: { PPC: "12", OPC: "8" }, P2: { PPC: "", OPC: "" }, P3: { PPC: "", OPC: "" } });
  const [gapClassifications, setGapClassifications] = useState({});
  const [staff, setStaff] = useState({ plc: "", loading: "", incharge: "" });
  const [message, setMessage] = useState("Demonstration entries only. Nothing is saved to Supabase.");

  const shift = SHIFTS[shiftCode];
  const shiftStart = toMinute(shift.start);
  const shiftEnd = shiftStart + 480;
  const timeline = useMemo(() => {
    return PACKERS.map(packer => {
      const own = intervals.filter(x => x.packer === packer.id).map(x => ({
        ...x,
        startMinute: intervalStartMinute(x.start, shiftStart),
        endMinute: intervalStartMinute(x.end, shiftStart),
      })).map(x => ({ ...x, endMinute: x.endMinute <= x.startMinute ? x.endMinute + 1440 : x.endMinute }))
        .sort((a, b) => a.startMinute - b.startMinute);
      let previous = shiftStart;
      let runningMinutes = 0;
      const gaps = [];
      let overlap = false;
      for (const item of own) {
        if (item.startMinute < shiftStart || item.endMinute > shiftEnd || item.endMinute <= item.startMinute) overlap = true;
        if (item.startMinute < previous) overlap = true;
        if (item.startMinute > previous) gaps.push({ start: previous, end: item.startMinute });
        if (item.startMinute >= previous && item.endMinute <= shiftEnd) runningMinutes += item.endMinute - item.startMinute;
        previous = Math.max(previous, item.endMinute);
      }
      if (previous < shiftEnd) gaps.push({ start: previous, end: shiftEnd });
      const stoppageMinutes = gaps.reduce((sum, gap) => sum + Math.max(0, gap.end - gap.start), 0);
      const qty = Number(production[packer.id]?.PPC || 0) + Number(production[packer.id]?.OPC || 0);
      const expected = (runningMinutes / 60) * packer.tph;
      return { ...packer, own, gaps, runningMinutes, stoppageMinutes, qty, expected, utilization: expected > 0 ? (qty / expected) * 100 : null, overlap };
    });
  }, [intervals, production, shiftStart, shiftEnd]);

  const totalActual = timeline.reduce((sum, x) => sum + x.qty, 0);
  const totalExpected = timeline.reduce((sum, x) => sum + x.expected, 0);
  const addInterval = packer => setIntervals(items => [...items, { id: Date.now() + Math.random(), packer, product: "PPC", start: shift.start, end: shift.end }]);
  const updateInterval = (id, field, value) => setIntervals(items => items.map(x => x.id === id ? { ...x, [field]: value } : x));
  const removeInterval = id => setIntervals(items => items.filter(x => x.id !== id));
  const updateQty = (packer, product, value) => setProduction(p => ({ ...p, [packer]: { ...p[packer], [product]: value } }));

  return <section className="pp-prototype">
    <div className="section-head">
      <div><span className="eyebrow">PACKING PLANT · DEVELOPMENT PREVIEW</span><h1>Production &amp; Running Hours</h1><p className="muted">First screen prototype · local demonstration data only</p></div>
      <span className="pill">Not connected to database</span>
    </div>
    <div className="alert warning">Prototype only: edits stay in this browser session and are not saved. Do not enter actual production data here.</div>
    <div className="panel">
      <div className="mapping-grid pp-shift-controls">
        <label>Shift business date<input type="date" value={businessDate} onChange={e=>setBusinessDate(e.target.value)}/></label>
        <label>Shift<select value={shiftCode} onChange={e=>{setShiftCode(e.target.value);setIntervals([]);setGapClassifications({});}}>{Object.entries(SHIFTS).map(([key,value])=><option key={key} value={key}>{value.label}</option>)}</select></label>
        <div className="pp-shift-window"><span>Shift window</span><b>{shift.start} – {shiftCode === "C" ? "06:00 next day" : shift.end}</b><small>8 hours · 24-hour clock</small></div>
      </div>
      {shiftCode === "C" && <div className="alert">C Shift business date {businessDate}: Part 1 is {businessDate} 22:00–24:00; Part 2 is the following calendar date 00:00–06:00. Both parts remain one shift.</div>}
    </div>
    <div className="stats">
      <div className="stat"><span>Total production (MT)</span><b>{totalActual.toLocaleString("en-IN",{maximumFractionDigits:2})}</b></div>
      <div className="stat"><span>Expected production (MT)</span><b>{totalExpected.toLocaleString("en-IN",{maximumFractionDigits:2})}</b></div>
      <div className="stat"><span>Plant utilisation</span><b>{totalExpected > 0 ? (totalActual / totalExpected * 100).toFixed(1) + "%" : "N/A"}</b></div>
    </div>
    {timeline.map(p => <div className="panel" key={p.id}>
      <div className="panel-title"><h3>{p.name} · {p.tph} TPH</h3><span className="pill">{p.overlap ? "Check intervals" : "Timeline calculated"}</span></div>
      <div className="mapping-grid pp-production-grid">
        <label>PPC production (MT)<input type="number" min="0" step="0.01" value={production[p.id].PPC} onChange={e=>updateQty(p.id,"PPC",e.target.value)}/></label>
        <label>OPC production (MT)<input type="number" min="0" step="0.01" value={production[p.id].OPC} onChange={e=>updateQty(p.id,"OPC",e.target.value)}/></label>
        <div className="pp-kpi"><span>Combined utilisation</span><b>{p.utilization === null ? "N/A" : p.utilization.toFixed(1)+"%"}</b></div>
      </div>
      <div className="panel-title pp-subhead"><h3>Running intervals</h3><button className="secondary" type="button" onClick={()=>addInterval(p.id)}>+ Add interval</button></div>
      <div className="table-scroll"><table><thead><tr><th>Product</th><th>Start</th><th>Stop</th><th>Duration</th><th></th></tr></thead><tbody>
        {p.own.map(item=><tr key={item.id}><td><select value={item.product} onChange={e=>updateInterval(item.id,"product",e.target.value)}><option>PPC</option><option>OPC</option></select></td>
          <td><input type="time" value={item.start} onChange={e=>updateInterval(item.id,"start",e.target.value)}/></td>
          <td><input type="time" value={item.end} onChange={e=>updateInterval(item.id,"end",e.target.value)}/></td>
          <td>{item.endMinute > item.startMinute ? hours(item.endMinute-item.startMinute)+" h" : "—"}</td>
          <td><button className="text-btn" type="button" onClick={()=>removeInterval(item.id)}>Remove</button></td></tr>)}
        {!p.own.length && <tr><td colSpan="5" className="muted">No running intervals entered.</td></tr>}
      </tbody></table></div>
      {p.overlap && <div className="alert error">One or more intervals overlap or fall outside this shift. Correct them before finalization.</div>}
      <div className="pp-summary-grid">
        <div><span>Running time</span><b>{hours(p.runningMinutes)} h</b></div>
        <div><span>Derived stoppage</span><b>{hours(p.stoppageMinutes)} h</b></div>
        <div><span>Expected MT</span><b>{p.expected.toFixed(2)}</b></div>
      </div>
      <h4 className="pp-subtitle">Derived stoppage gaps · classify each gap when running entries are complete</h4>
      {p.gaps.length ? p.gaps.map((gap,index)=>{
        const key=p.id+"-"+gap.start+"-"+gap.end;
        const chosen=gapClassifications[key]||{};
        return <div className="pp-gap-row" key={key}>
          <b>{clockLabel(gap.start)}–{clockLabel(gap.end)}</b><span>{hours(gap.end-gap.start)} h</span>
          <select value={chosen.category||""} onChange={e=>setGapClassifications(v=>({...v,[key]:{category:e.target.value,reason:""}}))}><option value="">Select category</option>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select>
          <input placeholder="Enter/select reason (demo)" value={chosen.reason||""} onChange={e=>setGapClassifications(v=>({...v,[key]:{...chosen,reason:e.target.value}}))}/>
        </div>;
      }) : <p className="muted">No stoppage gaps detected for the entered intervals.</p>}
    </div>)}
    <div className="panel">
      <h3>Common shift staff</h3>
      <div className="mapping-grid">
        <label>Packing PLC Operator<input value={staff.plc} onChange={e=>setStaff(s=>({...s,plc:e.target.value}))} placeholder="Employee name"/></label>
        <label>Truck Loading Operator<input value={staff.loading} onChange={e=>setStaff(s=>({...s,loading:e.target.value}))} placeholder="Employee name"/></label>
        <label>Shift Incharge<input value={staff.incharge} onChange={e=>setStaff(s=>({...s,incharge:e.target.value}))} placeholder="Employee name"/></label>
      </div>
      <div className="alert warning">Save, approval, employee master, attendance, truck loading and final reports will be connected only after the schema and permissions are reviewed.</div>
      <button className="primary" type="button" onClick={()=>setMessage("Prototype validation only. No data was saved.")}>Validate demonstration entries</button>
      <p className="footnote">{message}</p>
    </div>
  </section>;
}
