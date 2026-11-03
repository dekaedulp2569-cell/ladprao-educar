-- ============================================================
-- RLS สำหรับโหมด Demo เท่านั้น (อ่าน/เขียนได้ทุกคนที่มี anon key)
-- ⚠️ ไม่ปลอดภัยพอสำหรับใช้งานจริง ต้องเปลี่ยนเป็น Supabase Auth
--    + policy ตามบทบาท (requester/admin/head_of_dept/driver) ก่อนProduction
-- ============================================================

alter table public.car_requests enable row level security;
alter table public.cars enable row level security;
alter table public.drivers enable row level security;
alter table public.user_profiles enable row level security;

drop policy if exists demo_all_car_requests on public.car_requests;
create policy demo_all_car_requests on public.car_requests
  for all to anon, authenticated using (true) with check (true);

drop policy if exists demo_all_cars on public.cars;
create policy demo_all_cars on public.cars
  for all to anon, authenticated using (true) with check (true);

drop policy if exists demo_all_drivers on public.drivers;
create policy demo_all_drivers on public.drivers
  for all to anon, authenticated using (true) with check (true);

drop policy if exists demo_all_user_profiles on public.user_profiles;
create policy demo_all_user_profiles on public.user_profiles
  for all to anon, authenticated using (true) with check (true);

-- Indexes
create index if not exists idx_car_requests_status on public.car_requests (status);
create index if not exists idx_car_requests_car on public.car_requests (assigned_car_id);
create index if not exists idx_car_requests_driver on public.car_requests (assigned_driver_id);

-- Trigger updated_at
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_car_requests_updated_at on public.car_requests;
create trigger trg_car_requests_updated_at
  before update on public.car_requests
  for each row execute function public.set_updated_at();
