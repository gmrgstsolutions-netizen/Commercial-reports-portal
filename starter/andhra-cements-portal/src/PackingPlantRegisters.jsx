import React, { useMemo, useState } from "react";

const CATEGORIES = ["Mechanical", "Electrical", "Instrumentation", "Operational", "Planned"];
const today = "2026-11-21";
const demoEmployees = [
  { id: 1, name: "Demo Employee 1", role: "Packer Operator" },
  { id: 2, name: "Demo Employee 2", role: "Loading Operator" },
  { id: 3, name: "Demo Employee 3", role: "Bulk Loading Operator" },
  { id: 4, name: "Demo Employee 4", role: "Belt Helper" },
];
const demoReasons = [
  { id: 1, category: "Mechanical", reason: "Conveyor belt maintenance", active: true },
  { id: 2, category: "Electrical", reason: "Motor electrical fault", active: true },
  { id: 3, category: "Instrumentation", reason: "Sensor fault", active: true },
  { id: 4, category: "Operational", reason: "No truck availability", active: true },
  { id: 5, category: "Planned", reason: "Scheduled preventive maintenance", active: true },
];

function monthKey(date) { return String(date || "").slice(0, 7); }
function dateKey(date) { return String(date || "").slice(0, 10); }
function isHoliday(date, holidays) { return holidays.some(h => h.date === date && h.active); }

export default function PackingPlantRegisters() {
  const [section, setSection] = useState("Truck Loading");
  const [loadDate, setLoadDate] = useState(today);
  const [loadShift, setLoadShift] = useState("A");
  const [vehicle, setVehicle] = useState("");
  const [loadProduct, setLoadProduct] = useState("PPC");
  const [loadQty, setLoadQty] = useState("");
  const [loadRemarks, setLoadRemarks] = useState("");
  const [loads, setLoads] = useState([]);
  const [employees, setEmployees] = useState(demoEmployees);
  const [employeeName, setEmployeeName] = useState("");
  const [employeeRole, setEmployeeRole] = useState("Packer Operator");
  const [attendanceDate, setAttendanceDate] = useState(today);
  const [attendanceShift, setAttendanceShift] = useState("A");
  const [presentIds, setPresentIds] = useState([1, 2]);
  const [holidays, setHolidays] = useState([{ id: 1, date: "2026-11-14", description: "Demo festival", active: true }]);
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayDescription, setHolidayDescription] = useState("");
  const [reasons, setReasons] = useState(demoReasons);
  const [reasonCategory, setReasonCategory] = useState("Mechanical");
  const [reasonText, setReasonText] = useState("");
  const [editingReason, setEditingReason] = useState(null);
  const [notice, setNotice] = useState("Demonstration only. Nothing is saved to Supabase.");

  const selectedHoliday = isHoliday(attendanceDate, holidays);
  const attendanceSummary = useMemo(() => employees.map(employee => {
    const present = presentIds.includes(employee.id);
    const regularDays = presentIds.includes(employee.id) && !selectedHoliday ? 1 : 0;
    const previousRegular = Number(employee.demoPreviousRegularDays || 0);
    const counted = previousRegular + regularDays;
    return { ...employee, present, regularDays: counted, classification: present ? (selectedHoliday && counted >= 7 ? "Extra Duty" : "Actual Duty") : "Absent" };
  }), [employees, presentIds, selectedHoliday]);

  const monthAttendanceCount = useMemo(() => {
    // Demo counter illustrates the same-calendar-month threshold; real classification
    // will be calculated from the complete saved attendance ledger, not this preview.
    return employees.map(e => ({ id: e.id, days: Number(e.demoPreviousRegularDays || 0) + (presentIds.includes(e.id) && !selectedHoliday ? 1 : 0) }));
  }, [employees, presentIds, selectedHoliday]);

  const addLoad = () => {
    const qty = Number(loadQty);
    if (!vehicle.trim() || !Number.isFinite(qty) || qty <= 0) {
      setNotice("Enter a vehicle number and a loading quantity greater than zero.");
      return;
    }
    setLoads(rows => [...rows, { id: Date.now(), date: loadDate, shift: loadShift, vehicle: vehicle.trim().toUpperCase(), product: loadProduct, quantity: qty, remarks: loadRemarks.trim() }]);
    setVehicle(""); setLoadQty(""); setLoadRemarks("");
    setNotice("Truck row added to this local demonstration register only.");
  };
  const addEmployee = () => {
    if (!employeeName.trim()) return setNotice("Enter an employee name.");
    setEmployees(rows => [...rows, { id: Date.now(), name: employeeName.trim(), role: employeeRole }]);
    setEmployeeName("");
    setNotice("Demo employee added locally. The approved employee master will be loaded later.");
  };
  const addHoliday = () => {
    if (!holidayDate) return setNotice("Select a holiday/festival date.");
    setHolidays(rows => [...rows, { id: Date.now(), date: holidayDate, description: holidayDescription.trim() || "Holiday / Festival", active: true }]);
    setHolidayDate(""); setHolidayDescription("");
  };
  const saveReason = () => {
    if (!reasonText.trim()) return setNotice("Enter a stoppage reason.");
    if (editingReason) {
      setReasons(rows => rows.map(r => r.id === editingReason ? { ...r, category: reasonCategory, reason: reasonText.trim() } : r));
    } else {
      setReasons(rows => [...rows, { id: Date.now(), category: reasonCategory, reason: reasonText.trim(), active: true }]);
    }
    setEditingReason(null); setReasonText("");
    setNotice("Reason master changed in local demonstration state only.");
  };
  const startEditReason = r => { setEditingReason(r.id); setReasonCategory(r.category); setReasonText(r.reason); };
  const loadTotal = loads.reduce((sum, row) => sum + row.quantity, 0);
  const shiftTotal = loads.filter(x => x.date === loadDate && x.shift === loadShift).reduce((sum, row) => sum + row.quantity, 0);
  const shiftCount = loads.filter(x => x.date === loadDate && x.shift === loadShift).length;

  return <section className="pp-registers">
    <div className="section-head"><div><span className="eyebrow">PACKING PLANT · DEVELOPMENT PREVIEW</span><h1>Shift Registers &amp; Masters</h1><p className="muted">Truck loading, attendance and stoppage reasons · local demonstration only</p></div><span className="pill">Not connected to database</span></div>
    <div className="alert warning">Do not enter actual plant records. All changes below remain temporary in this browser session and are not saved.</div>
    <div className="pp-register-tabs">
      {["Truck Loading", "Attendance", "Stoppage Reason Master"].map(name=><button type="button" key={name} className={section===name?"primary":"secondary"} onClick={()=>setSection(name)}>{name}</button>)}
    </div>

    {section === "Truck Loading" && <>
      <div className="panel">
        <div className="panel-title"><h3>Individual truck loading entry</h3></div>
        <div className="mapping-grid pp-register-grid">
          <label>Date<input type="date" value={loadDate} onChange={e=>setLoadDate(e.target.value)}/></label>
          <label>Shift<select value={loadShift} onChange={e=>setLoadShift(e.target.value)}><option value="A">A Shift</option><option value="B">B Shift</option><option value="C">C Shift</option></select></label>
          <label>Vehicle number<input value={vehicle} onChange={e=>setVehicle(e.target.value)} placeholder="e.g. APXX1234"/></label>
          <label>Product<select value={loadProduct} onChange={e=>setLoadProduct(e.target.value)}><option>PPC</option><option>OPC</option></select></label>
          <label>Loading quantity (MT)<input type="number" min="0" step="0.01" value={loadQty} onChange={e=>setLoadQty(e.target.value)} placeholder="Quantity in MT"/></label>
          <label>Remarks (optional)<input value={loadRemarks} onChange={e=>setLoadRemarks(e.target.value)} placeholder="Remarks"/></label>
        </div>
        <button className="primary" type="button" onClick={addLoad}>Add truck entry</button>
      </div>
      <div className="stats">
        <div className="stat"><span>Trucks · selected shift</span><b>{shiftCount}</b></div>
        <div className="stat"><span>Quantity · selected shift (MT)</span><b>{shiftTotal.toFixed(2)}</b></div>
        <div className="stat"><span>Demo register total (MT)</span><b>{loadTotal.toFixed(2)}</b></div>
      </div>
      <div className="panel"><div className="panel-title"><h3>Truck loading register</h3><span className="pill">{loads.length} entries</span></div>
        <div className="table-scroll"><table><thead><tr><th>Date</th><th>Shift</th><th>Vehicle</th><th>Product</th><th className="num">Quantity MT</th><th>Remarks</th><th></th></tr></thead><tbody>
          {loads.map(row=><tr key={row.id}><td>{row.date}</td><td>{row.shift}</td><td>{row.vehicle}</td><td>{row.product}</td><td className="num">{row.quantity.toFixed(2)}</td><td>{row.remarks || "—"}</td><td><button type="button" className="text-btn" onClick={()=>setLoads(rows=>rows.filter(x=>x.id!==row.id))}>Remove</button></td></tr>)}
          {!loads.length && <tr><td colSpan="7" className="muted">No demonstration truck entries yet.</td></tr>}
        </tbody></table></div>
      </div>
    </>}

    {section === "Attendance" && <>
      <div className="panel">
        <div className="panel-title"><h3>Attendance by shift</h3></div>
        <div className="mapping-grid pp-register-grid">
          <label>Attendance date<input type="date" value={attendanceDate} onChange={e=>setAttendanceDate(e.target.value)}/></label>
          <label>Shift<select value={attendanceShift} onChange={e=>setAttendanceShift(e.target.value)}><option value="A">A Shift</option><option value="B">B Shift</option><option value="C">C Shift</option></select></label>
        </div>
        {selectedHoliday && <div className="alert">This date is marked as a holiday/festival. Holiday attendance is Extra Duty only when the employee has completed at least 7 regular working-day attendances in this same calendar month.</div>}
        <div className="table-scroll"><table><thead><tr><th>Employee</th><th>Staff category</th><th>Present?</th><th>Preview classification</th></tr></thead><tbody>
          {attendanceSummary.map(row=><tr key={row.id}><td>{row.name}</td><td>{row.role}</td><td><input aria-label={"Present "+row.name} type="checkbox" checked={row.present} onChange={e=>setPresentIds(ids=>e.target.checked?[...ids,row.id]:ids.filter(id=>id!==row.id))}/></td><td>{row.classification}</td></tr>)}
        </tbody></table></div>
        <p className="footnote">Employees not marked present are treated as Absent according to the effective shift schedule. No leave or weekly-off category is added.</p>
        <div className="alert warning">The seven-day count shown here is a demonstration preview. The live system must count the employee's saved regular working-day attendances across the whole calendar month and re-evaluate earlier holiday classifications when later attendances are entered.</div>
      </div>
      <div className="panel">
        <div className="panel-title"><h3>Employee list · temporary examples</h3></div>
        <div className="mapping-grid pp-register-grid">
          <label>Employee name<input value={employeeName} onChange={e=>setEmployeeName(e.target.value)} placeholder="Enter name"/></label>
          <label>Staff category<select value={employeeRole} onChange={e=>setEmployeeRole(e.target.value)}>{["Packer Operator","Loading Operator","Bulk Loading Operator","Belt Helper","Packing PLC Operator","Truck Loading Operator","Shift Incharge"].map(r=><option key={r}>{r}</option>)}</select></label>
        </div>
        <button type="button" className="secondary" onClick={addEmployee}>Add demo employee</button>
        <div className="table-scroll"><table><thead><tr><th>Employee</th><th>Category</th><th>Regular attended days this month · demo count</th></tr></thead><tbody>{employees.map(e=><tr key={e.id}><td>{e.name}</td><td>{e.role}</td><td>{monthAttendanceCount.find(x=>x.id===e.id)?.days || 0}</td></tr>)}</tbody></table></div>
      </div>
      <div className="panel">
        <div className="panel-title"><h3>Public holidays &amp; festivals</h3></div>
        <div className="mapping-grid pp-register-grid">
          <label>Holiday date<input type="date" value={holidayDate} onChange={e=>setHolidayDate(e.target.value)}/></label>
          <label>Description<input value={holidayDescription} onChange={e=>setHolidayDescription(e.target.value)} placeholder="Holiday / festival name"/></label>
        </div>
        <button type="button" className="secondary" onClick={addHoliday}>Add holiday date</button>
        <div className="table-scroll"><table><thead><tr><th>Date</th><th>Description</th><th>Status</th><th></th></tr></thead><tbody>{holidays.map(h=><tr key={h.id}><td>{h.date}</td><td>{h.description}</td><td>{h.active?"Active":"Inactive"}</td><td><button className="text-btn" type="button" onClick={()=>setHolidays(rows=>rows.map(x=>x.id===h.id?{...x,active:!x.active}:x))}>{h.active?"Deactivate":"Activate"}</button></td></tr>)}</tbody></table></div>
      </div>
    </>}

    {section === "Stoppage Reason Master" && <>
      <div className="panel">
        <div className="panel-title"><h3>{editingReason ? "Edit stoppage reason" : "Add stoppage reason"}</h3></div>
        <div className="mapping-grid pp-register-grid">
          <label>Fixed category<select value={reasonCategory} onChange={e=>setReasonCategory(e.target.value)}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></label>
          <label>Reason<input value={reasonText} onChange={e=>setReasonText(e.target.value)} placeholder="Enter reason"/></label>
        </div>
        <div className="pp-register-actions"><button type="button" className="primary" onClick={saveReason}>{editingReason?"Update reason":"Add reason"}</button>{editingReason && <button type="button" className="secondary" onClick={()=>{setEditingReason(null);setReasonText("");}}>Cancel</button>}</div>
      </div>
      <div className="panel"><div className="panel-title"><h3>Stoppage reasons</h3><span className="pill">{reasons.filter(r=>r.active).length} active</span></div>
        {CATEGORIES.map(category=><div className="pp-reason-group" key={category}><h4>{category}</h4><div className="table-scroll"><table><thead><tr><th>Reason</th><th>Status</th><th>Actions</th></tr></thead><tbody>
          {reasons.filter(r=>r.category===category).map(r=><tr key={r.id}><td>{r.reason}</td><td>{r.active?"Active":"Inactive"}</td><td><button type="button" className="text-btn" onClick={()=>startEditReason(r)}>Edit</button><button type="button" className="text-btn" onClick={()=>setReasons(rows=>rows.map(x=>x.id===r.id?{...x,active:!x.active}:x))}>{r.active?"Deactivate":"Activate"}</button></td></tr>)}
          {!reasons.some(r=>r.category===category) && <tr><td colSpan="3" className="muted">No reasons added.</td></tr>}
        </tbody></table></div></div>)}
        <p className="footnote">Categories are fixed: Mechanical, Electrical, Instrumentation, Operational and Planned. Admin maintains reasons; referenced historical stoppages must retain category and reason snapshots.</p>
      </div>
    </>}
    <p className="footnote">{notice}</p>
  </section>;
}
