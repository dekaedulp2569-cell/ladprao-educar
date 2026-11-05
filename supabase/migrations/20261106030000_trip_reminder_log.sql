-- กันการแจ้งเตือนซ้ำเมื่อ pg_cron เรียก trip-reminders ทุก 5 นาที
create table if not exists public.trip_reminder_log (
  id bigserial primary key,
  request_id uuid not null references public.car_requests (id) on delete cascade,
  reminder_type text not null check (reminder_type in ('driver_30', 'driver_10', 'related_10')),
  line_user_id text not null,
  sent_at timestamptz not null default now(),
  unique (request_id, reminder_type, line_user_id)
);

create index if not exists trip_reminder_log_request_idx
  on public.trip_reminder_log (request_id, reminder_type);

alter table public.trip_reminder_log enable row level security;
-- ไม่มี policy: เข้าถึงได้เฉพาะ service role จาก Edge Function เท่านั้น
