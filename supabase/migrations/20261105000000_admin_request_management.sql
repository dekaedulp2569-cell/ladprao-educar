create or replace function public.recalculate_car_request_approval_route()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  start_local timestamp;
  end_local timestamp;
  day_cursor date;
  special_request boolean;
  trip_changed boolean;
begin
  trip_changed :=
    new.start_datetime is distinct from old.start_datetime
    or new.end_datetime is distinct from old.end_datetime
    or new.destination_province is distinct from old.destination_province
    or new.is_public_holiday is distinct from old.is_public_holiday;

  if not trip_changed then
    return new;
  end if;

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

  new.approval_type := case
    when special_request then 'district_director'
    else 'head_of_dept'
  end;
  new.director_approval_status := case
    when special_request then 'pending'
    else 'not_required'
  end;

  if old.status in ('pending', 'tentative', 'approved') then
    new.status := case
      when special_request then 'tentative'
      else 'pending'
    end;
  elsif old.status = 'rejected' and special_request then
    new.director_approval_status := 'rejected';
  end if;

  if old.status = 'approved' then
    new.assigned_car_id := null;
    new.assigned_driver_id := null;
    new.external_car_info := null;
    new.external_driver_name := null;
  end if;

  return new;
end
$$;

drop trigger if exists recalculate_car_request_approval_route on public.car_requests;
create trigger recalculate_car_request_approval_route
  before update of start_datetime, end_datetime, destination_province, is_public_holiday
  on public.car_requests
  for each row execute function public.recalculate_car_request_approval_route();
