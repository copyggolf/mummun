-- MUNMUN CLINIC • Phase 1 schema
-- Run in Supabase SQL Editor on a NEW project. Do not enter real patient data until security review.
create table if not exists public.staff_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null check (role in ('admin', 'receptionist', 'doctor')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(trim(full_name)) between 2 and 200),
  phone text not null default '' check (length(phone) <= 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  doctor_user_id uuid references public.staff_profiles(user_id) on delete set null,
  starts_at timestamptz not null,
  service_name text not null check (length(trim(service_name)) between 2 and 120),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists appointments_starts_at_idx on public.appointments(starts_at);
create index if not exists appointments_client_id_idx on public.appointments(client_id);
create index if not exists appointments_doctor_user_id_idx on public.appointments(doctor_user_id);
create index if not exists clients_created_at_idx on public.clients(created_at);

-- Role checks are evaluated by Postgres, not trusted from JavaScript/client-provided metadata.
create or replace function public.has_clinic_role(allowed_roles text[])
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.staff_profiles s
    where s.user_id = (select auth.uid())
      and s.active = true
      and s.role = any(allowed_roles)
  )
$$;

revoke all on function public.has_clinic_role(text[]) from public;
revoke all on function public.has_clinic_role(text[]) from anon;
grant execute on function public.has_clinic_role(text[]) to authenticated;

alter table public.staff_profiles enable row level security;
alter table public.clients enable row level security;
alter table public.appointments enable row level security;

-- Explicit grants are needed when calling PostgREST as the authenticated role.
revoke all on public.staff_profiles, public.clients, public.appointments from anon;
grant select, insert, update, delete on public.staff_profiles, public.clients, public.appointments to authenticated;

drop policy if exists staff_select on public.staff_profiles;
create policy staff_select on public.staff_profiles for select to authenticated
using (
  user_id = (select auth.uid())
  or public.has_clinic_role(array['admin'])
  or (active and role = 'doctor' and public.has_clinic_role(array['receptionist']))
);

drop policy if exists staff_insert_admin on public.staff_profiles;
create policy staff_insert_admin on public.staff_profiles for insert to authenticated
with check (public.has_clinic_role(array['admin']));

drop policy if exists staff_update_admin on public.staff_profiles;
create policy staff_update_admin on public.staff_profiles for update to authenticated
using (public.has_clinic_role(array['admin']))
with check (public.has_clinic_role(array['admin']));

drop policy if exists staff_delete_admin on public.staff_profiles;
create policy staff_delete_admin on public.staff_profiles for delete to authenticated
using (public.has_clinic_role(array['admin']));

drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients for select to authenticated using (
  public.has_clinic_role(array['admin','receptionist'])
  or (
    public.has_clinic_role(array['doctor'])
    and exists (
      select 1 from public.appointments a
      where a.client_id = clients.id and a.doctor_user_id = (select auth.uid())
    )
  )
);

drop policy if exists clients_insert on public.clients;
create policy clients_insert on public.clients for insert to authenticated
with check (public.has_clinic_role(array['admin','receptionist']));

drop policy if exists clients_update on public.clients;
create policy clients_update on public.clients for update to authenticated
using (public.has_clinic_role(array['admin','receptionist']))
with check (public.has_clinic_role(array['admin','receptionist']));

drop policy if exists clients_delete on public.clients;
create policy clients_delete on public.clients for delete to authenticated
using (public.has_clinic_role(array['admin']));

drop policy if exists appointments_select on public.appointments;
create policy appointments_select on public.appointments for select to authenticated using (
  public.has_clinic_role(array['admin','receptionist'])
  or (public.has_clinic_role(array['doctor']) and doctor_user_id = (select auth.uid()))
);

drop policy if exists appointments_insert on public.appointments;
create policy appointments_insert on public.appointments for insert to authenticated
with check (public.has_clinic_role(array['admin','receptionist']));

drop policy if exists appointments_update on public.appointments;
create policy appointments_update on public.appointments for update to authenticated
using (public.has_clinic_role(array['admin','receptionist']))
with check (public.has_clinic_role(array['admin','receptionist']));

drop policy if exists appointments_delete on public.appointments;
create policy appointments_delete on public.appointments for delete to authenticated
using (public.has_clinic_role(array['admin']));

-- BOOTSTRAP ADMIN: run this SEPARATELY after creating an email/password user
-- in Supabase > Authentication > Users. Replace the example email first:
--
-- insert into public.staff_profiles (user_id, display_name, role)
-- select id, 'ผู้ดูแลระบบ', 'admin'
-- from auth.users where lower(email) = lower('YOUR_ADMIN_EMAIL@example.com')
-- on conflict (user_id) do update
-- set role = 'admin', display_name = excluded.display_name, active = true;
--
-- Verify row exists: select user_id, display_name, role from public.staff_profiles;
