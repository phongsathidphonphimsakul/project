import { PGlite } from '@electric-sql/pglite'
import fs from 'node:fs'
// ทดสอบ migration และสิทธิ์ RLS บน Postgres จริง (PGlite) โดยจำลอง auth/storage ของ Supabase
// รัน: npm run test:db
const dir = new URL('../migrations/', import.meta.url).pathname
const db = new PGlite()
const A = 'aaaaaaaa-0000-0000-0000-000000000001', B = 'bbbbbbbb-0000-0000-0000-000000000002', C = 'cccccccc-0000-0000-0000-000000000003'
await db.exec(`
create role anon nologin; create role authenticated nologin;
create schema auth; create schema storage;
create table auth.users (id uuid primary key, email text);
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
grant usage on schema public, auth, storage to authenticated;
grant all on all tables in schema storage to authenticated;
alter default privileges in schema public grant all on tables to authenticated;
alter default privileges in schema public grant execute on functions to authenticated;
insert into auth.users values ('${A}','a@shop.com'),('${B}','b@other.com'),('${C}','c@staff.com');
`)
let ok = 0, bad = 0
const check = (name, cond, extra = '') => { if (cond) ok++; else { bad++; console.log('FAIL', name, extra) } }
async function as(uid, email, sql, params) {
  await db.exec(`reset role; select set_config('request.jwt.claims', '${JSON.stringify({ sub: uid, email })}', false); set role authenticated;`)
  try { return await db.query(sql, params) } finally { await db.exec('reset role') }
}
async function asErr(uid, email, sql) { try { await as(uid, email, sql); return null } catch (e) { return e.message } }

const [init, teams] = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((f) => fs.readFileSync(dir + '/' + f, 'utf8'))
await db.exec(init)
// ข้อมูลเดิมก่อนมีระบบทีม
await as(A, 'a@shop.com', `insert into cars (id, brand, stock_no, purchase_price) values ('11111111-1111-1111-1111-111111111111','Toyota','A-001',300000)`)
await as(A, 'a@shop.com', `insert into expenses (car_id, category, amount) values ('11111111-1111-1111-1111-111111111111','ยาง/ล้อ',9000)`)
await as(A, 'a@shop.com', `insert into settings (data) values ('{"shopName":"ต.ยานยนต์","stockPrefix":"T","nextStockNo":2,"agingWarnDays":45}')`)
await as(B, 'b@other.com', `insert into cars (brand) values ('Honda')`)
check('init isolation', (await as(B, 'b@other.com', 'select * from cars')).rows.length === 1)

await db.exec(teams)
const shops = (await db.query('select * from shops order by name')).rows
check('two shops migrated', shops.length === 2, JSON.stringify(shops))
const sa = shops.find((s) => s.name === 'ต.ยานยนต์')
check('settings migrated', sa && sa.stock_prefix === 'T' && sa.next_stock_no === 2 && sa.settings.agingWarnDays === 45 && !('stockPrefix' in sa.settings), JSON.stringify(sa))
check('cars got shop', (await db.query(`select count(*)::int n from cars where shop_id is null`)).rows[0].n === 0)
check('expense got shop', (await db.query(`select shop_id from expenses`)).rows[0].shop_id === sa.id)

// เจ้าของเชิญพนักงาน
await as(A, 'a@shop.com', `insert into shop_invites (shop_id, shop_name, email, role) values ('${sa.id}','ต.ยานยนต์','C@Staff.com','staff')`)
check('B cannot invite to A shop', !!(await asErr(B, 'b@other.com', `insert into shop_invites (shop_id, email) values ('${sa.id}','x@y.com')`)))
check('C sees invite', (await as(C, 'c@staff.com', 'select * from shop_invites')).rows.length === 1)
check('B does not see invite', (await as(B, 'b@other.com', 'select * from shop_invites')).rows.length === 0)
check('C sees no cars before joining', (await as(C, 'c@staff.com', 'select * from cars')).rows.length === 0)
const invId = (await db.query('select id from shop_invites')).rows[0].id
check('B cannot accept C invite', !!(await asErr(B, 'b@other.com', `select accept_invite('${invId}')`)))
await as(C, 'c@staff.com', `select accept_invite('${invId}')`)
check('invite consumed', (await db.query('select count(*)::int n from shop_invites')).rows[0].n === 0)
check('C sees A cars', (await as(C, 'c@staff.com', 'select * from cars')).rows.length === 1)
check('C sees members', (await as(C, 'c@staff.com', 'select * from shop_members')).rows.length === 2)

// พนักงานลงรถ: เลขสต็อกอัตโนมัติ
const r = await as(C, 'c@staff.com', `insert into cars (shop_id, brand, stock_no) values ('${sa.id}','Mazda','') returning stock_no, created_by, updated_by`)
check('auto stock no', r.rows[0].stock_no === 'T-002' && r.rows[0].created_by === C && r.rows[0].updated_by === C, JSON.stringify(r.rows))
const r2 = await as(A, 'a@shop.com', `insert into cars (shop_id, brand, stock_no) values ('${sa.id}','Isuzu','') returning stock_no`)
check('stock no increments', r2.rows[0].stock_no === 'T-003')
// upsert path (เหมือนที่แอปเรียก)
const up = await as(C, 'c@staff.com', `insert into cars (id, shop_id, brand, stock_no) values ('11111111-1111-1111-1111-111111111111','${sa.id}','Toyota','A-001') on conflict (id) do update set brand = excluded.brand returning updated_by`)
check('staff can update car via upsert', up.rows[0].updated_by === C)
check('C cannot add car to B shop', !!(await asErr(C, 'c@staff.com', `insert into cars (shop_id, brand) values ((select id from shops where name <> 'ต.ยานยนต์'),'X')`)))

// ลบ
const del = await as(C, 'c@staff.com', `delete from cars where brand = 'Isuzu' returning id`)
check('staff cannot delete car', del.rows.length === 0)
const myExp = await as(C, 'c@staff.com', `insert into expenses (car_id, category, amount) values ('11111111-1111-1111-1111-111111111111','แอร์',1500) returning id, shop_id, created_by`)
check('expense shop from car', myExp.rows[0].shop_id === sa.id && myExp.rows[0].created_by === C)
check('staff cannot delete owner expense', (await as(C, 'c@staff.com', `delete from expenses where category = 'ยาง/ล้อ' returning id`)).rows.length === 0)
check('staff deletes own expense', (await as(C, 'c@staff.com', `delete from expenses where id = '${myExp.rows[0].id}' returning id`)).rows.length === 1)
check('B cannot add expense to A car', !!(await asErr(B, 'b@other.com', `insert into expenses (car_id, amount) values ('11111111-1111-1111-1111-111111111111', 5)`)))

// ตั้งค่า
check('staff cannot update shop', (await as(C, 'c@staff.com', `update shops set name = 'hack' returning id`)).rows.length === 0)
check('owner updates shop', (await as(A, 'a@shop.com', `update shops set name = 'ต.ยานยนต์ 2' where id = '${sa.id}' returning id`)).rows.length === 1)
check('staff cannot promote self', !!(await asErr(C, 'c@staff.com', `update shop_members set role = 'owner' where user_id = '${C}'`)))
const roleNow = (await db.query(`select role from shop_members where user_id = '${C}'`)).rows[0].role
check('role unchanged', roleNow === 'staff', roleNow)
check('staff sets own name', (await as(C, 'c@staff.com', `update shop_members set name = 'บอย' where user_id = '${C}' returning name`)).rows.length === 1)
check('owner cannot demote self', !!(await asErr(A, 'a@shop.com', `update shop_members set role = 'staff' where user_id = '${A}'`)))
check('owner promotes staff', !(await asErr(A, 'a@shop.com', `update shop_members set role = 'owner' where user_id = '${C}'`)))
await db.exec(`update shop_members set role = 'staff' where user_id = '${C}'`)
check('owner cannot remove self', (await as(A, 'a@shop.com', `delete from shop_members where user_id = '${A}' returning user_id`)).rows.length === 0)

// รูป
check('member uploads to shop folder', !(await asErr(C, 'c@staff.com', `insert into storage.objects (bucket_id, name) values ('car-photos', '${sa.id}/x.jpg')`)))
check('outsider cannot upload', !!(await asErr(B, 'b@other.com', `insert into storage.objects (bucket_id, name) values ('car-photos', '${sa.id}/y.jpg')`)))
check('weird folder no crash', !!(await asErr(B, 'b@other.com', `insert into storage.objects (bucket_id, name) values ('car-photos', 'not-a-uuid/y.jpg')`)))
await db.exec(`insert into storage.objects (bucket_id, name) values ('car-photos', '${A}/legacy.jpg'); update cars set photo_path = '${A}/legacy.jpg' where brand = 'Toyota';`)
check('staff reads legacy photo', (await as(C, 'c@staff.com', `select * from storage.objects where name = '${A}/legacy.jpg'`)).rows.length === 1)
check('outsider cannot read photo', (await as(B, 'b@other.com', `select * from storage.objects`)).rows.length === 0)

// เอาออกจากทีม
check('owner removes staff', (await as(A, 'a@shop.com', `delete from shop_members where user_id = '${C}' returning user_id`)).rows.length === 1)
check('removed staff sees nothing', (await as(C, 'c@staff.com', 'select * from cars')).rows.length === 0)
check('cars stay after removal', (await db.query(`select count(*)::int n from cars where created_by = '${C}'`)).rows[0].n === 1)

// สร้างเต็นท์ใหม่
const ns = await as(C, 'c@staff.com', `select create_shop('ร้านใหม่') as id`)
check('create_shop owner', (await as(C, 'c@staff.com', `select role from shop_members where shop_id = '${ns.rows[0].id}'`)).rows[0]?.role === 'owner')
console.log(`passed ${ok}, failed ${bad}`)
process.exit(bad ? 1 : 0)
