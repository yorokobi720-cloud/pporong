-- 뽀롱 온라인 모드용 데이터베이스 설정
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 Run 을 누르세요.

-- 1) 모든 데이터를 담는 테이블 하나
create table if not exists public.docs (
  id text primary key,
  kind text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists docs_kind_idx on public.docs (kind);

-- 2) 앱에서 읽고 쓸 수 있게 허용 (개인용 놀이 앱 기준의 간단한 설정)
alter table public.docs enable row level security;
drop policy if exists "pporong all" on public.docs;
create policy "pporong all" on public.docs for all using (true) with check (true);

grant select, insert, update, delete on public.docs to anon, authenticated;

-- 3) 실시간 동기화 켜기
alter table public.docs replica identity full;
alter publication supabase_realtime add table public.docs;

-- 4) 사진·영상·음성 저장 공간
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;
drop policy if exists "pporong media read" on storage.objects;
drop policy if exists "pporong media upload" on storage.objects;
create policy "pporong media read" on storage.objects for select using (bucket_id = 'media');
create policy "pporong media upload" on storage.objects for insert with check (bucket_id = 'media');
