-- BORA AÇAÍ — execute em um projeto Supabase NOVO. Não misture com o VitaLife.
create extension if not exists pgcrypto;
create schema if not exists private;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.store_settings (
  id integer primary key default 1 check(id=1),
  name text not null default 'Bora Açaí',
  whatsapp text not null default '',
  logo_url text,
  delivery_fee_cents integer not null default 500 check(delivery_fee_cents>=0),
  pickup_enabled boolean not null default true,
  delivery_enabled boolean not null default true,
  open_for_orders boolean not null default false,
  closed_message text not null default 'Estamos fechados no momento.',
  address text not null default '',
  neighborhoods text[] not null default '{}',
  payments text[] not null default array['pix','dinheiro','cartao']::text[],
  updated_at timestamptz not null default now()
);
insert into public.store_settings(id) values(1) on conflict(id) do nothing;
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check(length(btrim(name)) between 2 and 100),
  description text not null default '',
  image_url text,
  category text not null default 'Açaí',
  max_extras integer not null default 3 check(max_extras between 0 and 20),
  available boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.sizes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  price_cents integer not null check(price_cents>=0 and price_cents<=1000000),
  available boolean not null default true,
  unique(product_id,name)
);
create table if not exists public.extras (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  price_cents integer not null default 0 check(price_cents>=0 and price_cents<=100000),
  available boolean not null default true
);
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity unique,
  idempotency_key uuid not null unique,
  customer_name text not null,
  phone text not null,
  fulfillment text not null check(fulfillment in ('delivery','pickup')),
  address text,
  neighborhood text,
  reference text,
  payment_method text not null check(payment_method in ('pix','dinheiro','cartao')),
  change_for_cents integer check(change_for_cents is null or change_for_cents>=0),
  notes text,
  subtotal_cents integer not null check(subtotal_cents>=0),
  delivery_fee_cents integer not null check(delivery_fee_cents>=0),
  total_cents integer not null check(total_cents=subtotal_cents+delivery_fee_cents),
  status text not null default 'aguardando_confirmacao' check(status in ('aguardando_confirmacao','confirmado','em_preparo','saiu_para_entrega','pronto_retirada','concluido','cancelado')),
  created_at timestamptz not null default now()
);
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  product_id uuid references public.products(id) on delete set null,
  name text not null,
  size_name text not null,
  unit_price_cents integer not null check(unit_price_cents>=0),
  qty integer not null check(qty between 1 and 99),
  extras_snapshot jsonb not null default '[]'::jsonb,
  total_cents integer not null check(total_cents>=0)
);
create index if not exists orders_created_idx on public.orders(created_at desc);
create index if not exists orders_status_idx on public.orders(status,created_at desc);
create index if not exists orders_phone_created_idx on public.orders(phone,created_at desc);
create index if not exists order_items_order_idx on public.order_items(order_id);
create index if not exists sizes_product_idx on public.sizes(product_id);

create or replace function private.is_admin() returns boolean language sql security definer set search_path = '' stable as $$
  select exists(select 1 from public.admin_users where user_id=(select auth.uid()));
$$;
revoke all on function private.is_admin() from public;
grant usage on schema private to authenticated;
grant usage on schema private to anon;
grant execute on function private.is_admin() to anon,authenticated;

alter table public.admin_users enable row level security;
alter table public.store_settings enable row level security;
alter table public.products enable row level security;
alter table public.sizes enable row level security;
alter table public.extras enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create policy "Admin reads self" on public.admin_users for select to authenticated using(user_id=(select auth.uid()));
create policy "Store settings public read" on public.store_settings for select to anon,authenticated using(true);
create policy "Store settings admin update" on public.store_settings for update to authenticated using((select private.is_admin())) with check((select private.is_admin()));
create policy "Available products public read" on public.products for select to anon,authenticated using(available or (select private.is_admin()));
create policy "Products admin insert" on public.products for insert to authenticated with check((select private.is_admin()));
create policy "Products admin update" on public.products for update to authenticated using((select private.is_admin())) with check((select private.is_admin()));
create policy "Products admin delete" on public.products for delete to authenticated using((select private.is_admin()));
create policy "Available sizes public read" on public.sizes for select to anon,authenticated using((available and exists(select 1 from public.products p where p.id=product_id and p.available)) or (select private.is_admin()));
create policy "Sizes admin insert" on public.sizes for insert to authenticated with check((select private.is_admin()));
create policy "Sizes admin update" on public.sizes for update to authenticated using((select private.is_admin())) with check((select private.is_admin()));
create policy "Sizes admin delete" on public.sizes for delete to authenticated using((select private.is_admin()));
create policy "Available extras public read" on public.extras for select to anon,authenticated using(available or (select private.is_admin()));
create policy "Extras admin insert" on public.extras for insert to authenticated with check((select private.is_admin()));
create policy "Extras admin update" on public.extras for update to authenticated using((select private.is_admin())) with check((select private.is_admin()));
create policy "Extras admin delete" on public.extras for delete to authenticated using((select private.is_admin()));
create policy "Orders admin read" on public.orders for select to authenticated using((select private.is_admin()));
create policy "Orders admin update" on public.orders for update to authenticated using((select private.is_admin())) with check((select private.is_admin()));
create policy "Order items admin read" on public.order_items for select to authenticated using((select private.is_admin()));

-- Segurança adicional: nenhum cliente lê pedidos; o servidor usa uma RPC restrita.
revoke all on public.orders,public.order_items from anon;
grant select on public.orders,public.order_items to authenticated;
grant update(status) on public.orders to authenticated;
grant select on public.admin_users to authenticated;
grant select on public.products,public.sizes,public.extras,public.store_settings to anon,authenticated;
grant insert,update,delete on public.products,public.sizes,public.extras to authenticated;
grant update on public.store_settings to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('product-images','product-images',true,5242880,array['image/png','image/jpeg','image/webp'])
on conflict(id) do nothing;
create policy "Product photos public" on storage.objects for select to anon,authenticated using(bucket_id='product-images');
create policy "Admin uploads product images" on storage.objects for insert to authenticated with check(bucket_id='product-images' and (select private.is_admin()));
create policy "Admin updates product images" on storage.objects for update to authenticated using(bucket_id='product-images' and (select private.is_admin())) with check(bucket_id='product-images' and (select private.is_admin()));
create policy "Admin deletes product images" on storage.objects for delete to authenticated using(bucket_id='product-images' and (select private.is_admin()));

-- RPC de criação: chamada somente com service role pela Edge Function.
create or replace function public.create_customer_order(payload jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid; v_number bigint; v_existing record; v_settings public.store_settings%rowtype;
  v_item jsonb; v_extra_id_text text; v_extra record; v_product record; v_size record;
  v_qty int; v_count int := 0; v_subtotal bigint := 0; v_fee int; v_line bigint;
  v_extras_sum bigint; v_snapshot jsonb; v_lines text := ''; v_line_text text;
  v_key uuid; v_phone text; v_name text; v_method text; v_delivery text;
  v_address text; v_neighborhood text; v_notes text; v_change int;
  v_url text; v_message text;
begin
  v_key := (payload->>'idempotency_key')::uuid;
  if v_key is null then raise exception 'Chave do pedido ausente'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_key::text,0));
  select id,order_number,subtotal_cents,delivery_fee_cents,total_cents,customer_name,phone,fulfillment,address,neighborhood,payment_method,notes into v_existing
  from public.orders where idempotency_key=v_key;
  if found then
    -- Na repetição, responder com os dados armazenados sem duplicar pedido.
    v_lines := '';
    for v_product in select name,size_name,qty,total_cents from public.order_items where order_id=v_existing.id loop
      v_lines := v_lines || v_product.qty || '× ' || v_product.name || ' (' || v_product.size_name || ') — R$ ' || to_char(v_product.total_cents/100.0,'FM9999990D00') || E'\n';
    end loop;
    v_message := 'NOVO PEDIDO — BORA AÇAÍ' || E'\nPedido: #' || lpad(v_existing.order_number::text,4,'0') || E'\nCliente: ' || v_existing.customer_name || E'\n' || v_lines || 'Total: R$ ' || to_char(v_existing.total_cents/100.0,'FM9999990D00') || E'\nRecebimento: ' || v_existing.fulfillment || E'\nPagamento: ' || v_existing.payment_method || E'\nEndereço: ' || coalesce(v_existing.address,'Retirada') || E'\nBairro: ' || coalesce(v_existing.neighborhood,'—') || E'\nObservações: ' || coalesce(v_existing.notes,'—');
    select whatsapp into v_phone from public.store_settings where id=1;
    return jsonb_build_object('order_number',v_existing.order_number,'whatsapp',v_phone,'message',v_message);
  end if;
  select * into v_settings from public.store_settings where id=1 for share;
  if not found or not v_settings.open_for_orders then raise exception 'Loja fechada para pedidos'; end if;
  if v_settings.whatsapp !~ '^[0-9]{12,15}$' then raise exception 'WhatsApp da loja não configurado'; end if;
  v_name := btrim(coalesce(payload->>'customer_name','')); v_phone := regexp_replace(coalesce(payload->>'phone',''),'[^0-9]','','g');
  v_delivery := coalesce(payload->>'fulfillment','');v_method:=coalesce(payload->>'payment_method','');
  v_address:=nullif(btrim(coalesce(payload->>'address','')),'');v_neighborhood:=nullif(btrim(coalesce(payload->>'neighborhood','')),'');
  v_notes:=nullif(btrim(coalesce(payload->>'notes','')),'');
  if length(v_name) not between 2 and 100 then raise exception 'Nome inválido'; end if;
  if v_phone !~ '^[0-9]{10,13}$' then raise exception 'Telefone inválido'; end if;
  if v_delivery not in ('delivery','pickup') then raise exception 'Tipo de entrega inválido'; end if;
  if (v_delivery='delivery' and not v_settings.delivery_enabled) or (v_delivery='pickup' and not v_settings.pickup_enabled) then raise exception 'Modalidade indisponível'; end if;
  if v_delivery='delivery' and (v_address is null or v_neighborhood is null or length(v_address)>240) then raise exception 'Endereço incompleto'; end if;
  if v_delivery='delivery' and cardinality(v_settings.neighborhoods)>0 and not v_neighborhood=any(v_settings.neighborhoods) then raise exception 'Bairro não atendido'; end if;
  if cardinality(v_settings.payments)=0 or v_method<>all(v_settings.payments) then raise exception 'Forma de pagamento indisponível'; end if;
  if v_notes is not null and length(v_notes)>500 then raise exception 'Observações muito longas';end if;
  if (select count(*) from public.orders where phone=v_phone and created_at>now()-interval '10 minutes')>=5 then raise exception 'Muitas tentativas. Tente novamente mais tarde'; end if;
  if jsonb_typeof(payload->'items')<>'array' or jsonb_array_length(payload->'items') not between 1 and 30 then raise exception 'Carrinho inválido';end if;
  if (payload ? 'change_for_cents') and payload->>'change_for_cents' is not null then
    v_change := (payload->>'change_for_cents')::integer;
    if v_change<0 then raise exception 'Troco inválido';end if;
  end if;
  v_fee := case when v_delivery='delivery' then v_settings.delivery_fee_cents else 0 end;
  insert into public.orders(idempotency_key,customer_name,phone,fulfillment,address,neighborhood,reference,payment_method,change_for_cents,notes,subtotal_cents,delivery_fee_cents,total_cents)
  values(v_key,v_name,v_phone,v_delivery,v_address,v_neighborhood,nullif(btrim(coalesce(payload->>'reference','')),''),v_method,v_change,v_notes,0,v_fee,v_fee)
  returning id,order_number into v_id,v_number;
  for v_item in select * from jsonb_array_elements(payload->'items') loop
    v_count:=v_count+1;
    v_qty := (v_item->>'qty')::int;
    if v_qty not between 1 and 99 then raise exception 'Quantidade inválida';end if;
    select id,name,max_extras into v_product from public.products where id=(v_item->>'product_id')::uuid and available=true;
    if not found then raise exception 'Produto indisponível';end if;
    select id,name,price_cents into v_size from public.sizes where id=(v_item->>'size_id')::uuid and product_id=v_product.id and available=true;
    if not found then raise exception 'Tamanho indisponível';end if;
    if jsonb_typeof(v_item->'extra_ids')<>'array' then raise exception 'Adicionais inválidos'; end if;
    if jsonb_array_length(v_item->'extra_ids')>v_product.max_extras then raise exception 'Limite de adicionais excedido';end if;
    v_snapshot:='[]'::jsonb;v_extras_sum:=0;
    for v_extra_id_text in select value #>> '{}' from jsonb_array_elements(v_item->'extra_ids') as value loop
      if v_snapshot @> jsonb_build_array(jsonb_build_object('id',v_extra_id_text)) then raise exception 'Adicional duplicado';end if;
      select id,name,price_cents into v_extra from public.extras where id=v_extra_id_text::uuid and available=true;
      if not found then raise exception 'Adicional indisponível';end if;
      v_extras_sum:=v_extras_sum+v_extra.price_cents;
      v_snapshot:=v_snapshot||jsonb_build_array(jsonb_build_object('id',v_extra.id,'name',v_extra.name,'price_cents',v_extra.price_cents));
    end loop;
    v_line := (v_size.price_cents+v_extras_sum)*v_qty;
    v_subtotal:=v_subtotal+v_line;
    if v_subtotal>100000000 then raise exception 'Valor do pedido excede limite';end if;
    insert into public.order_items(order_id,product_id,name,size_name,unit_price_cents,qty,extras_snapshot,total_cents)
    values(v_id,v_product.id,v_product.name,v_size.name,v_size.price_cents,v_qty,v_snapshot,v_line);
    v_line_text:=v_qty || '× ' || v_product.name || ' (' || v_size.name || ') — R$ ' || to_char(v_line/100.0,'FM9999990D00');
    if jsonb_array_length(v_snapshot)>0 then v_line_text:=v_line_text || E'\n  Adicionais: ' || (select string_agg(x->>'name',', ') from jsonb_array_elements(v_snapshot) x);end if;
    v_lines:=v_lines||v_line_text||E'\n';
  end loop;
  update public.orders set subtotal_cents=v_subtotal,total_cents=v_subtotal+v_fee where id=v_id;
  v_message := 'NOVO PEDIDO — ' || v_settings.name || E'\nPedido: #' || lpad(v_number::text,4,'0') || E'\nCliente: ' || v_name || E'\n\nITENS:\n' || v_lines || E'\nSubtotal: R$ ' || to_char(v_subtotal/100.0,'FM9999990D00') || E'\nEntrega: R$ ' || to_char(v_fee/100.0,'FM9999990D00') || E'\nTOTAL: R$ ' || to_char((v_subtotal+v_fee)/100.0,'FM9999990D00') || E'\nRecebimento: ' || case when v_delivery='delivery' then 'Entrega' else 'Retirada' end || E'\nEndereço: ' || coalesce(v_address,'Retirada na loja') || E'\nBairro: ' || coalesce(v_neighborhood,'—') || E'\nPagamento: ' || v_method || E'\nObservações: ' || coalesce(v_notes,'—');
  return jsonb_build_object('order_number',v_number,'whatsapp',v_settings.whatsapp,'message',v_message);
end;
$$;
revoke all on function public.create_customer_order(jsonb) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function public.create_customer_order(jsonb) to service_role;

-- Realtime: pedidos chegam no painel enquanto o administrador está logado.
do $$begin
if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='orders') then
  alter publication supabase_realtime add table public.orders;
end if;
end$$;

-- IMPORTANTE: depois de criar um usuário em Authentication, torne-o administrador manualmente:
-- insert into public.admin_users(user_id) values ('UUID-DO-USUARIO');
-- Configurar WhatsApp e abertura da loja no painel ANTES de aceitar pedidos.
