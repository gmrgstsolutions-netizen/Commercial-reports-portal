CREATE OR REPLACE FUNCTION public.get_packing_plant_performance_report(p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_from date := coalesce(p_date_from, date_trunc('month', current_date)::date);
  v_to date := coalesce(p_date_to, current_date);
  v_fy_start date;
  v_rows jsonb;
begin
  if not private.is_active_user() then raise exception 'Active portal account required'; end if;
  if v_from > v_to then raise exception 'From Date must not be after To Date'; end if;
  if v_to - v_from > 1096 then raise exception 'Date range cannot exceed 3 years'; end if;
  v_fy_start := case when extract(month from v_from)>=4
    then make_date(extract(year from v_from)::int,4,1)
    else make_date(extract(year from v_from)::int-1,4,1) end;

  with dates as (
    select generate_series(v_from,v_to,interval '1 day')::date business_date
  ),
  dispatch_daily as (
    select d.dispatch_date business_date,
      case when upper(d.product_code) in ('OPC53H','OPC53B') then 'OPC53'
           when upper(d.product_code) in ('PPCH','PPCL','PPCB') then 'PPC' end grade,
      coalesce(sum(d.qty) filter(where upper(d.product_code) in ('OPC53H','PPCH','PPCL')),0)::numeric bagged_qty,
      coalesce(sum(d.qty) filter(where upper(d.product_code) in ('OPC53B','PPCB')),0)::numeric bulk_qty
    from private.cement_dispatch_details d
    where d.dispatch_date between v_fy_start and v_to
      and upper(d.product_code) in ('OPC53H','PPCH','PPCL','OPC53B','PPCB')
      and not exists(select 1 from private.cancelled_dispatch_invoices c where c.invoice_no=d.invoice_no)
    group by d.dispatch_date,2
  ),
  dispatch_totals as (
    select business_date,sum(bagged_qty) bagged_total,sum(bulk_qty) bulk_total
    from dispatch_daily group by business_date
  ),
  asset_day as (
    select (x->>'business_date')::date business_date,
      x->>'asset_name' asset_name,
      sum(coalesce((x->>'day_production_mt')::numeric,0)) production_mt,
      sum(coalesce((x->>'day_running_hours')::numeric,0)) running_hours,
      sum(coalesce((x->>'day_stoppage_hours')::numeric,0)) stoppage_hours
    from jsonb_array_elements(public.get_packing_plant_stoppage_report(v_fy_start,v_to)->'rows') x
    where coalesce(x->>'stop_number','') in ('1','')
    group by 1,2
  ),
  base as (
    select dt.business_date,g.grade,
      coalesce(dd.bagged_qty,0) bagged_qty,coalesce(dd.bulk_qty,0) bulk_qty,
      coalesce(t.bagged_total,0) bagged_total,coalesce(t.bulk_total,0) bulk_total,
      coalesce(p1.production_mt,0) p1_day_qty,coalesce(p1.running_hours,0) p1_day_run,coalesce(p1.stoppage_hours,0) p1_day_stop,
      coalesce(p2.production_mt,0) p2_day_qty,coalesce(p2.running_hours,0) p2_day_run,coalesce(p2.stoppage_hours,0) p2_day_stop,
      coalesce(p3.production_mt,0) p3_day_qty,coalesce(p3.running_hours,0) p3_day_run,coalesce(p3.stoppage_hours,0) p3_day_stop,
      coalesce(bl.production_mt,0) bulk_day_qty,coalesce(bl.running_hours,0) bulk_day_run,coalesce(bl.stoppage_hours,0) bulk_day_stop
    from dates dt cross join (values('OPC53'::text),('PPC'::text)) g(grade)
    left join dispatch_daily dd on dd.business_date=dt.business_date and dd.grade=g.grade
    left join dispatch_totals t on t.business_date=dt.business_date
    left join asset_day p1 on p1.business_date=dt.business_date and p1.asset_name='Packer 1'
    left join asset_day p2 on p2.business_date=dt.business_date and p2.asset_name='Packer 2'
    left join asset_day p3 on p3.business_date=dt.business_date and p3.asset_name='Packer 3'
    left join asset_day bl on bl.business_date=dt.business_date and bl.asset_name='Bulk Loading'
  ),
  grade_rows as (
    select b.*,
      case when bagged_total>0 then p1_day_qty*bagged_qty/bagged_total else 0 end p1_qty,
      case when bagged_total>0 then p2_day_qty*bagged_qty/bagged_total else 0 end p2_qty,
      case when bagged_total>0 then p3_day_qty*bagged_qty/bagged_total else 0 end p3_qty,
      bulk_qty bulk_production_qty,
      case when bagged_total>0 then p1_day_run*bagged_qty/bagged_total else 0 end p1_run,
      case when bagged_total>0 then p2_day_run*bagged_qty/bagged_total else 0 end p2_run,
      case when bagged_total>0 then p3_day_run*bagged_qty/bagged_total else 0 end p3_run,
      case when bulk_total>0 then bulk_day_run*bulk_qty/bulk_total else 0 end bulk_run,
      case when bagged_total>0 then p1_day_stop*bagged_qty/bagged_total else 0 end p1_stop,
      case when bagged_total>0 then p2_day_stop*bagged_qty/bagged_total else 0 end p2_stop,
      case when bagged_total>0 then p3_day_stop*bagged_qty/bagged_total else 0 end p3_stop,
      case when bulk_total>0 then bulk_day_stop*bulk_qty/bulk_total else 0 end bulk_stop
    from base b
  ),
  cumulative as (
    select gr.*,
      bagged_qty+bulk_qty on_date,
      coalesce((select sum(d.bagged_qty+d.bulk_qty) from dispatch_daily d
        where d.grade=gr.grade and d.business_date between date_trunc('month',gr.business_date)::date and gr.business_date),0) mtd,
      coalesce((select sum(d.bagged_qty+d.bulk_qty) from dispatch_daily d
        where d.grade=gr.grade and d.business_date between v_fy_start and gr.business_date),0) ytd
    from grade_rows gr
  ),
  output_rows as (
    select business_date,1 sort_order,grade,
      p1_qty,p1_run,p1_stop,p2_qty,p2_run,p2_stop,p3_qty,p3_run,p3_stop,
      bulk_production_qty,bulk_run,bulk_stop,
      p1_qty+p2_qty+p3_qty+bulk_production_qty total_dispatch_qty,on_date,mtd,ytd
    from cumulative
    union all
    select business_date,2,'Total',
      sum(p1_qty),sum(p1_run),sum(p1_stop),sum(p2_qty),sum(p2_run),sum(p2_stop),
      sum(p3_qty),sum(p3_run),sum(p3_stop),sum(bulk_production_qty),sum(bulk_run),sum(bulk_stop),
      sum(p1_qty+p2_qty+p3_qty+bulk_production_qty),sum(on_date),sum(mtd),sum(ytd)
    from cumulative group by business_date
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'business_date',business_date,'grade',grade,
    'p1_qty',round(p1_qty,2),'p1_running_hours',round(p1_run,2),'p1_stoppage_hours',round(p1_stop,2),
    'p2_qty',round(p2_qty,2),'p2_running_hours',round(p2_run,2),'p2_stoppage_hours',round(p2_stop,2),
    'p3_qty',round(p3_qty,2),'p3_running_hours',round(p3_run,2),'p3_stoppage_hours',round(p3_stop,2),
    'bulk_qty',round(bulk_production_qty,2),'bulk_running_hours',round(bulk_run,2),'bulk_stoppage_hours',round(bulk_stop,2),
    'total_dispatch_qty',round(total_dispatch_qty,2),'on_date',round(on_date,2),'mtd',round(mtd,2),'ytd',round(ytd,2),
    'p1_tph',case when p1_run>0 then round(p1_qty/p1_run,2) else 0 end,
    'p2_tph',case when p2_run>0 then round(p2_qty/p2_run,2) else 0 end,
    'p3_tph',case when p3_run>0 then round(p3_qty/p3_run,2) else 0 end,
    'bulk_tph',case when bulk_run>0 then round(bulk_production_qty/bulk_run,2) else 0 end
  ) order by business_date,sort_order),'[]'::jsonb)
  into v_rows from output_rows;
  return jsonb_build_object('report_key','packing_plant_performance_daywise','date_from',v_from,'date_to',v_to,'rows',v_rows);
end;
$function$
;
revoke all on function public.get_packing_plant_performance_report(date,date) from public;
grant execute on function public.get_packing_plant_performance_report(date,date) to authenticated;
