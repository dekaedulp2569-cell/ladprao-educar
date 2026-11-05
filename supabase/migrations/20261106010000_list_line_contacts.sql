-- Migration: expose approved LINE contacts for the "related people" picker
-- Returns only approved profiles that have a LINE User ID.
-- SECURITY DEFINER is required because user_profiles RLS only lets a requester read their own row.

create or replace function public.list_line_contacts()
returns table (
  id uuid,
  full_name text,
  department text,
  role text,
  line_user_id text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p.id,
    p.full_name,
    p.department,
    p.role,
    p.line_user_id
  from public.user_profiles p
  where p.approval_status = 'approved'
    and p.line_user_id is not null
    and exists (
      select 1
      from public.user_profiles me
      where me.auth_user_id = auth.uid()
        and me.approval_status = 'approved'
    )
  order by p.full_name
$$;

revoke all on function public.list_line_contacts() from public, anon;
grant execute on function public.list_line_contacts() to authenticated;

comment on function public.list_line_contacts() is
  'รายชื่อผู้ใช้ที่อนุมัติแล้วและเชื่อม LINE สำหรับเลือกเป็นผู้ที่เกี่ยวข้องในคำขอใช้รถ';
