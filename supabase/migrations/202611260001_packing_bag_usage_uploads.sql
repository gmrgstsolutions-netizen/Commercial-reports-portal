-- Date-wise packing bag consumption and damages import ledger.
create table if not exists public.packing_bag_usage_uploads (
  id uuid primary key default gen_random_uuid(),
  bag_type_id uuid not null references public.packing_bag_types(id),
  usage_date date not null,
  consumption_qty numeric(14,2) not null default 0 check (consumption_qty >= 0),
  damages_qty numeric(14,2) not null default 0 check (damages_qty >= 0),
  remarks text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bag_type_id, usage_date)
);
alter table public.packing_bag_usage_uploads enable row level security;
drop policy if exists "Admins manage packing bag usage uploads" on public.packing_bag_usage_uploads;
create policy "Admins manage packing bag usage uploads" on public.packing_bag_usage_uploads
  for all to authenticated using (private.is_admin()) with check (private.is_admin());
create or replace function public.save_packing_bag_usage_upload(p_entries jsonb)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_saved integer := 0; v_count integer := 0;
begin
  if not private.is_admin() then raise exception 'Only an active administrator can upload consumption and damages'; end if;
  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries)=0 then raise exception 'Upload must contain at least one data row'; end if;
  if jsonb_array_length(p_entries)>10000 then raise exception 'Maximum 10000 rows per upload'; end if;
  if exists (select 1 from jsonb_to_recordset(p_entries) as x(bag_type_id uuid, usage_date date, consumption_qty numeric, damages_qty numeric)
    where bag_type_id is null or usage_date is null or usage_date < date '2026-04-01' or usage_date > current_date
      or consumption_qty is null or consumption_qty < 0 or damages_qty is null or damages_qty < 0) then
    raise exception 'Each row requires a valid bag type, date from 01-Apr-2026, and non-negative consumption and damages';
  end if;
  select count(*) into v_count from jsonb_to_recordset(p_entries) as x(bag_type_id uuid)
    left join public.packing_bag_types b on b.id=x.bag_type_id and b.is_active where b.id is null;
  if v_count>0 then raise exception 'One or more bag types are invalid or inactive'; end if;
  if exists (select 1 from jsonb_to_recordset(p_entries) as x(bag_type_id uuid, usage_date date)
    group by bag_type_id,usage_date having count(*)>1) then raise exception 'Duplicate bag type and date rows found in this workbook. Combine them before upload'; end if;
  insert into public.packing_bag_usage_uploads(bag_type_id,usage_date,consumption_qty,damages_qty,remarks,created_by)
  select x.bag_type_id,x.usage_date,x.consumption_qty,x.damages_qty,nullif(btrim(x.remarks),''),auth.uid()
  from jsonb_to_recordset(p_entries) as x(bag_type_id uuid,usage_date date,consumption_qty numeric,damages_qty numeric,remarks text)
  on conflict (bag_type_id,usage_date) do update set consumption_qty=excluded.consumption_qty,damages_qty=excluded.damages_qty,
    remarks=excluded.remarks,created_by=auth.uid(),updated_at=now();
  get diagnostics v_saved=row_count;
  return jsonb_build_object('saved',v_saved,'submitted',jsonb_array_length(p_entries),'mode','upsert');
end; $$;
revoke all on function public.save_packing_bag_usage_upload(jsonb) from public, anon;
grant execute on function public.save_packing_bag_usage_upload(jsonb) to authenticated;
