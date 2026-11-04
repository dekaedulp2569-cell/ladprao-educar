alter table public.car_requests
  add column if not exists request_date date;

update public.car_requests
set request_date = (created_at at time zone 'Asia/Bangkok')::date
where request_date is null;

alter table public.car_requests
  alter column request_date set default ((now() at time zone 'Asia/Bangkok')::date),
  alter column request_date set not null;
