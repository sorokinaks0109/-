-- Ballet Forever: база для Supabase.
-- Скопируйте файл целиком в Supabase → SQL Editor → New query и нажмите Run. Запускать можно повторно.

-- Все данные студии (ученицы, абонементы, посещения, расписание, настройки) лежат одним документом.
-- Одна строка на преподавателя. version защищает от перезаписи, если приложение открыто на двух устройствах.
create table if not exists public.studio (
  owner      uuid primary key default auth.uid() references auth.users on delete cascade,
  data       jsonb not null,
  version    integer not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.studio enable row level security;

drop policy if exists "studio: свои данные" on public.studio;
create policy "studio: свои данные" on public.studio
  for select using (owner = auth.uid());

-- Писать напрямую нельзя, только через save_studio.
revoke insert, update, delete on public.studio from anon, authenticated;

-- Сохранение. Возвращает новую версию или ошибку conflict, если данные успели поменяться на другом устройстве.
create or replace function public.save_studio(p_data jsonb, p_version integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v integer;
begin
  if auth.uid() is null then
    raise exception 'auth required';
  end if;

  update studio
     set data = p_data, version = version + 1, updated_at = now()
   where owner = auth.uid() and version = p_version
  returning version into v;

  if found then
    return v;
  end if;

  if exists (select 1 from studio where owner = auth.uid()) then
    raise exception 'conflict';
  end if;

  insert into studio (owner, data, version) values (auth.uid(), p_data, 1)
  returning version into v;
  return v;
end;
$$;

revoke all on function public.save_studio(jsonb, integer) from public, anon;
grant execute on function public.save_studio(jsonb, integer) to authenticated;

-- Страница ученицы: по личному коду из ссылки отдаёт только её имя, абонементы, посещения и расписание.
-- Телефоны, заметки, деньги других учениц сюда не попадают.
create or replace function public.student_card(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  d   jsonb;
  st  jsonb;
begin
  if p_token is null or length(p_token) < 16 then
    return null;
  end if;

  select s.data, x
    into d, st
    from studio s, jsonb_array_elements(s.data -> 'students') x
   where x ->> 'token' = p_token
   limit 1;

  if st is null then
    return null;
  end if;

  return jsonb_build_object(
    'student', jsonb_build_object('id', st -> 'id', 'name', st -> 'name'),
    'passes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p -> 'id', 'studentId', p -> 'studentId', 'perWeek', p -> 'perWeek', 'weeks', p -> 'weeks',
        'total', p -> 'total', 'start', p -> 'start', 'freezes', coalesce(p -> 'freezes', '[]'::jsonb)))
        from jsonb_array_elements(d -> 'passes') p
       where p ->> 'studentId' = st ->> 'id'), '[]'::jsonb),
    'visits', coalesce((
      select jsonb_agg(jsonb_build_object('date', v -> 'date', 'classId', v -> 'classId', 'kind', v -> 'kind', 'passId', v -> 'passId'))
        from jsonb_array_elements(d -> 'visits') v
       where v ->> 'studentId' = st ->> 'id'), '[]'::jsonb),
    'schedule', coalesce(d -> 'schedule', '[]'::jsonb),
    'settings', jsonb_build_object(
      'soonLessons', d -> 'settings' -> 'soonLessons',
      'soonDays', d -> 'settings' -> 'soonDays',
      'priceSingle', d -> 'settings' -> 'priceSingle',
      'pricePerLesson', d -> 'settings' -> 'pricePerLesson')
  );
end;
$$;

revoke all on function public.student_card(text) from public;
grant execute on function public.student_card(text) to anon, authenticated;
