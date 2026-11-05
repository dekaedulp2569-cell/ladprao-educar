-- จัดการกลุ่ม LINE ได้จากหน้าเว็บ (แทนการตั้งค่า secret ผ่าน CLI)
-- ตารางนี้เก็บกลุ่มที่บอทอยู่จริง และใช้เลือก "กลุ่มเริ่มต้น" สำหรับแจ้งเตือน
create table if not exists public.line_groups (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  group_id text not null unique,
  note text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint line_groups_group_id_format check (group_id ~ '^[CUR][0-9a-fA-F]{32}$')
);

-- มีกลุ่มเริ่มต้นได้เพียงกลุ่มเดียว
create unique index if not exists line_groups_single_default_idx
  on public.line_groups (is_default)
  where is_default;

-- เมื่อตั้งกลุ่มใหม่เป็นค่าเริ่มต้น ให้ปลดกลุ่มเดิมอัตโนมัติ
create or replace function public.line_groups_enforce_single_default()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.is_default then
    update public.line_groups
       set is_default = false,
           updated_at = now()
     where id <> new.id
       and is_default;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists line_groups_single_default on public.line_groups;
create trigger line_groups_single_default
  before insert or update on public.line_groups
  for each row execute function public.line_groups_enforce_single_default();

alter table public.line_groups enable row level security;

drop policy if exists line_groups_manage on public.line_groups;
create policy line_groups_manage on public.line_groups
  for all
  to authenticated
  using (public.is_line_admin())
  with check (public.is_line_admin());

-- กลุ่มเดิมที่เคยตั้งผ่าน LINE_GROUP_ID ให้แสดงในหน้าเว็บทันที
insert into public.line_groups (name, group_id, note, is_default)
values (
  'ฝ่ายการศึกษา',
  'Cb69656719cba7bfa1bbfed5ddbd11434',
  'กลุ่มเดิมที่ตั้งค่าไว้ใน LINE_GROUP_ID',
  true
)
on conflict (group_id) do nothing;
