-- ============================================================================
-- Esquema de Base de Datos y Políticas de Seguridad (RLS) para Supabase
-- Plan de Estudios 2026 - Licenciatura en Ciencias Biológicas (CRUB - UNCo)
-- ============================================================================
-- Instrucciones:
-- 1. Crear un proyecto gratuito en https://supabase.com
-- 2. Ir a SQL Editor -> New Query, pegar este archivo completo y ejecutar (Run).
-- 3. Ir a Authentication -> Providers -> Google, habilitar Google OAuth.
-- 4. Insertar los emails de coordinación/comisión en la tabla `coordinators`.
-- ============================================================================

-- 1. Tabla de coordinadores / miembros de la comisión de implementación
create table if not exists public.coordinators (
  email text primary key,
  name text,
  added_at timestamptz default now()
);

-- 2. Tabla de perfiles docentes
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  department text default '',
  current_position text default '',
  current_courses text default '',
  general_notes text default '',
  updated_at timestamptz default now()
);

-- 3. Tabla de postulaciones / interés por asignatura
create table if not exists public.course_interests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id integer not null check (course_id between 1 and 41),
  wants_participant boolean not null default false,
  wants_charge boolean not null default false,
  comment text default '',
  updated_at timestamptz default now(),
  constraint unique_user_course unique (user_id, course_id),
  constraint at_least_one_role check (wants_participant or wants_charge)
);

-- Índices para consultas rápidas
create index if not exists idx_course_interests_user on public.course_interests(user_id);
create index if not exists idx_course_interests_course on public.course_interests(course_id);

-- 4. Función auxiliar segura para verificar si el usuario autenticado es coordinador
create or replace function public.is_coordinator()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.coordinators
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- 5. Habilitar Row Level Security (RLS)
alter table public.coordinators enable row level security;
alter table public.profiles enable row level security;
alter table public.course_interests enable row level security;

-- Políticas para `coordinators`: cada usuario solo puede verificar su propio email
drop policy if exists "Users can check if they are coordinator" on public.coordinators;
create policy "Users can check if they are coordinator"
  on public.coordinators
  for select
  to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- Políticas para `profiles`:
-- Cada docente ve/edita su propio perfil; coordinación puede ver todos los perfiles
drop policy if exists "Profiles select own or coordinator" on public.profiles;
create policy "Profiles select own or coordinator"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id or public.is_coordinator());

drop policy if exists "Profiles insert own" on public.profiles;
create policy "Profiles insert own"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "Profiles update own" on public.profiles;
create policy "Profiles update own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Políticas para `course_interests`:
-- Cada docente ve/edita/elimina solo sus respuestas; coordinación ve todas
drop policy if exists "Interests select own or coordinator" on public.course_interests;
create policy "Interests select own or coordinator"
  on public.course_interests
  for select
  to authenticated
  using (auth.uid() = user_id or public.is_coordinator());

drop policy if exists "Interests insert own" on public.course_interests;
create policy "Interests insert own"
  on public.course_interests
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Interests update own" on public.course_interests;
create policy "Interests update own"
  on public.course_interests
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Interests delete own" on public.course_interests;
create policy "Interests delete own"
  on public.course_interests
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- ============================================================================
-- EJEMPLO: Agregar coordinadores / miembros de la comisión de implementación
-- Reemplazar con los correos de Google reales de quienes tendrán acceso a la vista consolidada:
-- ============================================================================
-- insert into public.coordinators (email, name) values
--   ('coordinacion.biologia@crub.uncoma.edu.ar', 'Coordinación de Carrera'),
--   ('miembro.comision@gmail.com', 'Miembro Comisión');
