-- ============================================================
--  ملاحظاتي — مخطط Supabase الكامل
--  نفّذ هذا الملف مرة واحدة داخل SQL Editor في مشروع Supabase.
--  يتضمّن: الجداول، الفهارس، Triggers، وسياسات RLS.
-- ============================================================

-- ============================================================
--  1) جدول الملفات الشخصية
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_len
    check (display_name is null or char_length(display_name) <= 40)
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own"
  on public.profiles
  for delete
  to authenticated
  using ((select auth.uid()) = id);

-- ============================================================
--  2) جدول الملاحظات
-- ============================================================
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  title text not null default '',
  body text not null default '',
  tags text[] not null default '{}'::text[],
  color text not null default 'default',
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notes_title_len check (char_length(title) <= 120),
  constraint notes_body_len check (char_length(body) <= 20000),
  constraint notes_tags_max check (coalesce(cardinality(tags), 0) <= 6),
  constraint notes_color_valid check (
    color in ('default', 'amber', 'rose', 'violet', 'sky', 'emerald', 'slate')
  )
);

create index if not exists notes_user_updated_idx
  on public.notes (user_id, pinned desc, updated_at desc);

alter table public.notes enable row level security;

drop policy if exists "notes_select_own" on public.notes;
create policy "notes_select_own"
  on public.notes
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "notes_insert_own" on public.notes;
create policy "notes_insert_own"
  on public.notes
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "notes_update_own" on public.notes;
create policy "notes_update_own"
  on public.notes
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "notes_delete_own" on public.notes;
create policy "notes_delete_own"
  on public.notes
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ============================================================
--  3) دالة تحديث updated_at + Triggers
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

drop trigger if exists notes_set_updated_at on public.notes;
create trigger notes_set_updated_at
  before update on public.notes
  for each row
  execute function public.set_updated_at();

-- ملاحظة مهمة:
-- لا ننشئ Trigger على auth.users هنا، لأن SQL Editor في Supabase
-- يرفض ذلك في كثير من المشاريع برسالة:
--   must be owner of relation users (SQLSTATE 42501)
-- التطبيق ينشئ صف profile تلقائيًا عند أول تسجيل دخول
-- عبر Store.getProfile() إذا لم يكن موجودًا.

-- ============================================================
--  4) الصلاحيات — RLS هي خط الدفاع الأول
--     نمنع anon تمامًا، ونمنح authenticated الحد الأدنى فقط.
-- ============================================================
revoke all on table public.profiles from anon, authenticated;
grant usage on schema public to authenticated;
grant select on table public.profiles to authenticated;
grant insert (id, email, display_name) on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;

revoke all on table public.notes from anon, authenticated;
grant select, delete on table public.notes to authenticated;
grant insert (title, body, tags, color, pinned) on table public.notes to authenticated;
grant update (title, body, tags, color, pinned) on table public.notes to authenticated;

-- ============================================================
--  ملاحظات أمنية:
--  - لا تضع service_role key في ملفات الواجهة أو GitHub.
--  - anon / publishable key مصمّم للواجهة العامة، والأمان يأتي من RLS.
--  - لحذف حساب مستخدم نهائيًا، احذفه من Authentication > Users
--    في لوحة Supabase؛ حذف auth.users يحذف profile وملاحظاته تلقائيًا.
-- ============================================================
