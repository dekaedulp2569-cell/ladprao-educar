alter table public.car_requests
  add column if not exists is_weekend boolean not null default false,
  add column if not exists is_public_holiday boolean not null default false;

create or replace function public.is_line_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.current_line_profile_role() = 'admin', false)
$$;

grant execute on function public.is_line_admin() to anon, authenticated;

create or replace function public.set_car_request_approval_route()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  start_local timestamp;
  end_local timestamp;
  day_cursor date;
  special_request boolean;
begin
  if new.end_datetime <= new.start_datetime then
    raise exception 'End time must be after start time'
      using errcode = '22007';
  end if;

  start_local := new.start_datetime at time zone 'Asia/Bangkok';
  end_local := new.end_datetime at time zone 'Asia/Bangkok';

  new.is_out_of_bkk := coalesce(new.destination_province, '') <> 'กรุงเทพมหานคร';
  new.is_out_of_hours :=
    start_local::time < time '08:00'
    or end_local::time > time '16:00'
    or start_local::date <> end_local::date;

  new.is_weekend := false;
  day_cursor := start_local::date;
  while day_cursor <= end_local::date loop
    if extract(isodow from day_cursor) in (6, 7) then
      new.is_weekend := true;
      exit;
    end if;
    day_cursor := day_cursor + 1;
  end loop;

  special_request :=
    new.is_out_of_bkk
    or new.is_out_of_hours
    or new.is_weekend
    or coalesce(new.is_public_holiday, false);

  if special_request then
    new.approval_type := 'district_director';
    new.status := 'tentative';
    new.director_approval_status := 'pending';
  else
    new.approval_type := 'head_of_dept';
    new.status := 'pending';
    new.director_approval_status := 'not_required';
  end if;

  return new;
end
$$;

drop trigger if exists set_car_request_approval_route on public.car_requests;
create trigger set_car_request_approval_route
  before insert on public.car_requests
  for each row execute function public.set_car_request_approval_route();

create or replace function public.guard_line_request_update()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.status = 'approved'
    and old.approval_type = 'district_director'
    and new.director_approval_status is distinct from 'approved'
  then
    raise exception 'District director approval must be recorded before approving this request'
      using errcode = '23514';
  end if;

  if public.is_line_admin() then
    return new;
  end if;

  if public.current_line_profile_role() = 'head_of_dept'
    and old.approval_type = 'head_of_dept'
    and old.status = 'pending'
    and new.status in ('approved', 'rejected')
    and (to_jsonb(new) - 'status' - 'updated_at') = (to_jsonb(old) - 'status' - 'updated_at')
  then
    return new;
  end if;

  raise exception 'Insufficient permission to update this request'
    using errcode = '42501';
end
$$;

drop trigger if exists guard_line_request_update on public.car_requests;
create trigger guard_line_request_update
  before update on public.car_requests
  for each row execute function public.guard_line_request_update();

drop policy if exists line_profile_update on public.user_profiles;
drop policy if exists line_profile_read on public.user_profiles;
create policy line_profile_read on public.user_profiles
  for select to authenticated
  using (auth_user_id = auth.uid() or public.is_line_admin());

create policy line_profile_update on public.user_profiles
  for update to authenticated
  using (public.is_line_admin())
  with check (public.is_line_admin());

drop policy if exists line_profile_insert on public.user_profiles;
create policy line_profile_insert on public.user_profiles
  for insert to authenticated
  with check (public.is_line_admin());

drop policy if exists line_profile_delete on public.user_profiles;
create policy line_profile_delete on public.user_profiles
  for delete to authenticated
  using (public.is_line_admin());

drop policy if exists line_cars_manage on public.cars;
create policy line_cars_manage on public.cars
  for all to authenticated
  using (public.is_line_admin())
  with check (public.is_line_admin());

drop policy if exists line_drivers_manage on public.drivers;
create policy line_drivers_manage on public.drivers
  for all to authenticated
  using (public.is_line_admin())
  with check (public.is_line_admin());

create or replace view public.admin_drivers
with (security_barrier = true)
as
select *
from public.drivers
where public.is_line_admin();

drop policy if exists line_car_requests_read on public.car_requests;
create policy line_car_requests_read on public.car_requests
  for select to authenticated
  using (
    requester_auth_user_id = auth.uid()
    or public.is_line_admin()
    or (
      public.current_line_profile_role() = 'head_of_dept'
      and approval_type = 'head_of_dept'
    )
    or public.is_assigned_line_driver(assigned_driver_id)
  );

drop policy if exists line_car_requests_create on public.car_requests;
create policy line_car_requests_create on public.car_requests
  for insert to authenticated
  with check (
    requester_auth_user_id = auth.uid()
    and public.current_line_profile_role() in ('requester', 'driver', 'head_of_dept', 'admin')
    and status in ('pending', 'tentative')
    and assigned_car_id is null
    and assigned_driver_id is null
    and external_car_info is null
    and external_driver_name is null
  );

drop policy if exists line_car_requests_update on public.car_requests;
create policy line_car_requests_update on public.car_requests
  for update to authenticated
  using (
    public.is_line_admin()
    or (
      public.current_line_profile_role() = 'head_of_dept'
      and approval_type = 'head_of_dept'
      and status = 'pending'
    )
  )
  with check (
    public.is_line_admin()
    or (
      public.current_line_profile_role() = 'head_of_dept'
      and approval_type = 'head_of_dept'
      and status in ('approved', 'rejected')
    )
  );

drop policy if exists line_car_requests_delete on public.car_requests;
create policy line_car_requests_delete on public.car_requests
  for delete to authenticated
  using (public.is_line_admin());

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
where status = 'approved';

grant select on public.public_car_calendar to anon, authenticated;
