alter table public.car_requests
  drop constraint if exists car_requests_status_check;

alter table public.car_requests
  add constraint car_requests_status_check
  check (status in ('pending', 'tentative', 'approved', 'rejected', 'cancelled'));

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

  if new.status = 'cancelled' and old.status <> 'approved' then
    raise exception 'Only approved requests can be cancelled'
      using errcode = '23514';
  end if;

  if public.is_line_admin() then
    return new;
  end if;

  if old.status = 'approved'
    and new.status = 'cancelled'
    and old.requester_auth_user_id = auth.uid()
    and (to_jsonb(new) - 'status' - 'updated_at') = (to_jsonb(old) - 'status' - 'updated_at')
  then
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
    or (
      requester_auth_user_id = auth.uid()
      and status = 'approved'
    )
  )
  with check (
    public.is_line_admin()
    or (
      public.current_line_profile_role() = 'head_of_dept'
      and approval_type = 'head_of_dept'
      and status in ('approved', 'rejected')
    )
    or (
      requester_auth_user_id = auth.uid()
      and status = 'cancelled'
    )
  );
