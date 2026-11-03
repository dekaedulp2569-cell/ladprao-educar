alter table public.user_profiles
  add column if not exists auth_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists approval_status text not null default 'approved';

alter table public.user_profiles
  alter column approval_status set default 'pending';

alter table public.user_profiles
  drop constraint if exists user_profiles_approval_status_check;

alter table public.user_profiles
  add constraint user_profiles_approval_status_check
  check (approval_status in ('pending', 'approved', 'rejected'));

create unique index if not exists user_profiles_auth_user_id_key
  on public.user_profiles (auth_user_id)
  where auth_user_id is not null;

alter table public.car_requests
  add column if not exists requester_auth_user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_car_requests_requester_auth_user_id
  on public.car_requests (requester_auth_user_id);

create or replace function public.current_line_profile_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role
  from public.user_profiles
  where auth_user_id = auth.uid()
    and approval_status = 'approved'
  limit 1
$$;

create or replace function public.is_line_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.current_line_profile_role() in ('admin', 'head_of_dept'), false)
$$;

create or replace function public.is_assigned_line_driver(target_driver_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.drivers d
    join public.user_profiles p on p.line_user_id = d.line_user_id
    where d.id = target_driver_id
      and p.auth_user_id = auth.uid()
      and p.approval_status = 'approved'
      and p.role = 'driver'
  )
$$;

grant execute on function public.current_line_profile_role() to anon, authenticated;
grant execute on function public.is_line_staff() to anon, authenticated;
grant execute on function public.is_assigned_line_driver(uuid) to anon, authenticated;

alter table public.user_profiles enable row level security;
alter table public.car_requests enable row level security;
alter table public.cars enable row level security;
alter table public.drivers enable row level security;

drop policy if exists demo_all_user_profiles on public.user_profiles;
drop policy if exists demo_all_car_requests on public.car_requests;
drop policy if exists demo_all_cars on public.cars;
drop policy if exists demo_all_drivers on public.drivers;

drop policy if exists line_profile_read on public.user_profiles;
create policy line_profile_read on public.user_profiles
  for select to authenticated
  using (auth_user_id = auth.uid() or public.is_line_staff());

drop policy if exists line_profile_update on public.user_profiles;
create policy line_profile_update on public.user_profiles
  for update to authenticated
  using (public.is_line_staff())
  with check (public.is_line_staff());

drop policy if exists line_profile_insert on public.user_profiles;
create policy line_profile_insert on public.user_profiles
  for insert to authenticated
  with check (public.is_line_staff());

drop policy if exists line_profile_delete on public.user_profiles;
create policy line_profile_delete on public.user_profiles
  for delete to authenticated
  using (public.is_line_staff());

drop policy if exists line_cars_read on public.cars;
create policy line_cars_read on public.cars
  for select to anon, authenticated
  using (true);

drop policy if exists line_cars_manage on public.cars;
create policy line_cars_manage on public.cars
  for all to authenticated
  using (public.is_line_staff())
  with check (public.is_line_staff());

drop policy if exists line_drivers_read on public.drivers;
create policy line_drivers_read on public.drivers
  for select to anon, authenticated
  using (true);

drop policy if exists line_drivers_manage on public.drivers;
create policy line_drivers_manage on public.drivers
  for all to authenticated
  using (public.is_line_staff())
  with check (public.is_line_staff());

create or replace view public.admin_drivers
with (security_barrier = true)
as
select *
from public.drivers
where public.is_line_staff();

grant select on public.admin_drivers to authenticated;
revoke select on public.drivers from anon, authenticated;
grant select (id, full_name, nickname, dept, is_active, created_at)
  on public.drivers to anon, authenticated;

drop policy if exists line_car_requests_read on public.car_requests;
create policy line_car_requests_read on public.car_requests
  for select to authenticated
  using (
    requester_auth_user_id = auth.uid()
    or public.is_line_staff()
    or public.is_assigned_line_driver(assigned_driver_id)
  );

drop policy if exists line_car_requests_create on public.car_requests;
create policy line_car_requests_create on public.car_requests
  for insert to authenticated
  with check (
    requester_auth_user_id = auth.uid()
    and public.current_line_profile_role() = 'requester'
    and status in ('pending', 'tentative')
    and assigned_car_id is null
    and assigned_driver_id is null
    and external_car_info is null
    and external_driver_name is null
  );

drop policy if exists line_car_requests_update on public.car_requests;
create policy line_car_requests_update on public.car_requests
  for update to authenticated
  using (public.is_line_staff())
  with check (public.is_line_staff());

drop policy if exists line_car_requests_delete on public.car_requests;
create policy line_car_requests_delete on public.car_requests
  for delete to authenticated
  using (public.is_line_staff());

create or replace view public.public_car_calendar
with (security_barrier = true)
as
select
  id,
  status,
  destination,
  destination_province,
  start_datetime,
  end_datetime,
  assigned_car_id,
  external_car_info
from public.car_requests
where status in ('approved', 'tentative');

grant select on public.public_car_calendar to anon, authenticated;
revoke all on public.car_requests from anon;
revoke insert, update, delete on public.car_requests from anon, authenticated;
grant select, insert, update, delete on public.car_requests to authenticated;

revoke insert, update, delete on public.user_profiles from anon, authenticated;
revoke all on public.user_profiles from anon;
grant select, insert, update, delete on public.user_profiles to authenticated;
revoke insert, update, delete on public.cars from anon;
revoke insert, update, delete on public.drivers from anon;
grant select on public.cars to anon, authenticated;
grant select, insert, update, delete on public.cars to authenticated;
grant insert, update, delete on public.drivers to authenticated;

comment on column public.user_profiles.approval_status is
  'LINE account approval gate: pending, approved, or rejected';
comment on column public.car_requests.requester_auth_user_id is
  'Supabase Auth user who submitted the request';
