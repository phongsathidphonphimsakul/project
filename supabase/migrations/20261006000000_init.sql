-- ลานรถ: โครงสร้างฐานข้อมูล
-- รันไฟล์นี้ใน Supabase Dashboard → SQL Editor (หรือ `supabase db push`)

-- ---------- cars ----------
create table if not exists public.cars (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  stock_no       text not null default '',
  brand          text not null default '',
  model          text not null default '',
  sub_model      text not null default '',
  year           int,
  color          text not null default '',
  gear           text not null default '',
  fuel           text not null default '',
  mileage        int,
  plate          text not null default '',
  province       text not null default '',
  vin            text not null default '',
  purchase_date  date,
  purchase_price numeric(12, 2) not null default 0,
  purchased_from text not null default '',
  status         text not null default 'stock'
                 check (status in ('stock', 'prep', 'ready', 'reserved', 'sold')),
  pricing        jsonb not null default '{}'::jsonb,
  asking_price   numeric(12, 2),
  reservation    jsonb,
  sold_price     numeric(12, 2),
  sold_date      date,
  buyer_name     text,
  buyer_phone    text,
  sale_note      text,
  notes          text not null default '',
  photo_path     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists cars_user_idx on public.cars (user_id, created_at desc);

-- ---------- expenses ----------
create table if not exists public.expenses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  car_id     uuid not null references public.cars (id) on delete cascade,
  category   text not null default 'อื่นๆ',
  label      text not null default '',
  amount     numeric(12, 2) not null default 0,
  date       date,
  vendor     text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists expenses_car_idx on public.expenses (car_id);

-- ---------- settings (หนึ่งแถวต่อผู้ใช้) ----------
create table if not exists public.settings (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------- updated_at ----------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists cars_touch on public.cars;
create trigger cars_touch before update on public.cars
  for each row execute function public.touch_updated_at();

drop trigger if exists settings_touch on public.settings;
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

-- ---------- Row Level Security: เห็นและแก้ได้เฉพาะข้อมูลของตัวเอง ----------
alter table public.cars     enable row level security;
alter table public.expenses enable row level security;
alter table public.settings enable row level security;

drop policy if exists "own cars" on public.cars;
create policy "own cars" on public.cars
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "own expenses" on public.expenses;
create policy "own expenses" on public.expenses
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.cars c where c.id = car_id and c.user_id = (select auth.uid()))
  );

drop policy if exists "own settings" on public.settings;
create policy "own settings" on public.settings
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------- Storage: รูปรถ (bucket ส่วนตัว, โฟลเดอร์ละผู้ใช้) ----------
insert into storage.buckets (id, name, public)
values ('car-photos', 'car-photos', false)
on conflict (id) do nothing;

drop policy if exists "own photos read" on storage.objects;
create policy "own photos read" on storage.objects
  for select to authenticated
  using (bucket_id = 'car-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "own photos write" on storage.objects;
create policy "own photos write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'car-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "own photos update" on storage.objects;
create policy "own photos update" on storage.objects
  for update to authenticated
  using (bucket_id = 'car-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "own photos delete" on storage.objects;
create policy "own photos delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'car-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
