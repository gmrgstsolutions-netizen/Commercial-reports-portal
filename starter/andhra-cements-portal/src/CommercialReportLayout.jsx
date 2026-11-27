import React from "react";

const n = v => Number(v ?? 0);
const fmt = v => n(v).toLocaleString("en-IN",{maximumFractionDigits:2});
const date = v => {
  if(!v) return "—";
  const s=String(v).slice(0,10);
  const m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? m[3]+"-"+m[2]+"-"+m[1] : String(v);
};
const text = v => v===null||v===undefined||v==="" ? "—" : String(v);
const pct = (v,t) => n(t) ? (n(v)*100/n(t)).toFixed(2)+"%" : "—";
const monthLabel = v => { if(!v) return "—"; const d=new Date(String(v).slice(0,10)+"T00:00:00"); return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString("en-IN",{month:"short",year:"numeric"}); };
const Panel = ({title,sub,children}) => <div className="panel cr-panel"><div className="panel-title"><h3>{title}</h3>{sub&&<span className="pill">{sub}</span>}</div>{children}</div>;
function Table({headers,rows,totals,firstLeft=1,small=false,groups=null}) {
  return <div className="table-scroll cr-scroll"><table className={small?"cr-table cr-small":"cr-table"}><thead>{groups&&<tr className="cr-group-head">{groups.map((g,i)=><th key={i} colSpan={g.span}>{g.label}</th>)}</tr>}<tr>{headers.map((h,i)=><th key={i} className={i>=firstLeft?"num":""}>{h}</th>)}</tr></thead><tbody>
    {rows.map((r,i)=><tr key={i}>{r.map((v,j)=><td key={j} className={j>=firstLeft?"num":""}>{v===null||v===undefined?"—":v}</td>)}</tr>)}
    {totals&&<tr className="total">{totals.map((v,i)=><td key={i} className={i>=firstLeft?"num":""}>{v??""}</td>)}</tr>}
  </tbody></table></div>;
}
function Title({children,sub}) { return <div className="cr-report-title"><b>{children}</b>{sub&&<small>{sub}</small>}</div>; }

function ProductWise({data}) {
  const raw=data?.products||[];
  const groups=[["OPC",raw.filter(x=>String(x.product_code||"").toUpperCase().startsWith("OPC"))],["PPC",raw.filter(x=>String(x.product_code||"").toUpperCase().startsWith("PPC"))],["OTHER",raw.filter(x=>!String(x.product_code||"").toUpperCase().startsWith("OPC")&&!String(x.product_code||"").toUpperCase().startsWith("PPC"))]];
  const totals=rows=>rows.reduce((t,r)=>({d:t.d+n(r.on_date_qty),m:t.m+n(r.mtd_qty),y:t.y+n(r.ytd_qty)}),{d:0,m:0,y:0});
  const clinker=data?.clinker||{};
  const all=totals(raw);
  return <Panel title="DISPATCH REPORT" sub={date(data?.report_date)+" · Qty in MT"}>
    <Title sub={"Report date: "+date(data?.report_date)}>DISPATCH REPORT</Title>
    {groups.map(([name,items])=><div className="cr-section" key={name}><h4>{name} CEMENT</h4><Table headers={["Product","On Date (MT)","MTD (MT)","YTD (MT)"]} firstLeft={1} rows={items.map(x=>[text(x.product_code),fmt(x.on_date_qty),fmt(x.mtd_qty),fmt(x.ytd_qty)])} totals={items.length?["Sub-Total",fmt(totals(items).d),fmt(totals(items).m),fmt(totals(items).y)]:null}/></div>)}
    <Table headers={["Product","On Date (MT)","MTD (MT)","YTD (MT)"]} rows={[]} totals={["Grand Total",fmt(all.d),fmt(all.m),fmt(all.y)]}/>
    <Table headers={["Product","On Date (MT)","MTD (MT)","YTD (MT)"]} rows={[]} totals={["Clinker",fmt(clinker.on_date_qty),fmt(clinker.mtd_qty),fmt(clinker.ytd_qty)]}/>
  </Panel>;
}
function StateDistrict({data}) {
  const regions=data?.regions||[];
  const preferred=["ANDHRA PRADESH","TELANGANA","TAMILNADU","TAMIL NADU","KARNATAKA","CHHATTISGARH"];
  const states=[...new Set(regions.map(r=>r.state_name||"UNMAPPED STATE"))].sort((a,b)=>{const x=preferred.indexOf(a),y=preferred.indexOf(b);return x>=0&&y>=0?x-y:x>=0?-1:y>=0?1:a.localeCompare(b);});
  const totals=rows=>rows.reduce((t,r)=>({d:t.d+n(r.on_date_qty),m:t.m+n(r.mtd_qty),y:t.y+n(r.ytd_qty)}),{d:0,m:0,y:0});
  const grand=totals(regions);
  const rows=[];
  for(const state of states){const list=regions.filter(r=>(r.state_name||"UNMAPPED STATE")===state).sort((a,b)=>String(a.district_name).localeCompare(String(b.district_name)));const st=totals(list);rows.push([<b>{state}</b>,fmt(st.d),fmt(st.m),fmt(st.y),pct(st.y,grand.y)]);for(const r of list)rows.push([text(r.district_name),fmt(r.on_date_qty),fmt(r.mtd_qty),fmt(r.ytd_qty),pct(r.ytd_qty,grand.y)]);}
  return <Panel title="CEMENT & CLINKER DISPATCH DETAILS" sub={date(data?.report_date)}><Title sub={date(data?.report_date)}>CEMENT &amp; CLINKER DISPATCH DETAILS</Title><Table headers={["DISTRICT","ON DATE (MT)","MTD (MT)","YTD (MT)","Dispatch Share %"]} rows={rows} totals={["Grand Total",fmt(grand.d),fmt(grand.m),fmt(grand.y),"100.00%"]}/><div className="cr-section"><h4>PRODUCT-WISE DISPATCH</h4><Table headers={["Product","On Date (MT)","MTD (MT)","YTD (MT)","Dispatch Share %"]} rows={(data?.products||[]).map(r=>[text(r.product_code),fmt(r.on_date_qty),fmt(r.mtd_qty),fmt(r.ytd_qty),pct(r.ytd_qty,totals(data?.products||[]).y)])} totals={["Grand Total",fmt(totals(data?.products||[]).d),fmt(totals(data?.products||[]).m),fmt(totals(data?.products||[]).y),"100.00%"]}/><Table headers={["Product","On Date (MT)","MTD (MT)","YTD (MT)"]} rows={[]} totals={["CLINKER",fmt(data?.clinker?.on_date_qty),fmt(data?.clinker?.mtd_qty),fmt(data?.clinker?.ytd_qty)]}/></div></Panel>;
}
function Transporter({data}) {
  const part=(title,rows,total,key)=> <div className="cr-section"><h4>{title}</h4><Table headers={[key,"On Date (MT)","MTD (MT)","YTD (MT)"]} rows={(rows||[]).map(r=>[text(r[key==="Transporter"?"transporter":"transporter_code"]),fmt(r.on_date_qty),fmt(r.mtd_qty),fmt(r.ytd_qty)])} totals={total?["Grand Total",fmt(total.on_date_qty),fmt(total.mtd_qty),fmt(total.ytd_qty)]:null}/></div>;
  return <Panel title="DISPATCHES - TRANSPORTER WISE" sub={date(data?.report_date)+" · Qty in MT"}><Title sub={"FY: "+String(data?.fy_start||"").slice(0,4)}>DISPATCHES - TRANSPORTER WISE</Title>{part("CEMENT - TRANSPORTER WISE",data?.cement_rows,data?.cement_totals,"Transporter")}{part("CLINKER - TRANSPORTER WISE",data?.clinker_rows,data?.clinker_totals,"Transporter Code")}</Panel>;
}
function TransporterDay({data}) {
  const products=data?.products||[], rows=data?.rows||[];
  const states=[...new Set(rows.map(r=>r.state||"Not Available"))];
  const body=[];const sums=products.map(()=>0);let grandC=0,grandK=0;
  for(const state of states){
    const sr=rows.filter(r=>(r.state||"Not Available")===state);
    const st=products.map(p=>sr.reduce((a,r)=>a+n(r.cement_quantities?.[p.product_code]),0));
    const sc=sr.reduce((a,r)=>a+n(r.cement_total),0),sk=sr.reduce((a,r)=>a+n(r.clinker_qty),0);
    for(const r of sr)body.push([state,text(r.district),text(r.transporter),...products.map(p=>n(r.cement_quantities?.[p.product_code])?fmt(r.cement_quantities[p.product_code]):"—"),fmt(r.cement_total),n(r.clinker_qty)?fmt(r.clinker_qty):"—"]);
    body.push([<b>{state} TOTAL</b>,"","",...st.map(fmt),fmt(sc),fmt(sk)]);
    products.forEach((p,i)=>sums[i]+=st[i]);grandC+=sc;grandK+=sk;
  }
  return <Panel title="TRANSPORTER - DAY WISE" sub={date(data?.report_date)+" · Qty in MT"}><Table headers={["State","District","Transporter",...products.map(p=>p.product_name||p.product_code),"Total","Clinker"]} firstLeft={3} rows={body} totals={["Grand Total","","",...sums.map(fmt),fmt(grandC),fmt(grandK)]}/></Panel>;
}
function UnderLoading({data}) {
  const rows=data?.rows||[], out=[];let grand=[0,0,0,0,0,0];
  const values=r=>[n(r.opc53b),n(r.opc53h),n(r.ppcb),n(r.ppch),n(r.total)||n(r.opc53b)+n(r.opc53h)+n(r.ppcb)+n(r.ppch),n(r.clinker)];
  const sum=arr=>arr.reduce((a,r)=>a.map((v,i)=>v+values(r)[i]),[0,0,0,0,0,0]);
  const headers=["STATE","DISTRICT","ORDER NO","CUSTOMER NAME","OPC53B","OPC53H","PPCB","PPCH","TOTAL","CLINKER"];
  const states=[...new Set(rows.map(r=>r.state_name||""))];
  for(const state of states){const sr=rows.filter(r=>(r.state_name||"")===state);const districts=[...new Set(sr.map(r=>r.district_name||""))];for(const d of districts){const dr=sr.filter(r=>(r.district_name||"")===d);dr.forEach(r=>{const v=values(r);out.push([state,d,text(r.order_no),text(r.customer_name),...v.map(fmt)]);});const t=sum(dr);out.push([<b>{d} Total</b>,"","", "",...t.map(fmt)]);grand=grand.map((v,i)=>v+t[i]);}const t=sum(sr);out.push([<b>{state} Total</b>,"","", "",...t.map(fmt)]);}
  return <Panel title="UNDER LOADING TRUCKS DETAILS" sub={date(data?.report_date)}><Table headers={headers} firstLeft={4} rows={out} totals={["Grand Total","","","",...grand.map(fmt)]}/></Panel>;
}
function ClinkerCustomer({data}) {const rows=data?.rows||[],t=data?.totals||{};return <Panel title="CLINKER SALES - CUSTOMER WISE" sub={date(data?.report_date)+" · Qty in MT"}><Table headers={["Customer","On Date (MT)","MTD (MT)","YTD (MT)"]} rows={rows.map(r=>[text(r.customer_name),fmt(r.on_date_qty),fmt(r.mtd_qty),fmt(r.ytd_qty)])} totals={["Grand Total",fmt(t.on_date_qty),fmt(t.mtd_qty),fmt(t.ytd_qty)]}/></Panel>}
function Invoice({data}) {
 const rows=data?.rows||[], keys=["invoice_no","dispatch_date","customer_name","product_code","sales_channel","oa_no","packslip_no","vehicle_no","shipping_state","district_name","transporter_name","qty","taxable_value","igst","cgst","sgst","total_tax","total_value"];
 const headers=["InvNo","Dispatch date","Customer name / Warehouse","Item code","Sales channel","OA No","Packslip No","Vehicle No","Shipping state","District","Transporter name","Qty","Taxable value","IGST","CGST","SGST","Total tax","Total value"];
 const totals=keys.slice(11).map(k=>rows.reduce((a,r)=>a+n(r[k]),0));
 return <Panel title="INVOICE-WISE DISPATCH DETAILS" sub={(data?.rows||[]).length+" rows"}><Table headers={headers} firstLeft={11} rows={rows.map(r=>keys.map((k,i)=>i<11?text(k==="customer_name"?(r.customer_name||r.warehouse):r[k]):fmt(r[k])))} totals={["","","","","","","","","","","Grand Total",...totals.map(fmt)]} small/></Panel>;
}
function Trade({data}) {
 const regions=data?.regions||[], grand=regions.reduce((a,r)=>a+n(r.grand_total),0), rows=[];const states=[...new Set(regions.map(r=>r.state_name||""))];const keys=["dlr","dtr","godown","ins","msp","grand_total"];
 for(const st of states){const group=regions.filter(r=>(r.state_name||"")===st);const sub=keys.map(k=>group.reduce((a,r)=>a+n(r[k]),0));group.forEach((r,i)=>rows.push([i===0?text(st):"",text(r.district_name),...keys.map(k=>fmt(r[k])),pct(r.grand_total,grand)]));rows.push(["",<b>{st} Total</b>,...sub.map(fmt),pct(sub[5],grand)]);}
 const totals=keys.map(k=>regions.reduce((a,r)=>a+n(r[k]),0));
 return <Panel title="TRADE / NON-TRADE DISPATCHES" sub={monthLabel(data?.month)}><Table headers={["Month","Shippingstate","District","DLR","DTR","GODOWN","INS","MSP","Grand Total","Dispatch Share %"]} firstLeft={3} rows={rows.map((r,i)=>[i===0?monthLabel(data?.month):"",...r])} totals={[date(data?.month)+" Total","", "",...totals.map(fmt),"100.00%"]}/></Panel>;
}
function MonthlyYearly({data}) {
 const rows=data?.rows||[],keys=["opc_bulk","opc_packed","opc_total","ppc_bulk","ppc_packed","ppc_laminate","ppc_total","total_cement","clinker"];
 const headers=["Month","OPC Bulk","OPC Packed","OPC Total","PPC Bulk","PPC Packed","PPC Laminate","PPC Total","Total Cement","Clinker"];
 const totals=data?.totals||{};
 return <Panel title={data?.title||"DISPATCH SUMMARY"} sub={"FY "+data?.fy_start+"-"+String(data?.fy_end||"").slice(-2)}><Table headers={headers} firstLeft={1} groups={[{label:"Month",span:1},{label:"OPC",span:2},{label:"OPC TOTAL",span:1},{label:"PPC",span:3},{label:"PPC TOTAL",span:1},{label:"TOTAL CEMENT",span:1},{label:"CLINKER",span:1}]} rows={rows.map(r=>[text(r.month_label),...keys.map(k=>fmt(r[k]))])} totals={["Total",...keys.map(k=>fmt(totals[k]))]}/></Panel>;
}
function ScrapSummary({data}) {const rows=data?.rows||[];const t=rows.reduce((a,r)=>({d:a.d+n(r.on_date_qty),m:a.m+n(r.mtd_qty),y:a.y+n(r.ytd_qty)}),{d:0,m:0,y:0});return <Panel title="SCRAP SALES REPORT" sub={date(data?.report_date)}><Table headers={["Item","On Date","MTD","YTD"]} rows={rows.map(r=>[text(r.item_code),fmt(r.on_date_qty),fmt(r.mtd_qty),fmt(r.ytd_qty)])} totals={["Grand Total",fmt(t.d),fmt(t.m),fmt(t.y)]}/></Panel>}
function ScrapInvoice({data}) {
 const rows=data?.rows||[],t=data?.totals||{};
 const keys=["invoice_no","invoice_date","item_code","customer_code","customer_name","vehicle_no","destination_name","state_name","quantity","basic_value","cgst","sgst","igst","total_tax","total_value"];
 const headers=["Inv No","Invoice Date","Item Code","Customer Code","Customer Name","Vehicle No","Destination Name","State Name","Quantity","Basic Value","CGST","SGST","IGST","Total Tax","Total Value"];
 return <Panel title="SCRAP SALES - INVOICE WISE" sub={data?.period_label||"Selected period"}><Table headers={headers} firstLeft={8} rows={rows.map(r=>keys.map((k,i)=>i<8?(k==="invoice_date"?date(r[k]):text(r[k])):fmt(r[k])))} totals={["Grand Total","","","","","","","",fmt(t.quantity),fmt(t.basic_value),fmt(t.cgst),fmt(t.sgst),fmt(t.igst),fmt(t.tax),fmt(t.total_value)]} small/></Panel>;
}
function Weighbridge({data}) {
 const completed=data?.rows||[], pending=data?.pending_rows||[], outside=data?.outside_rows||[];
 const map=new Map();
 const add=(r,stage)=>{let category=String(r.category||"").toLowerCase(),material=text(r.material);if(["CLN","CLINKER"].includes(material.toUpperCase()))category="clinker";if(!["raw","cement","clinker"].includes(category))return;const key=category+"|"+material.toUpperCase();if(!map.has(key))map.set(key,{category,material,uom:r.uom||"MT",v:[0,0,0,0,0]});const item=map.get(key);if(stage===0){item.v[0]+=n(r.on_date_qty);item.v[1]+=n(r.on_date_trucks);}else if(stage===1){item.v[2]+=n(r.qty);item.v[3]+=n(r.trucks);}else item.v[4]+=n(r.trucks);};
 completed.forEach(r=>add(r,0));pending.forEach(r=>add(r,1));outside.forEach(r=>add(r,2));
 const labels=[["raw","UN-LOADING COMPLETED","A","Raw Material Total"],["cement","LOADING COMPLETED","B","Cement Total"],["clinker","LOADING COMPLETED","C","Clinker"]];
 const grand=[0,0,0,0,0];
 return <Panel title="WEIGHBRIDGE REPORT" sub={date(data?.report_date)}><Title sub={"Completed: "+date(data?.completed_source_date||data?.report_date)+" · Under Loading: "+date(data?.pending_source_date||data?.report_date)+" · Outside: "+date(data?.outside_source_date||data?.report_date)}>WEIGHBRIDGE REPORT</Title>
  {labels.map(([cat,title,letter,totalLabel])=>{const items=[...map.values()].filter(x=>x.category===cat);const sum=[0,0,0,0,0];items.forEach(x=>x.v.forEach((v,i)=>{sum[i]+=v;grand[i]+=v;}));return <div className="cr-section" key={cat}><h4>{title}</h4><Table headers={["SL NO.","PARTICULARS","UOM","QTY","NO. OF TRUCKS","QTY","NO. OF TRUCKS","NO. OF TRUCKS"]} firstLeft={3} groups={[{label:"",span:3},{label:"COMPLETED",span:2},{label:"UNDER LOADING",span:2},{label:"OUTSIDE",span:1}]} rows={items.filter(x=>x.v.some(v=>Math.abs(v)>0.000001)).map((x,i)=>[i+1,x.material,x.uom,fmt(x.v[0]),x.v[1]||"—",fmt(x.v[2]),x.v[3]||"—",x.v[4]||"—"])} totals={[letter,totalLabel,"MT",fmt(sum[0]),sum[1]||"—",fmt(sum[2]),sum[3]||"—",sum[4]||"—"]}/></div>;})}
  <div className="cr-section"><Table headers={["SL NO.","PARTICULARS","UOM","QTY","NO. OF TRUCKS","QTY","NO. OF TRUCKS","NO. OF TRUCKS"]} rows={[]} totals={["","Grand Total (A+B+C)","MT",fmt(grand[0]),grand[1]||"—",fmt(grand[2]),grand[3]||"—",grand[4]||"—"]}/></div>
  {data?.shift_incharge_name&&<p className="cr-shift">WEIGH BRIDGE SHIFT INCHARGE: {String(data.shift_incharge_name).toUpperCase()}</p>}
 </Panel>;
}
function StatusRows({rows}) {
 const groups=[["raw","UN-LOADING"],["cement","CEMENT"],["clinker","CLINKER"]];
 return <>{groups.map(([key,label])=>{const rs=rows.filter(r=>String(r.category||"").toLowerCase()===key);if(!rs.length)return null;return <div key={key}><h5>{label}</h5><Table headers={["SL NO","PRODUCT","QTY","TRUCKS"]} rows={rs.map((r,i)=>[i+1,text(r.material),fmt(r.qty),fmt(r.trucks)])} totals={["","Total",fmt(rs.reduce((a,r)=>a+n(r.qty),0)),fmt(rs.reduce((a,r)=>a+n(r.trucks),0))]}/></div>;})}</>;
}
function WeighbridgeProduct({data}) {
 const rows=data?.completed_products||[],outside=data?.outside_main_gate||[],under=data?.trucks_under_loading||[];
 return <Panel title="CONSOLIDATED PRODUCT SUMMARY" sub={date(data?.report_date)}><div className="cr-section"><h4>COMPLETED WEIGHMENTS</h4><Table headers={["Material","On Date Qty","On Date Trucks","MTD Qty","MTD Trucks","YTD Qty","YTD Trucks"]} rows={rows.map(r=>[text(r.material),fmt(r.on_date_qty),fmt(r.on_date_trucks),fmt(r.mtd_qty),fmt(r.mtd_trucks),fmt(r.ytd_qty),fmt(r.ytd_trucks)])}/></div><div className="cr-section"><h4>OUTSIDE MAIN GATE</h4><Table headers={["Material","Truck Count"]} rows={outside.map(r=>[text(r.material),fmt(r.truck_count)])}/></div><div className="cr-section"><h4>TRUCKS UNDER LOADING</h4><Table headers={["Material","Document Qty","Truck Count"]} rows={under.map(r=>[text(r.material),fmt(r.document_qty),fmt(r.truck_count)])}/></div></Panel>;
}
function RawMaterials({data}) {
 const keys=["pass_no","rf_code","vehicle_no","dc_no","dc_date","dc_qty","material","supplier","from_place","to_place","transporter","shift","first_weight","first_date","first_time","second_weight","second_date","second_time","net_weight","time_diff"];
 const headers=["Pass No","RF Code","Vehicle No","DC No","DC Date","DC Qty","Material","Supplier","From","To","Transporter","Shift","1st Weight","1st Date","1st Time","2nd Weight","2nd Date","2nd Time","Net Weight","Time Diff"];
 return <Panel title="WEIGHBRIDGE REPORT - RAW MATERIALS" sub={(data?.rows||[]).length+" records"}><Table headers={headers} firstLeft={6} rows={(data?.rows||[]).map(r=>keys.map(k=>["dc_qty","first_weight","second_weight","net_weight"].includes(k)?fmt(r[k]):["dc_date","first_date","second_date"].includes(k)?date(r[k]):text(r[k])))} small/></Panel>;
}
function Transaction({data}) {
 const rows=data?.rows||[];
 const keys=["month","pass_no","rf_code","vehicle_no","dc_no","dc_date","dc_qty","material","to_place","transporter","weigh_type","shift","first_weight","first_date","first_time","second_weight","second_date","second_time","net_weight","time_diff","invoice_date"];
 const headers=["Month","Pass No","RFCODE","Vehicle No","DCNO","DC Date","DC Qty","Material","To Place","Transportor","Weigh Type","Shift","Fst Wgt","Fst Date","Fst Time","Snd Wgt","Snd Date","Snd Time","Net Weight","Time_diff","Date"];
 for(let i=0;i<5;i++){keys.push("__inv"+i,"__qty"+i);headers.push("Invoice No-"+(i+1),"Qty"+(i||""));}
 keys.push("total_invoice_qty","difference_qty","tolerance_percent","remarks","item_code");headers.push("Total Inv Qty","Diff.Qty","Tolerance %","Remarks","Item Code");
 return <Panel title="WEIGHBRIDGE-TRANSACTION WISE" sub={(rows.length)+" transactions"}><Table headers={headers} firstLeft={6} rows={rows.map(r=>{const inv=r.invoices||[];return keys.map(k=>{if(k.startsWith("__inv"))return text(inv[Number(k.slice(5))]?.invoice_no);if(k.startsWith("__qty"))return fmt(inv[Number(k.slice(5))]?.quantity);if(k==="tolerance_percent")return r[k]==null?"—":n(r[k]).toFixed(2)+"%";if(["dc_date","first_date","second_date","invoice_date"].includes(k))return date(r[k]);if(["dc_qty","first_weight","second_weight","net_weight","total_invoice_qty","difference_qty"].includes(k))return fmt(r[k]);return text(r[k]);});})} small/></Panel>;
}

export default function CommercialReportLayout({type,reportKey,data}) {
 if(!data)return null;
 if(type==="dispatch"){
  if(reportKey==="product_wise")return <ProductWise data={data}/>;
  if(reportKey==="state_district")return <StateDistrict data={data}/>;
  if(reportKey==="transporter")return <Transporter data={data}/>;
  if(reportKey==="transporter_day_wise")return <TransporterDay data={data}/>;
  if(reportKey==="under_loading")return <UnderLoading data={data}/>;
  if(reportKey==="clinker_customer")return <ClinkerCustomer data={data}/>;
  if(reportKey==="invoice_wise")return <Invoice data={data}/>;
  if(reportKey==="trade_non_trade")return <Trade data={data}/>;
  if(reportKey==="monthly_yearly")return <MonthlyYearly data={data}/>;
 }
 if(type==="weighbridge"){
  if(reportKey==="datewise")return <Weighbridge data={data}/>;
  if(reportKey==="product_summary")return <WeighbridgeProduct data={data}/>;
  if(reportKey==="pending")return <Panel title="TRUCKS UNDER LOADING" sub={date(data?.report_date)}><StatusRows rows={Array.isArray(data)?data:data.rows||[]}/></Panel>;
  if(reportKey==="outside")return <Panel title="OUTSIDE MAIN GATE" sub={date(data?.report_date)}><StatusRows rows={Array.isArray(data)?data:data.rows||[]}/></Panel>;
  if(reportKey==="raw_materials")return <RawMaterials data={data}/>;
  if(reportKey==="transaction_wise")return <Transaction data={data}/>;
 }
 if(type==="scrap"){
  if(reportKey==="summary")return <ScrapSummary data={data}/>;
  if(reportKey==="invoice_wise")return <ScrapInvoice data={data}/>;
 }
 return <Panel title="Report">{Array.isArray(data)?<StatusRows rows={data}/>:<pre>{JSON.stringify(data,null,2)}</pre>}</Panel>;
}
