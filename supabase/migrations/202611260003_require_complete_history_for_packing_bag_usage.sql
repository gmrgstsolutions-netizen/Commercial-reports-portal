-- Use uploaded daily values as the historical FY source only after complete date coverage per bag type.
-- Until coverage is complete, preserve the saved 18-Nov-2026 historical baseline.
-- Post-snapshot dates always prefer uploaded bag-type/date records over dispatch-derived values.

CREATE OR REPLACE FUNCTION public.get_packing_bag_stock_statement(p_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_fy_start date;
  v_month_start date;
  v_anchor_date date;
  v_result jsonb;
begin
  if p_date is null then
    raise exception 'Select a report date';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = auth.uid()
      and is_active
      and role in ('admin','viewer','uploader','dispatch_uploader')
  ) then
    raise exception 'Authorized packing bag access required';
  end if;

  v_fy_start := make_date(
    extract(year from p_date)::integer
      - case when extract(month from p_date) < 4 then 1 else 0 end,
    4, 1
  );
  v_month_start := date_trunc('month', p_date)::date;
  select min(as_of_date) into v_anchor_date
  from private.packing_bag_stock_baselines;

  if v_anchor_date is not null and p_date >= v_anchor_date then
    if p_date = v_anchor_date then
      with historical_upload as (
        select u.bag_type_id, count(*) as upload_count,
          (count(distinct u.usage_date) = (v_anchor_date-v_fy_start+1)) as is_complete,
          sum(u.consumption_qty) filter(where u.usage_date<p_date) as consumption_before,
          sum(u.consumption_qty) filter(where u.usage_date=p_date) as consumption_od,
          sum(u.consumption_qty) filter(where u.usage_date between v_month_start and p_date) as consumption_mtd,
          sum(u.consumption_qty) as consumption_ytd,
          sum(u.damages_qty) filter(where u.usage_date<p_date) as damages_before,
          sum(u.damages_qty) filter(where u.usage_date=p_date) as damages_od,
          sum(u.damages_qty) filter(where u.usage_date between v_month_start and p_date) as damages_mtd,
          sum(u.damages_qty) as damages_ytd
        from public.packing_bag_usage_uploads u
        where u.usage_date between v_fy_start and v_anchor_date
        group by u.bag_type_id
      ),
      rows as (
        select b.id, b.code, b.name, b.uom, b.sort_order,
               case when h.is_complete then coalesce(o.quantity,0)+s.receipts_ytd-s.receipts_od
                    -coalesce(h.consumption_before,0)-coalesce(h.damages_before,0)
                    else s.opening_balance end as opening_balance,
               s.receipts_od, s.receipts_mtd, s.receipts_ytd,
               case when h.is_complete then coalesce(h.consumption_od,0) else s.consumption_od end as consumption_od,
               case when h.is_complete then coalesce(h.consumption_mtd,0) else s.consumption_mtd end as consumption_mtd,
               case when h.is_complete then coalesce(h.consumption_ytd,0) else s.consumption_ytd end as consumption_ytd,
               case when h.is_complete then coalesce(h.damages_od,0) else s.damages_od end as damages_od,
               case when h.is_complete then coalesce(h.damages_mtd,0) else s.damages_mtd end as damages_mtd,
               case when h.is_complete then coalesce(h.damages_ytd,0) else s.damages_ytd end as damages_ytd,
               case when h.is_complete then coalesce(o.quantity,0)+s.receipts_ytd
                    -coalesce(h.consumption_ytd,0)-coalesce(h.damages_ytd,0)
                    else s.closing_balance end as closing_balance,
               true as opening_balance_set
        from public.packing_bag_types b
        join private.packing_bag_stock_baselines s on s.bag_type_id=b.id
        left join historical_upload h on h.bag_type_id=b.id
        left join public.packing_bag_opening_balances o
          on o.bag_type_id=b.id and o.financial_year_start=v_fy_start
        where b.is_active
      )
      select jsonb_build_object(
        'report_date', p_date,
        'financial_year_start', v_fy_start,
        'month_start', v_month_start,
        'rows', coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order,x.name) from rows x),'[]'::jsonb),
        'totals', (select jsonb_build_object(
          'opening_balance',sum(opening_balance),'receipts_od',sum(receipts_od),
          'receipts_mtd',sum(receipts_mtd),'receipts_ytd',sum(receipts_ytd),
          'consumption_od',sum(consumption_od),'consumption_mtd',sum(consumption_mtd),
          'consumption_ytd',sum(consumption_ytd),'damages_od',sum(damages_od),
          'damages_mtd',sum(damages_mtd),'damages_ytd',sum(damages_ytd),
          'closing_balance',sum(closing_balance)) from rows)
      ) into v_result;
      return v_result;
    end if;

    with dispatch_daily as (
      select d.bag_type_id as id, d.usage_date as report_date,
             d.consumption_qty as consumption, d.damages_qty as damages
      from private.packing_bag_usage_daily(v_anchor_date+1,p_date) d
    ),
    historical_upload as (
      select u.bag_type_id as id, count(*) as upload_count,
        (count(distinct u.usage_date) = (v_anchor_date-v_fy_start+1)) as is_complete,
        sum(u.consumption_qty) as consumption_ytd,
        sum(u.damages_qty) as damages_ytd,
        sum(u.consumption_qty) filter(where u.usage_date>=v_month_start) as consumption_mtd,
        sum(u.damages_qty) filter(where u.usage_date>=v_month_start) as damages_mtd
      from public.packing_bag_usage_uploads u
      where u.usage_date between v_fy_start and v_anchor_date
      group by u.bag_type_id
    ),
    receipt_daily as (
      select b.id,r.receipt_date,sum(r.quantity) as receipts
      from public.packing_bag_types b
      join public.packing_bag_receipts r
        on r.bag_type_id=b.id
       and r.receipt_date > v_anchor_date
       and r.receipt_date <= p_date
      where b.is_active
      group by b.id,r.receipt_date
    ),
    per_type as (
      select b.id,b.code,b.name,b.uom,b.sort_order,
        case when h.is_complete then coalesce(o.quantity,0)+s.receipts_ytd-h.consumption_ytd-h.damages_ytd else s.closing_balance end as anchor_closing,
        s.receipts_mtd as anchor_receipts_mtd,
        s.receipts_ytd as anchor_receipts_ytd,
        case when h.is_complete then coalesce(h.consumption_mtd,0) else s.consumption_mtd end as anchor_consumption_mtd,
        case when h.is_complete then coalesce(h.consumption_ytd,0) else s.consumption_ytd end as anchor_consumption_ytd,
        case when h.is_complete then coalesce(h.damages_mtd,0) else s.damages_mtd end as anchor_damages_mtd,
        case when h.is_complete then coalesce(h.damages_ytd,0) else s.damages_ytd end as anchor_damages_ytd,
        coalesce((select sum(x.consumption) from dispatch_daily x where x.id=b.id and x.report_date=p_date),0) as consumption_od,
        coalesce((select sum(x.damages) from dispatch_daily x where x.id=b.id and x.report_date=p_date),0) as damages_od,
        coalesce((select sum(x.receipts) from receipt_daily x where x.id=b.id and x.receipt_date=p_date),0) as receipts_od,
        coalesce((select sum(x.consumption) from dispatch_daily x where x.id=b.id and x.report_date >= greatest(v_month_start,v_anchor_date+1) and x.report_date<=p_date),0) as post_month_consumption,
        coalesce((select sum(x.damages) from dispatch_daily x where x.id=b.id and x.report_date >= greatest(v_month_start,v_anchor_date+1) and x.report_date<=p_date),0) as post_month_damages,
        coalesce((select sum(x.receipts) from receipt_daily x where x.id=b.id and x.receipt_date >= greatest(v_month_start,v_anchor_date+1) and x.receipt_date<=p_date),0) as post_month_receipts,
        coalesce((select sum(x.consumption) from dispatch_daily x where x.id=b.id),0) as post_ytd_consumption,
        coalesce((select sum(x.damages) from dispatch_daily x where x.id=b.id),0) as post_ytd_damages,
        coalesce((select sum(x.receipts) from receipt_daily x where x.id=b.id),0) as post_ytd_receipts,
        coalesce((select sum(x.consumption) from dispatch_daily x where x.id=b.id and x.report_date<p_date),0) as consumption_before,
        coalesce((select sum(x.damages) from dispatch_daily x where x.id=b.id and x.report_date<p_date),0) as damages_before,
        coalesce((select sum(x.receipts) from receipt_daily x where x.id=b.id and x.receipt_date<p_date),0) as receipts_before,
        b.damage_rate
      from public.packing_bag_types b
      join private.packing_bag_stock_baselines s on s.bag_type_id=b.id
      left join historical_upload h on h.id=b.id
      left join public.packing_bag_opening_balances o
        on o.bag_type_id=b.id and o.financial_year_start=v_fy_start
      where b.is_active
    ),
    rows as (
      select id,code,name,uom,sort_order,
        anchor_closing+receipts_before-consumption_before-damages_before as opening_balance,
        receipts_od,
        case when v_month_start<=v_anchor_date then anchor_receipts_mtd+post_month_receipts else post_month_receipts end as receipts_mtd,
        anchor_receipts_ytd+post_ytd_receipts as receipts_ytd,
        consumption_od,
        case when v_month_start<=v_anchor_date then anchor_consumption_mtd+post_month_consumption else post_month_consumption end as consumption_mtd,
        anchor_consumption_ytd+post_ytd_consumption as consumption_ytd,
        damages_od,
        case when v_month_start<=v_anchor_date then anchor_damages_mtd+post_month_damages else post_month_damages end as damages_mtd,
        anchor_damages_ytd+post_ytd_damages as damages_ytd,
        anchor_closing+post_ytd_receipts-post_ytd_consumption-post_ytd_damages as closing_balance,
        true as opening_balance_set
      from per_type
    )
    select jsonb_build_object(
      'report_date',p_date,
      'financial_year_start',v_fy_start,
      'month_start',v_month_start,
      'rows',coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order,x.name) from rows x),'[]'::jsonb),
      'totals',(select jsonb_build_object(
        'opening_balance',sum(opening_balance),'receipts_od',sum(receipts_od),
        'receipts_mtd',sum(receipts_mtd),'receipts_ytd',sum(receipts_ytd),
        'consumption_od',sum(consumption_od),'consumption_mtd',sum(consumption_mtd),
        'consumption_ytd',sum(consumption_ytd),'damages_od',sum(damages_od),
        'damages_mtd',sum(damages_mtd),'damages_ytd',sum(damages_ytd),
        'closing_balance',sum(closing_balance)) from rows)
    ) into v_result;
    return v_result;
  end if;

  with dispatch_by_type as (
    select b.id,
      coalesce(sum(d.consumption_qty) filter(where d.usage_date=p_date),0) as consumption_od,
      coalesce(sum(d.consumption_qty) filter(where d.usage_date between v_month_start and p_date),0) as consumption_mtd,
      coalesce(sum(d.consumption_qty) filter(where d.usage_date between v_fy_start and p_date),0) as consumption_ytd,
      coalesce(sum(d.consumption_qty) filter(where d.usage_date>=v_fy_start and d.usage_date<p_date),0) as consumption_before_date,
      coalesce(sum(d.damages_qty) filter(where d.usage_date=p_date),0) as damages_od,
      coalesce(sum(d.damages_qty) filter(where d.usage_date between v_month_start and p_date),0) as damages_mtd,
      coalesce(sum(d.damages_qty) filter(where d.usage_date between v_fy_start and p_date),0) as damages_ytd,
      coalesce(sum(d.damages_qty) filter(where d.usage_date>=v_fy_start and d.usage_date<p_date),0) as damages_before_date
    from public.packing_bag_types b
    left join private.packing_bag_usage_daily(v_fy_start,p_date) d on d.bag_type_id=b.id
    where b.is_active
    group by b.id
  ),
  receipt_by_type as (
    select b.id,
      coalesce(sum(r.quantity) filter(where r.receipt_date=p_date),0) as receipts_od,
      coalesce(sum(r.quantity) filter(where r.receipt_date between v_month_start and p_date),0) as receipts_mtd,
      coalesce(sum(r.quantity) filter(where r.receipt_date between v_fy_start and p_date),0) as receipts_ytd,
      coalesce(sum(r.quantity) filter(where r.receipt_date>=v_fy_start and r.receipt_date<p_date),0) as receipts_before_date
    from public.packing_bag_types b
    left join public.packing_bag_receipts r
      on r.bag_type_id=b.id and r.receipt_date between v_fy_start and p_date
    where b.is_active
    group by b.id
  ),
  opening_by_type as (
    select o.bag_type_id,o.quantity
    from public.packing_bag_opening_balances o
    where o.financial_year_start=v_fy_start
  ),
  rows as (
    select b.id,b.code,b.name,b.uom,b.sort_order,
      case when o.quantity is not null then o.quantity+coalesce(r.receipts_before_date,0)
        -coalesce(d.consumption_before_date,0)-coalesce(d.damages_before_date,0) end as opening_balance,
      coalesce(r.receipts_od,0) as receipts_od,
      coalesce(r.receipts_mtd,0) as receipts_mtd,
      coalesce(r.receipts_ytd,0) as receipts_ytd,
      coalesce(d.consumption_od,0) as consumption_od,
      coalesce(d.consumption_mtd,0) as consumption_mtd,
      coalesce(d.consumption_ytd,0) as consumption_ytd,
      coalesce(d.damages_od,0) as damages_od,
      coalesce(d.damages_mtd,0) as damages_mtd,
      coalesce(d.damages_ytd,0) as damages_ytd,
      case when o.quantity is not null then o.quantity+coalesce(r.receipts_ytd,0)
        -coalesce(d.consumption_ytd,0)-coalesce(d.damages_ytd,0) end as closing_balance,
      (o.quantity is not null) as opening_balance_set
    from public.packing_bag_types b
    left join dispatch_by_type d on d.id=b.id
    left join receipt_by_type r on r.id=b.id
    left join opening_by_type o on o.bag_type_id=b.id
    where b.is_active
  )
  select jsonb_build_object(
    'report_date',p_date,
    'financial_year_start',v_fy_start,
    'month_start',v_month_start,
    'rows',coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order,x.name) from rows x),'[]'::jsonb),
    'totals',(select jsonb_build_object(
      'opening_balance',case when bool_and(opening_balance_set) then coalesce(sum(opening_balance),0) else null end,
      'receipts_od',coalesce(sum(receipts_od),0),'receipts_mtd',coalesce(sum(receipts_mtd),0),
      'receipts_ytd',coalesce(sum(receipts_ytd),0),'consumption_od',coalesce(sum(consumption_od),0),
      'consumption_mtd',coalesce(sum(consumption_mtd),0),'consumption_ytd',coalesce(sum(consumption_ytd),0),
      'damages_od',coalesce(sum(damages_od),0),'damages_mtd',coalesce(sum(damages_mtd),0),
      'damages_ytd',coalesce(sum(damages_ytd),0),
      'closing_balance',case when bool_and(opening_balance_set) then coalesce(sum(closing_balance),0) else null end
    ) from rows)
  ) into v_result;

  return v_result;
end;
$function$;
