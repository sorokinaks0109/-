-- Ballet Forever: база для Supabase.
-- Скопируйте файл целиком в Supabase → SQL Editor → New query и нажмите Run. Запускать можно повторно.

-- ---------------------------------------------------------------------------
-- Таблицы
-- ---------------------------------------------------------------------------

-- Данные студии одним документом: ученицы, абонементы, посещения, расписание, настройки.
-- Одна строка на преподавателя. version защищает от перезаписи с двух устройств.
-- invite: код общей ссылки, по которой новые ученицы присылают заявку.
create table if not exists public.studio (
  owner      uuid primary key default auth.uid() references auth.users on delete cascade,
  data       jsonb not null,
  version    integer not null default 1,
  invite     text not null unique default substr(md5(random()::text || clock_timestamp()::text), 1, 12),
  updated_at timestamptz not null default now()
);

alter table public.studio add column if not exists invite text unique default substr(md5(random()::text || clock_timestamp()::text), 1, 12);

-- Постоянные дни ученицы: список занятий расписания, на которые она обычно ходит.
create table if not exists public.student_days (
  owner      uuid not null references auth.users on delete cascade,
  student_id text not null,
  class_ids  text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (owner, student_id)
);

-- Отметки на конкретное занятие: skip — не приду, extra — приду дополнительно.
create table if not exists public.intents (
  owner      uuid not null references auth.users on delete cascade,
  student_id text not null,
  date       date not null,
  class_id   text not null,
  kind       text not null check (kind in ('skip', 'extra')),
  created_at timestamptz not null default now(),
  primary key (owner, student_id, date, class_id)
);

-- Заявки от учениц: join — новая ученица, payment — «я оплатила», freeze — пропуск по уважительной причине.
-- photo: фото документа (data URL). Удаляется, как только заявку разобрали, и в любом случае через 14 дней.
create table if not exists public.requests (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null references auth.users on delete cascade,
  student_id  text,
  token       text,
  kind        text not null check (kind in ('join', 'payment', 'freeze')),
  payload     jsonb not null default '{}',
  photo       text,
  status      text not null default 'new' check (status in ('new', 'approved', 'rejected')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
alter table public.requests add column if not exists has_photo boolean generated always as (photo is not null) stored;
create index if not exists requests_owner_status on public.requests (owner, status);
create index if not exists requests_token on public.requests (token);

-- ---------------------------------------------------------------------------
-- Доступ преподавателя: только свои строки. Ученицы работают только через функции ниже.
-- ---------------------------------------------------------------------------
alter table public.studio enable row level security;
alter table public.student_days enable row level security;
alter table public.intents enable row level security;
alter table public.requests enable row level security;

drop policy if exists "studio: свои данные" on public.studio;
create policy "studio: свои данные" on public.studio for select using (owner = auth.uid());
revoke insert, update, delete on public.studio from anon, authenticated;

drop policy if exists "days: свои" on public.student_days;
create policy "days: свои" on public.student_days for all using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists "intents: свои" on public.intents;
create policy "intents: свои" on public.intents for all using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists "requests: свои" on public.requests;
create policy "requests: свои" on public.requests for select using (owner = auth.uid());
drop policy if exists "requests: разбор" on public.requests;
create policy "requests: разбор" on public.requests for update using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists "requests: удаление" on public.requests;
create policy "requests: удаление" on public.requests for delete using (owner = auth.uid());
revoke insert on public.requests from anon, authenticated;

revoke all on public.student_days, public.intents, public.requests, public.studio from anon;

-- Разобранная заявка теряет фото сразу.
create or replace function public.requests_drop_photo()
returns trigger language plpgsql as $$
begin
  if new.status <> 'new' then
    new.photo := null;
    new.resolved_at := coalesce(new.resolved_at, now());
  end if;
  return new;
end;
$$;
drop trigger if exists requests_drop_photo on public.requests;
create trigger requests_drop_photo before update on public.requests
  for each row execute function public.requests_drop_photo();

-- Уборка: фото старше 14 дней и разобранные заявки старше 90 дней, прошедшие отметки.
create or replace function public.cleanup()
returns void language sql security definer set search_path = public as $$
  update requests set photo = null where photo is not null and created_at < now() - interval '14 days';
  delete from requests where status <> 'new' and resolved_at < now() - interval '90 days';
  delete from intents where date < current_date - 7;
$$;
revoke all on function public.cleanup() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Функции преподавателя
-- ---------------------------------------------------------------------------

-- Сохранение данных студии. Возвращает новую версию или ошибку conflict.
create or replace function public.save_studio(p_data jsonb, p_version integer)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v integer;
begin
  if auth.uid() is null then
    raise exception 'auth required';
  end if;
  perform cleanup();

  update studio set data = p_data, version = version + 1, updated_at = now()
   where owner = auth.uid() and version = p_version
  returning version into v;
  if found then
    return v;
  end if;

  if exists (select 1 from studio where owner = auth.uid()) then
    raise exception 'conflict';
  end if;

  insert into studio (owner, data, version) values (auth.uid(), p_data, 1) returning version into v;
  return v;
end;
$$;
revoke all on function public.save_studio(jsonb, integer) from public, anon;
grant execute on function public.save_studio(jsonb, integer) to authenticated;

-- Новый код общей ссылки (старая ссылка перестаёт работать).
create or replace function public.new_invite()
returns text language sql security definer set search_path = public as $$
  update studio set invite = substr(md5(random()::text || clock_timestamp()::text), 1, 12)
   where owner = auth.uid() returning invite;
$$;
revoke all on function public.new_invite() from public, anon;
grant execute on function public.new_invite() to authenticated;

-- ---------------------------------------------------------------------------
-- Функции ученицы: всё по личному коду из ссылки, без входа
-- ---------------------------------------------------------------------------

-- Ищет ученицу по коду. Возвращает владельца студии и запись ученицы.
create or replace function public.find_student(p_token text, out o_owner uuid, out o_student jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_token is null or length(p_token) < 16 then
    return;
  end if;
  select s.owner, x into o_owner, o_student
    from studio s, jsonb_array_elements(s.data -> 'students') x
   where x ->> 'token' = p_token
   limit 1;
end;
$$;
revoke all on function public.find_student(text) from public, anon, authenticated;

-- Страница ученицы.
create or replace function public.student_card(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  f   record;
  d   jsonb;
  sid text;
  j   record;
begin
  perform cleanup();
  select * into f from find_student(p_token);

  if f.o_student is null then
    -- заявка на вступление ещё не разобрана
    select r.status, r.payload into j from requests r
     where r.token = p_token and r.kind = 'join' order by r.created_at desc limit 1;
    if j.status = 'new' then
      return jsonb_build_object('pending', true, 'name', j.payload -> 'name');
    end if;
    return null;
  end if;

  sid := f.o_student ->> 'id';
  select data into d from studio where owner = f.o_owner;

  return jsonb_build_object(
    'student', jsonb_build_object('id', sid, 'name', f.o_student -> 'name'),
    'passes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p -> 'id', 'studentId', p -> 'studentId', 'perWeek', p -> 'perWeek', 'weeks', p -> 'weeks',
        'total', p -> 'total', 'start', p -> 'start', 'freezes', coalesce(p -> 'freezes', '[]'::jsonb),
        'extensions', coalesce(p -> 'extensions', '[]'::jsonb), 'paid', p -> 'paid', 'price', p -> 'price', 'carried', p -> 'carried'))
        from jsonb_array_elements(d -> 'passes') p where p ->> 'studentId' = sid), '[]'::jsonb),
    'visits', coalesce((
      select jsonb_agg(jsonb_build_object('date', v -> 'date', 'classId', v -> 'classId', 'kind', v -> 'kind', 'passId', v -> 'passId'))
        from jsonb_array_elements(d -> 'visits') v where v ->> 'studentId' = sid), '[]'::jsonb),
    'schedule', coalesce(d -> 'schedule', '[]'::jsonb),
    'cancels', coalesce((
      select jsonb_agg(c) from jsonb_array_elements(d -> 'cancels') c where (c ->> 'date')::date >= current_date - 1), '[]'::jsonb),
    -- сообщения всем или лично ей за последние три недели
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('id', m -> 'id', 'text', m -> 'text', 'date', m -> 'date') order by m ->> 'date' desc)
        from jsonb_array_elements(d -> 'messages') m
       where (m -> 'to' = '"all"'::jsonb or (jsonb_typeof(m -> 'to') = 'array' and (m -> 'to') ? sid))
         and (m ->> 'date')::date >= current_date - 21), '[]'::jsonb),
    'settings', jsonb_build_object(
      'soonLessons', d -> 'settings' -> 'soonLessons',
      'soonDays', d -> 'settings' -> 'soonDays',
      'priceSingle', d -> 'settings' -> 'priceSingle',
      'pricePerLesson', d -> 'settings' -> 'pricePerLesson',
      'plans', coalesce(d -> 'settings' -> 'plans', '[]'::jsonb),
      'payInfo', d -> 'settings' -> 'payInfo'),
    'days', coalesce((select to_jsonb(class_ids) from student_days where owner = f.o_owner and student_id = sid), '[]'::jsonb),
    'intents', coalesce((
      select jsonb_agg(jsonb_build_object('date', i.date, 'classId', i.class_id, 'kind', i.kind))
        from intents i where i.owner = f.o_owner and i.student_id = sid and i.date >= current_date), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'payload', r.payload, 'status', r.status,
                                          'createdAt', r.created_at, 'hasPhoto', r.photo is not null) order by r.created_at desc)
        from requests r where r.owner = f.o_owner and r.student_id = sid and r.created_at > now() - interval '30 days'), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.student_card(text) from public;
grant execute on function public.student_card(text) to anon, authenticated;

-- Новая ученица по общей ссылке. Возвращает её личный код.
create or replace function public.join_studio(p_invite text, p_name text)
returns text language plpgsql security definer set search_path = public as $$
declare
  o   uuid;
  tok text;
begin
  select owner into o from studio where invite = p_invite;
  if o is null then
    raise exception 'invite not found';
  end if;
  p_name := btrim(coalesce(p_name, ''));
  if length(p_name) < 2 or length(p_name) > 60 then
    raise exception 'bad name';
  end if;
  if (select count(*) from requests where owner = o and kind = 'join' and status = 'new') >= 30 then
    raise exception 'too many';
  end if;
  tok := substr(md5(random()::text || clock_timestamp()::text), 1, 12) || substr(md5(random()::text || p_name), 1, 12);
  insert into requests (owner, token, kind, payload) values (o, tok, 'join', jsonb_build_object('name', p_name));
  return tok;
end;
$$;
revoke all on function public.join_studio(text, text) from public;
grant execute on function public.join_studio(text, text) to anon, authenticated;

-- Постоянные дни.
create or replace function public.student_set_days(p_token text, p_class_ids text[])
returns void language plpgsql security definer set search_path = public as $$
declare
  f record;
begin
  select * into f from find_student(p_token);
  if f.o_student is null then raise exception 'not found'; end if;
  if coalesce(array_length(p_class_ids, 1), 0) > 14 then raise exception 'too many'; end if;
  insert into student_days (owner, student_id, class_ids, updated_at)
  values (f.o_owner, f.o_student ->> 'id', coalesce(p_class_ids, '{}'), now())
  on conflict (owner, student_id) do update set class_ids = excluded.class_ids, updated_at = now();
end;
$$;
revoke all on function public.student_set_days(text, text[]) from public;
grant execute on function public.student_set_days(text, text[]) to anon, authenticated;

-- «Не приду» / «Приду дополнительно» / снять отметку (p_kind = null).
create or replace function public.student_set_intent(p_token text, p_date date, p_class_id text, p_kind text)
returns void language plpgsql security definer set search_path = public as $$
declare
  f record;
begin
  select * into f from find_student(p_token);
  if f.o_student is null then raise exception 'not found'; end if;
  if p_date < current_date or p_date > current_date + 60 then raise exception 'bad date'; end if;
  delete from intents where owner = f.o_owner and student_id = f.o_student ->> 'id' and date = p_date and class_id = p_class_id;
  if p_kind is not null then
    insert into intents (owner, student_id, date, class_id, kind) values (f.o_owner, f.o_student ->> 'id', p_date, p_class_id, p_kind);
  end if;
end;
$$;
revoke all on function public.student_set_intent(text, date, text, text) from public;
grant execute on function public.student_set_intent(text, date, text, text) to anon, authenticated;

-- Заявка «я оплатила» или «пропущу по уважительной причине».
create or replace function public.student_request(p_token text, p_kind text, p_payload jsonb, p_photo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  f  record;
  id uuid;
begin
  select * into f from find_student(p_token);
  if f.o_student is null then raise exception 'not found'; end if;
  if p_kind not in ('payment', 'freeze') then raise exception 'bad kind'; end if;
  if p_photo is not null and (length(p_photo) > 1500000 or p_photo not like 'data:image/%') then raise exception 'bad photo'; end if;
  if length(p_payload::text) > 2000 then raise exception 'too long'; end if;
  if (select count(*) from requests where owner = f.o_owner and student_id = f.o_student ->> 'id' and status = 'new') >= 5 then
    raise exception 'too many';
  end if;
  insert into requests (owner, student_id, kind, payload, photo)
  values (f.o_owner, f.o_student ->> 'id', p_kind, p_payload, p_photo)
  returning requests.id into id;
  return id;
end;
$$;
revoke all on function public.student_request(text, text, jsonb, text) from public;
grant execute on function public.student_request(text, text, jsonb, text) to anon, authenticated;

-- Ученица отменяет свою неразобранную заявку.
create or replace function public.student_cancel_request(p_token text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  f record;
begin
  select * into f from find_student(p_token);
  if f.o_student is null then raise exception 'not found'; end if;
  delete from requests where id = p_id and owner = f.o_owner and student_id = f.o_student ->> 'id' and status = 'new';
end;
$$;
revoke all on function public.student_cancel_request(text, uuid) from public;
grant execute on function public.student_cancel_request(text, uuid) to anon, authenticated;
