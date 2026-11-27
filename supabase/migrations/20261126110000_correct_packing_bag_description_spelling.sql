update public.packing_bag_types
set description = replace(description, 'PRITING', 'PRINTING'),
    updated_at = now()
where code in ('OPC_WHITE', 'PPC_WHITE')
  and description like '%PRITING%';
