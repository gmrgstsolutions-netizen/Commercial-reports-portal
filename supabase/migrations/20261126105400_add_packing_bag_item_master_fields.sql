
alter table public.packing_bag_types
  add column if not exists item_code text,
  add column if not exists description text;

update public.packing_bag_types
set item_code = case code
  when 'OPC_YELLOW' then 'BG-PP-OPC53-Y'
  when 'OPC_WHITE' then 'BG-PP-NT-53'
  when 'PPC_YELLOW' then 'BG-PP-PPC-Y'
  when 'PPC_WHITE' then 'BG-PP-NT-PPC'
  when 'PPC_LAMINATED_YELLOW' then 'BG-LM-PPC'
  when 'OPC_GREY' then 'BG-RPP-NT-OPC53'
  when 'PPC_GREY' then 'BG-RPP-NT-PPC'
  else item_code end,
description = case code
  when 'OPC_YELLOW' then 'BAG PP WOVEN SACKS OPC 53 GRADE (YELLOW)'
  when 'OPC_WHITE' then 'BAG PP WOVEN SACKS OPC 53 GRADE NON TRADING WHITE BAG ONE SIDE PRITING'
  when 'PPC_YELLOW' then 'BAG PP WOVEN SACKS PPC GRADE (YELLOW)'
  when 'PPC_WHITE' then 'BAG PP WOVEN SACKS PPC GRADE NON TRADING WHITE BAG ONE SIDE PRITING'
  when 'PPC_LAMINATED_YELLOW' then 'BAG PP LAMINATION'
  when 'OPC_GREY' then 'BAG RE PROCESSED PP WOVEN SACKS OPC 53 GRADE NON TRADE'
  when 'PPC_GREY' then 'BAG RE PROCESSED PP WOVEN SACKS PPC GRADE NON TRADE'
  else description end,
uom = 'NOS',
updated_at = now()
where code in ('OPC_YELLOW','OPC_WHITE','PPC_YELLOW','PPC_WHITE','PPC_LAMINATED_YELLOW','OPC_GREY','PPC_GREY');

create unique index if not exists packing_bag_types_item_code_uidx
  on public.packing_bag_types(item_code)
  where item_code is not null;

insert into public.packing_bag_types
  (code,name,item_code,description,uom,product_codes,sales_channels,bags_per_mt,damage_rate,sort_order,is_active)
select 'PPC_LAMINATED_SUPER','PPC Super Laminated Bags','BG-LM-PPC-SUPER',
       'BAG PP LAMINATED PPC SUPER','NOS',array[]::text[],array[]::text[],20,0.001,80,true
where not exists (
  select 1 from public.packing_bag_types
  where code='PPC_LAMINATED_SUPER' or item_code='BG-LM-PPC-SUPER'
);

insert into private.packing_bag_stock_baselines
  (bag_type_id,as_of_date,opening_balance,receipts_od,receipts_mtd,receipts_ytd,
   consumption_od,consumption_mtd,consumption_ytd,damages_od,damages_mtd,damages_ytd,closing_balance)
select id,'2026-11-18',0,0,0,0,0,0,0,0,0,0,0
from public.packing_bag_types
where code='PPC_LAMINATED_SUPER'
on conflict (bag_type_id) do nothing;
