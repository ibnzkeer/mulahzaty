-- ============================================================
-- ملاحظاتي (My Notes) — Supabase schema + RLS
-- الصق هذا الكود في: Supabase Dashboard -> SQL Editor -> New query
-- ============================================================

-- 1) جدول الملاحظات
create table if not exists public.notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  title      text not null default '',
  content    text not null default '',
  color      text not null default '',
  pinned     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) فهارس لتحسين الأداء
create index if not exists notes_user_id_idx     on public.notes (user_id);
create index if not exists notes_updated_at_idx  on public.notes (updated_at desc);

-- 3) تفعيل RLS (Row Level Security) — حماية على مستوى الصفوف
alter table public.notes enable row level security;

-- 4) سياسات RLS: كل مستخدم يرى/يعدّل ملاحظاته فقط
drop policy if exists "notes_select_own" on public.notes;
create policy "notes_select_own"
  on public.notes for select
  using (auth.uid() = user_id);

drop policy if exists "notes_insert_own" on public.notes;
create policy "notes_insert_own"
  on public.notes for insert
  with check (auth.uid() = user_id);

drop policy if exists "notes_update_own" on public.notes;
create policy "notes_update_own"
  on public.notes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "notes_delete_own" on public.notes;
create policy "notes_delete_own"
  on public.notes for delete
  using (auth.uid() = user_id);

-- 5) تحديث updated_at تلقائياً
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists notes_set_updated_at on public.notes;
create trigger notes_set_updated_at
  before update on public.notes
  for each row
  execute function public.set_updated_at();

-- ============================================================
-- إعدادات إضافية (من لوحة التحكم، وليس SQL):
-- Authentication -> Providers -> Email: فعّل "Confirm email" حسب رغبتك.
--   * إذا تركته مفعّلاً، المستخدم سي需要 تأكيد بريده قبل تسجيل الدخول.
--   * للتجربة السريعة، يمكنك تعطيل "Confirm email".
-- Authentication -> URL Configuration: أضف رابط GitHub Pages:
--   https://ibnzkeer.github.io/mulahzaty/
-- ============================================================
