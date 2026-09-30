-- Run this ONCE in Supabase: SQL Editor > New query > paste > Run.

-- 1. One row per user holding their study data (private to that user)
create table if not exists public.user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.user_data enable row level security;

create policy "read own data"   on public.user_data for select using (auth.uid() = user_id);
create policy "insert own data" on public.user_data for insert with check (auth.uid() = user_id);
create policy "update own data" on public.user_data for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own data" on public.user_data for delete using (auth.uid() = user_id);

-- 2. Private bucket for note photos (each user can only touch their own folder)
insert into storage.buckets (id, name, public) values ('note-images', 'note-images', false)
on conflict (id) do nothing;

create policy "read own photos"   on storage.objects for select to authenticated
  using (bucket_id = 'note-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "upload own photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'note-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "update own photos" on storage.objects for update to authenticated
  using (bucket_id = 'note-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "delete own photos" on storage.objects for delete to authenticated
  using (bucket_id = 'note-images' and (storage.foldername(name))[1] = auth.uid()::text);
