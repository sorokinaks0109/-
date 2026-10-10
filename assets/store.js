// Хранение данных. Если в config.js указан Supabase, данные живут на сервере, а в телефоне лежит копия
// для работы без интернета. Если не указан, всё хранится только в браузере (демо-режим).
(() => {
'use strict';
const BF = window.BF;
const CFG = window.BF_CONFIG || {};
const LOCAL_KEY = 'ballet-forever-v1';
const CACHE_KEY = 'ballet-forever-cache-v1';

const read = k => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch (e) { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

const Store = BF.Store = {
  mode: CFG.supabaseUrl && CFG.supabaseKey && window.supabase ? 'cloud' : 'local',
  status: 'saved',
  storageOk: true,
  listeners: [],
  onStatus(cb) { this.listeners.push(cb); },
  setStatus(s) { this.status = s; this.listeners.forEach(cb => cb(s)); },
};

let sb = null, version = 0, dirty = false, busy = false, retryTimer = null, current = null, onReplace = null;
if (Store.mode === 'cloud') sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } });

const normalize = d => { const def = BF.defaults(); return { ...def, ...d, settings: { ...def.settings, ...(d && d.settings) } }; };

/* ---------- вход преподавателя ---------- */
Store.user = async () => {
  if (!sb) return { local: true };
  const { data } = await sb.auth.getSession();
  return data.session ? data.session.user : null;
};
Store.signIn = async (email, password) => {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(/invalid/i.test(error.message) ? 'Неверная почта или пароль' : error.message);
};
Store.signUp = async (email, password) => {
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw new Error(/already/i.test(error.message) ? 'Такая почта уже зарегистрирована, войдите' : error.message);
  if (!data.session) throw new Error('Аккаунт создан. Подтвердите почту по ссылке из письма и войдите.');
};
Store.signOut = async () => { if (sb) await sb.auth.signOut(); try { localStorage.removeItem(CACHE_KEY); } catch (e) {} };

/* ---------- загрузка и сохранение ---------- */
Store.load = async ({ sample, replaced }) => {
  onReplace = replaced;
  if (Store.mode === 'local') {
    let d = read(LOCAL_KEY);
    if (!d) { d = sample(); Store.storageOk = write(LOCAL_KEY, d); }
    current = normalize(d);
    return current;
  }
  const cache = read(CACHE_KEY);
  try {
    const { data, error } = await sb.from('studio').select('data, version').maybeSingle();
    if (error) throw error;
    if (!data) {
      // первый вход: переносим то, что было в этом телефоне без примеров, или начинаем с пустого
      const local = read(LOCAL_KEY);
      const start = cache?.data || (local && local.students?.some(s => !s.example) ? local : BF.defaults());
      current = normalize(start); version = 0; dirty = true;
      persist(); flush();
    } else if (cache && cache.dirty && cache.version === data.version) {
      current = normalize(cache.data); version = cache.version; dirty = true; flush();
    } else {
      current = normalize(data.data); version = data.version; dirty = false; persist();
      if (cache && cache.dirty) Store.setStatus('conflict');
    }
  } catch (e) {
    if (!cache) throw new Error('Нет связи с сервером. Проверьте интернет и обновите страницу.');
    current = normalize(cache.data); version = cache.version; dirty = !!cache.dirty;
    Store.setStatus('offline'); scheduleRetry();
  }
  return current;
};

function persist() { Store.storageOk = write(CACHE_KEY, { data: current, version, dirty }); }

Store.save = db => {
  current = db;
  if (Store.mode === 'local') { Store.storageOk = write(LOCAL_KEY, db); return; }
  dirty = true; persist(); Store.setStatus('pending');
  clearTimeout(Store._t); Store._t = setTimeout(flush, 700);
};

async function flush() {
  if (!sb || !dirty || busy) return;
  busy = true;
  const sending = JSON.stringify(current);
  try {
    const { data, error } = await sb.rpc('save_studio', { p_data: current, p_version: version });
    if (error) {
      if (/conflict/i.test(error.message)) {
        const { data: row } = await sb.from('studio').select('data, version').maybeSingle();
        if (row) { current = normalize(row.data); version = row.version; dirty = false; persist(); Store.setStatus('conflict'); onReplace && onReplace(current); }
      } else if (/JWT|auth/i.test(error.message)) { Store.setStatus('auth'); }
      else throw error;
    } else {
      version = data;
      if (JSON.stringify(current) === sending) dirty = false;
      persist(); Store.setStatus(dirty ? 'pending' : 'saved');
    }
  } catch (e) { Store.setStatus('offline'); scheduleRetry(); }
  busy = false;
  if (dirty && Store.status === 'pending') flush();
}
function scheduleRetry() { clearTimeout(retryTimer); retryTimer = setTimeout(flush, 15000); }
window.addEventListener('online', () => flush());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

/* ---------- страница ученицы ---------- */
Store.studentCard = async tok => {
  if (Store.mode === 'local') {
    const d = normalize(read(LOCAL_KEY) || {});
    const s = d.students.find(x => x.token === tok);
    if (!s) return null;
    return { student: { id: s.id, name: s.name }, passes: d.passes.filter(p => p.studentId === s.id), visits: d.visits.filter(v => v.studentId === s.id).map(v => ({ date: v.date, classId: v.classId, kind: v.kind, passId: v.passId })), schedule: d.schedule, settings: { soonLessons: d.settings.soonLessons, soonDays: d.settings.soonDays, priceSingle: d.settings.priceSingle, pricePerLesson: d.settings.pricePerLesson } };
  }
  const { data, error } = await sb.rpc('student_card', { p_token: tok });
  if (error) throw new Error('Нет связи с сервером');
  return data;
};
})();
