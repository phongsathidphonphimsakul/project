-- ลานรถ: ระบบทีม — ข้อมูลรถเป็นของ "เต็นท์" (shop) และสมาชิกในเต็นท์ใช้ร่วมกัน
-- รันต่อจาก 20261006000000_init.sql (ข้อมูลเดิมของแต่ละบัญชีจะถูกย้ายเข้าเต็นท์ของบัญชีนั้นอัตโนมัติ)

-- ---------- ตารางใหม่ ----------
create table public.shops (
  id            uuid primary key default gen_random_uuid(),
  name          text not null default '',
  settings      jsonb not null default '{}'::jsonb,
  stock_prefix  text not null default 'A',
  next_stock_no int  not null default 1,
  created_by    uuid references auth.users (id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.shop_members (
  shop_id    uuid not null references public.shops (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null default 'staff' check (role in ('owner', 'staff')),
  email      text not null default '',
  name       text not null default '',
  created_at timestamptz not null default now(),
  primary key (shop_id, user_id)
);
create index shop_members_user_idx on public.shop_members (user_id);

create table public.shop_invites (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops (id) on delete cascade,
  shop_name   text not null default '',
  email       text not null,
  role        text not null default 'staff' check (role in ('owner', 'staff')),
  invited_by  uuid references auth.users (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  unique (shop_id, email)
);
create index shop_invites_email_idx on public.shop_invites (lower(email));

-- ---------- ฟังก์ชันตรวจสิทธิ์ (security definer กัน RLS วนซ้ำ) ----------
create or replace function public.is_shop_member(p_shop uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.shop_members m where m.shop_id = p_shop and m.user_id = auth.uid())
$$;

create or replace function public.is_shop_owner(p_shop uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.shop_members m where m.shop_id = p_shop and m.user_id = auth.uid() and m.role = 'owner')
$$;

-- โฟลเดอร์ใน Storage ตั้งชื่อตาม shop id (เทียบเป็นข้อความ ไม่ cast เพื่อไม่ให้ชื่อโฟลเดอร์แปลกๆ ทำให้ error)
create or replace function public.is_folder_member(p_folder text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.shop_members m where m.shop_id::text = p_folder and m.user_id = auth.uid())
$$;

-- ---------- cars / expenses: เปลี่ยนจากของผู้ใช้ เป็นของเต็นท์ ----------
alter table public.cars add column shop_id uuid references public.shops (id) on delete cascade;
alter table public.expenses add column shop_id uuid references public.shops (id) on delete cascade;

-- ผู้สร้างรายการ: ถ้าบัญชีพนักงานถูกลบ ข้อมูลรถต้องไม่หายตาม
alter table public.cars drop constraint if exists cars_user_id_fkey;
alter table public.cars alter column user_id drop not null;
alter table public.cars rename column user_id to created_by;
alter table public.cars add constraint cars_created_by_fkey foreign key (created_by) references auth.users (id) on delete set null;
alter table public.cars add column updated_by uuid references auth.users (id) on delete set null;

alter table public.expenses drop constraint if exists expenses_user_id_fkey;
alter table public.expenses alter column user_id drop not null;
alter table public.expenses rename column user_id to created_by;
alter table public.expenses add constraint expenses_created_by_fkey foreign key (created_by) references auth.users (id) on delete set null;

-- ย้ายข้อมูลเดิม: ทุกบัญชีที่มีรถหรือการตั้งค่า ได้เต็นท์ของตัวเองและเป็นเจ้าของ
do $$
declare
  r record;
  sid uuid;
begin
  for r in
    select u.id, u.email, s.data
    from auth.users u
    left join public.settings s on s.user_id = u.id
    where exists (select 1 from public.cars c where c.created_by = u.id)
       or s.user_id is not null
  loop
    insert into public.shops (name, settings, stock_prefix, next_stock_no, created_by)
    values (
      coalesce(nullif(r.data ->> 'shopName', ''), 'เต็นท์ของฉัน'),
      coalesce(r.data, '{}'::jsonb) - 'stockPrefix' - 'nextStockNo',
      coalesce(nullif(r.data ->> 'stockPrefix', ''), 'A'),
      coalesce((r.data ->> 'nextStockNo')::int, 1),
      r.id
    )
    returning id into sid;
    insert into public.shop_members (shop_id, user_id, role, email) values (sid, r.id, 'owner', coalesce(r.email, ''));
    update public.cars set shop_id = sid where created_by = r.id;
    update public.expenses set shop_id = sid where created_by = r.id;
  end loop;
end $$;

delete from public.expenses where shop_id is null;
delete from public.cars where shop_id is null;
alter table public.cars alter column shop_id set not null;
alter table public.expenses alter column shop_id set not null;

drop index if exists public.cars_user_idx;
create index cars_shop_idx on public.cars (shop_id, created_at desc);
create index expenses_shop_idx on public.expenses (shop_id);

drop table public.settings;

-- ---------- triggers ----------
-- เลขสต็อกอัตโนมัติ: ออกเลขในฐานข้อมูล กันพนักงานสองคนลงรถพร้อมกันแล้วได้เลขซ้ำ
create or replace function public.assign_stock_no() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  n int;
  p text;
begin
  if coalesce(new.stock_no, '') = '' then
    update public.shops set next_stock_no = next_stock_no + 1
    where id = new.shop_id
    returning next_stock_no - 1, stock_prefix into n, p;
    new.stock_no := p || '-' || lpad(n::text, 3, '0');
  end if;
  return new;
end $$;

create trigger cars_stock_no before insert on public.cars
  for each row execute function public.assign_stock_no();

create or replace function public.stamp_car() returns trigger
language plpgsql as $$
begin
  new.updated_by := auth.uid();
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;
  return new;
end $$;

create trigger cars_stamp before insert or update on public.cars
  for each row execute function public.stamp_car();

-- ค่าใช้จ่ายต้องอยู่เต็นท์เดียวกับรถ
create or replace function public.expense_shop() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select c.shop_id into new.shop_id from public.cars c where c.id = new.car_id;
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;
  return new;
end $$;

create trigger expenses_shop before insert or update on public.expenses
  for each row execute function public.expense_shop();

create trigger shops_touch before update on public.shops
  for each row execute function public.touch_updated_at();

-- policy "แก้ชื่อตัวเอง" อนุญาตให้ update แถวตัวเองได้ทั้งแถว — กันไม่ให้ใครเลื่อนบทบาทตัวเอง
create or replace function public.guard_member_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.shop_id <> old.shop_id or new.user_id <> old.user_id or new.email <> old.email then
    raise exception 'แก้ไขข้อมูลนี้ไม่ได้';
  end if;
  if new.role <> old.role and (old.user_id = auth.uid() or not public.is_shop_owner(old.shop_id)) then
    raise exception 'เปลี่ยนบทบาทได้เฉพาะเจ้าของ และเปลี่ยนของตัวเองไม่ได้';
  end if;
  return new;
end $$;

create trigger shop_members_guard before update on public.shop_members
  for each row execute function public.guard_member_update();

-- ---------- RPC ----------
create or replace function public.create_shop(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  sid uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  insert into public.shops (name, created_by) values (coalesce(nullif(trim(p_name), ''), 'เต็นท์ของฉัน'), auth.uid())
  returning id into sid;
  insert into public.shop_members (shop_id, user_id, role, email)
  values (sid, auth.uid(), 'owner', coalesce(auth.jwt() ->> 'email', ''));
  return sid;
end $$;

create or replace function public.accept_invite(p_invite uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  inv public.shop_invites;
begin
  select * into inv from public.shop_invites
  where id = p_invite and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''));
  if inv.id is null then
    raise exception 'ไม่พบคำเชิญ หรือคำเชิญนี้ไม่ได้ส่งถึงอีเมลของคุณ';
  end if;
  insert into public.shop_members (shop_id, user_id, role, email)
  values (inv.shop_id, auth.uid(), inv.role, inv.email)
  on conflict (shop_id, user_id) do nothing;
  delete from public.shop_invites where id = inv.id;
  return inv.shop_id;
end $$;

revoke all on function public.create_shop(text) from public, anon;
revoke all on function public.accept_invite(uuid) from public, anon;
grant execute on function public.create_shop(text) to authenticated;
grant execute on function public.accept_invite(uuid) to authenticated;

-- ---------- RLS ----------
alter table public.shops        enable row level security;
alter table public.shop_members enable row level security;
alter table public.shop_invites enable row level security;

create policy "members read shop" on public.shops
  for select to authenticated using (public.is_shop_member(id));
create policy "owners update shop" on public.shops
  for update to authenticated using (public.is_shop_owner(id)) with check (public.is_shop_owner(id));
create policy "owners delete shop" on public.shops
  for delete to authenticated using (public.is_shop_owner(id));

create policy "members read members" on public.shop_members
  for select to authenticated using (public.is_shop_member(shop_id));
-- เจ้าของเปลี่ยนบทบาทคนอื่นได้ (ไม่ใช่ตัวเอง กันเต็นท์ไม่มีเจ้าของ)
create policy "owners update members" on public.shop_members
  for update to authenticated
  using (public.is_shop_owner(shop_id) and user_id <> (select auth.uid()))
  with check (public.is_shop_owner(shop_id));
-- เจ้าของเอาพนักงานออกได้ / พนักงานออกจากเต็นท์เองได้
create policy "remove members" on public.shop_members
  for delete to authenticated
  using (
    (public.is_shop_owner(shop_id) and user_id <> (select auth.uid()))
    or (user_id = (select auth.uid()) and role <> 'owner')
  );
-- แก้ชื่อที่แสดงของตัวเอง
create policy "edit own member name" on public.shop_members
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "read invites" on public.shop_invites
  for select to authenticated
  using (public.is_shop_owner(shop_id) or lower(email) = lower(coalesce((select auth.jwt()) ->> 'email', '')));
create policy "owners invite" on public.shop_invites
  for insert to authenticated with check (public.is_shop_owner(shop_id));
create policy "delete invites" on public.shop_invites
  for delete to authenticated
  using (public.is_shop_owner(shop_id) or lower(email) = lower(coalesce((select auth.jwt()) ->> 'email', '')));

drop policy if exists "own cars" on public.cars;
create policy "members read cars" on public.cars
  for select to authenticated using (public.is_shop_member(shop_id));
create policy "members add cars" on public.cars
  for insert to authenticated with check (public.is_shop_member(shop_id));
create policy "members edit cars" on public.cars
  for update to authenticated using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));
create policy "owners delete cars" on public.cars
  for delete to authenticated using (public.is_shop_owner(shop_id));

drop policy if exists "own expenses" on public.expenses;
create policy "members read expenses" on public.expenses
  for select to authenticated using (public.is_shop_member(shop_id));
create policy "members add expenses" on public.expenses
  for insert to authenticated with check (public.is_shop_member(shop_id));
create policy "members edit expenses" on public.expenses
  for update to authenticated using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id));
-- ลบได้เฉพาะคนที่ลงรายการนั้นเอง หรือเจ้าของ
create policy "delete own expenses" on public.expenses
  for delete to authenticated
  using (public.is_shop_owner(shop_id) or (public.is_shop_member(shop_id) and created_by = (select auth.uid())));

-- ---------- Storage: รูปอยู่ในโฟลเดอร์ของเต็นท์ ----------
drop policy if exists "own photos read" on storage.objects;
drop policy if exists "own photos write" on storage.objects;
drop policy if exists "own photos update" on storage.objects;
drop policy if exists "own photos delete" on storage.objects;

-- อ่านได้ถ้าเป็นรูปของรถในเต็นท์ตัวเอง (รวมรูปเก่าที่อยู่ในโฟลเดอร์ผู้ใช้)
create policy "shop photos read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'car-photos' and (
      public.is_folder_member((storage.foldername(name))[1])
      or exists (select 1 from public.cars c where c.photo_path = name and public.is_shop_member(c.shop_id))
    )
  );
create policy "shop photos write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'car-photos' and public.is_folder_member((storage.foldername(name))[1]));
create policy "shop photos update" on storage.objects
  for update to authenticated
  using (bucket_id = 'car-photos' and public.is_folder_member((storage.foldername(name))[1]));
create policy "shop photos delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'car-photos' and (
      public.is_folder_member((storage.foldername(name))[1])
      or exists (select 1 from public.cars c where c.photo_path = name and public.is_shop_member(c.shop_id))
    )
  );

-- ---------- Realtime: เห็นสิ่งที่เพื่อนร่วมทีมแก้ทันที ----------
alter table public.cars replica identity full;
alter table public.expenses replica identity full;
do $$
begin
  alter publication supabase_realtime add table public.cars, public.expenses;
exception when others then
  raise notice 'realtime publication: %', sqlerrm;
end $$;
