-- Packing Plant receipt import: Admin + Uploader, with atomic audit logging.
-- REVIEW ONLY: do not apply to production until the migration and role tests are approved.

begin;

create table if not exists public.packing_bag_receipt_import_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text not null check (length(btrim(file_name)) between 1 and 255),
  file_sha256 text not null unique check (file_sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id),
  submitted_rows integer not null check (submitted_rows > 0),
  inserted_rows integer not null default 0 check (inserted_rows >= 0),
  skipped_rows integer not null default 0 check (skipped_rows >= 0),
  status text not null check (status in ('completed','completed_with_skips')),
  created_at timestamptz not null default now(),
  constraint packing_bag_receipt_import_counts_check
    check (inserted_rows + skipped_rows = submitted_rows)
);

create index if not exists packing_bag_receipt_import_batches_created_by_created_at_idx
  on public.packing_bag_receipt_import_batches (created_by, created_at desc);

alter table public.packing_bag_receipt_import_batches enable row level security;

drop policy if exists "Admins read all packing bag import batches"
  on public.packing_bag_receipt_import_batches;
create policy "Admins read all packing bag import batches"
  on public.packing_bag_receipt_import_batches
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.is_active and p.role = 'admin'
    )
  );

drop policy if exists "Uploaders read own packing bag import batches"
  on public.packing_bag_receipt_import_batches;
create policy "Uploaders read own packing bag import batches"
  on public.packing_bag_receipt_import_batches
  for select to authenticated
  using (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.is_active and p.role = 'uploader'
    )
  );

revoke all on table public.packing_bag_receipt_import_batches from anon, authenticated;
grant select on table public.packing_bag_receipt_import_batches to authenticated;

create or replace function public.import_packing_bag_receipts(
  p_file_name text,
  p_file_sha256 text,
  p_entries jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_batch_id uuid;
  v_submitted integer;
  v_inserted integer := 0;
  v_skipped integer := 0;
  v_existing public.packing_bag_receipt_import_batches%rowtype;
begin
  select p.role into v_role
  from public.profiles p
  where p.id = v_user_id and p.is_active;

  if v_user_id is null or v_role not in ('admin','uploader') then
    raise exception 'Active Admin or Uploader access is required to import packing bag receipts';
  end if;

  if p_file_name is null or length(btrim(p_file_name)) not between 1 and 255 then
    raise exception 'A valid source file name (maximum 255 characters) is required';
  end if;
  if p_file_sha256 is null or p_file_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'A valid lowercase SHA-256 file checksum is required';
  end if;
  if jsonb_typeof(p_entries) is distinct from 'array' then
    raise exception 'Receipt entries must be a JSON array';
  end if;

  v_submitted := jsonb_array_length(p_entries);
  if v_submitted = 0 then
    raise exception 'At least one receipt entry is required';
  end if;
  if v_submitted > 2000 then
    raise exception 'Maximum 2000 receipt rows per upload';
  end if;

  -- Serialize identical-file submissions so retrying a completed upload is idempotent.
  perform pg_advisory_xact_lock(hashtextextended(p_file_sha256, 0));

  select * into v_existing
  from public.packing_bag_receipt_import_batches
  where file_sha256 = p_file_sha256;

  if found then
    return jsonb_build_object(
      'duplicate_file', true,
      'batch_id', v_existing.id,
      'submitted', v_existing.submitted_rows,
      'inserted', v_existing.inserted_rows,
      'skipped', v_existing.skipped_rows,
      'status', v_existing.status
    );
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_entries) as x(bag_type_id uuid, receipt_date date, quantity numeric)
    where x.bag_type_id is null or x.receipt_date is null
       or x.quantity is null or x.quantity <= 0
  ) then
    raise exception 'Each receipt requires a bag type, date and positive quantity';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_entries) as x(bag_type_id uuid)
    left join public.packing_bag_types b
      on b.id = x.bag_type_id and b.is_active
    where b.id is null
  ) then
    raise exception 'One or more bag types are invalid or inactive';
  end if;

  insert into public.packing_bag_receipt_import_batches
    (file_name, file_sha256, created_by, submitted_rows, inserted_rows, skipped_rows, status)
  values
    (btrim(p_file_name), p_file_sha256, v_user_id, v_submitted, 0, v_submitted, 'completed_with_skips')
  returning id into v_batch_id;

  insert into public.packing_bag_receipts
    (bag_type_id, receipt_date, quantity, source_ref, remarks, created_by)
  select
    x.bag_type_id, x.receipt_date, x.quantity,
    nullif(btrim(x.source_ref), ''), nullif(btrim(x.remarks), ''), v_user_id
  from jsonb_to_recordset(p_entries) as x(
    bag_type_id uuid, receipt_date date, quantity numeric, source_ref text, remarks text
  )
  on conflict do nothing;

  get diagnostics v_inserted = row_count;
  v_skipped := v_submitted - v_inserted;

  update public.packing_bag_receipt_import_batches
  set inserted_rows = v_inserted,
      skipped_rows = v_skipped,
      status = case when v_skipped = 0 then 'completed' else 'completed_with_skips' end
  where id = v_batch_id;

  return jsonb_build_object(
    'duplicate_file', false,
    'batch_id', v_batch_id,
    'submitted', v_submitted,
    'inserted', v_inserted,
    'skipped', v_skipped,
    'status', case when v_skipped = 0 then 'completed' else 'completed_with_skips' end
  );
end;
$function$;

revoke all on function public.import_packing_bag_receipts(text, text, jsonb) from public, anon;
grant execute on function public.import_packing_bag_receipts(text, text, jsonb) to authenticated;

commit;
