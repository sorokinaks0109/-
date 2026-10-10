// Хранение данных. С заполненным config.js всё живёт на сервере Supabase (в телефоне преподавателя копия для работы
// без интернета). С пустым config.js работает демо-режим: «сервер» изображает хранилище браузера, поэтому
// преподаватель и ученица видят друг друга, только если открыты в одном браузере.
(() => {
'use strict';
const BF = window.BF;
const CFG = window.BF_CONFIG || {};
const LOCAL_KEY = 'ballet-forever-v1';         // данные студии в демо-режиме
const EXTRA_KEY = 'ballet-forever-demo-extra'; // заявки, постоянные дни и отметки в демо-режиме
const CACHE_KEY = 'ballet-forever-cache-v1';   // копия данных студии на телефоне преподавателя

const read = k => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch (e) { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

const Store = BF.Store = {
  mode: CFG.supabaseUrl && CFG.supabaseKey && window.supabase ? 'cloud' : 'local',
  status: 'saved', storageOk: true, invite: '', listeners: [],
  onStatus(cb) { this.listeners.push(cb); },
  setStatus(s) { this.status = s; this.listeners.forEach(cb => cb(s)); },
};
const sb = Store.mode === 'cloud' ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

const ERR = { 'invite not found': 'Ссылка-приглашение устарела. Попросите у преподавателя новую.', 'bad name': 'Напишите имя и фамилию', 'too many': 'Слишком много заявок подряд. Дождитесь, пока преподаватель разберёт прежние.', 'not found': 'Ссылка устарела. Попросите у преподавателя новую.', 'bad photo': 'Фото слишком большое, попробуйте другое', 'bad date': 'Можно отметить только ближайшие занятия' };
const nice = e => { const m = (e && e.message) || ''; const k = Object.keys(ERR).find(k => m.includes(k)); return new Error(k ? ERR[k] : /fetch|network/i.test(m) ? 'Нет связи с сервером. Проверьте интернет.' : m || 'Что-то пошло не так'); };
const rpc = async (fn, args) => { const { data, error } = await sb.rpc(fn, args); if (error) throw nice(error); return data; };

/* ======================= демо-«сервер» в браузере ======================= */
const demo = {
  extra() { return read(EXTRA_KEY) || { requests: [], days: {}, intents: [], invite: 'demo' + BF.token().slice(0, 8) }; },
  putExtra(x) { write(EXTRA_KEY, x); },
  studio() { return BF.normalize(read(LOCAL_KEY)); },
  find(tok) { const d = demo.studio(); return d.students.find(s => s.token === tok) || null; },
};

/* ======================= преподаватель ======================= */
let version = 0, dirty = false, busy = false, retryTimer = null, current = null, onReplace = null;

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

Store.load = async ({ sample, replaced }) => {
  onReplace = replaced;
  if (!sb) {
    let d = read(LOCAL_KEY);
    if (!d) { const s = sample(); d = s.studio; Store.storageOk = write(LOCAL_KEY, d); demo.putExtra({ ...s.extra, invite: demo.extra().invite }); }
    Store.invite = demo.extra().invite;
    return (current = BF.normalize(d));
  }
  const cache = read(CACHE_KEY);
  try {
    const { data, error } = await sb.from('studio').select('data, version, invite').maybeSingle();
    if (error) throw error;
    if (!data) {
      const local = read(LOCAL_KEY);
      current = BF.normalize(cache?.data || (local && local.students?.some(s => !s.example) ? local : BF.defaults()));
      version = 0; dirty = true; persist(); await flush();
      const again = await sb.from('studio').select('invite').maybeSingle(); Store.invite = again.data?.invite || '';
    } else {
      Store.invite = data.invite;
      if (cache && cache.dirty && cache.version === data.version) { current = BF.normalize(cache.data); version = cache.version; dirty = true; flush(); }
      else { current = BF.normalize(data.data); version = data.version; dirty = false; persist(); if (cache && cache.dirty) Store.setStatus('conflict'); }
    }
  } catch (e) {
    if (!cache) throw new Error('Нет связи с сервером. Проверьте интернет и обновите страницу.');
    current = BF.normalize(cache.data); version = cache.version; dirty = !!cache.dirty;
    Store.setStatus('offline'); scheduleRetry();
  }
  return current;
};
function persist() { Store.storageOk = write(CACHE_KEY, { data: current, version, dirty }); }

Store.save = db => {
  current = db;
  if (!sb) { Store.storageOk = write(LOCAL_KEY, db); return; }
  dirty = true; persist(); Store.setStatus('pending');
  clearTimeout(Store._t); Store._t = setTimeout(flush, 600);
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
        if (row) { current = BF.normalize(row.data); version = row.version; dirty = false; persist(); Store.setStatus('conflict'); onReplace && onReplace(current); }
      } else if (/JWT|auth required/i.test(error.message)) Store.setStatus('auth');
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

// Заявки, постоянные дни и отметки «не приду / приду».
Store.inbox = async () => {
  if (!sb) {
    const x = demo.extra();
    return { requests: x.requests.filter(r => r.status === 'new').map(r => ({ ...r, hasPhoto: !!r.photo, photo: undefined })), days: x.days, intents: x.intents.filter(i => i.date >= BF.addDays(BF.today(), -7)) };
  }
  const [r, d, i] = await Promise.all([
    sb.from('requests').select('id, student_id, token, kind, payload, status, created_at, has_photo').eq('status', 'new').order('created_at'),
    sb.from('student_days').select('student_id, class_ids'),
    sb.from('intents').select('student_id, date, class_id, kind').gte('date', BF.addDays(BF.today(), -7)),
  ]);
  if (r.error || d.error || i.error) throw nice(r.error || d.error || i.error);
  return {
    requests: r.data.map(x => ({ id: x.id, studentId: x.student_id, token: x.token, kind: x.kind, payload: x.payload, createdAt: x.created_at, hasPhoto: !!x.has_photo })),
    days: Object.fromEntries(d.data.map(x => [x.student_id, x.class_ids])),
    intents: i.data.map(x => ({ studentId: x.student_id, date: x.date, classId: x.class_id, kind: x.kind })),
  };
};
Store.photo = async id => {
  if (!sb) return demo.extra().requests.find(r => r.id === id)?.photo || null;
  const { data, error } = await sb.from('requests').select('photo').eq('id', id).maybeSingle();
  if (error) throw nice(error);
  return data?.photo || null;
};
Store.resolve = async (id, status) => {
  if (!sb) { const x = demo.extra(); const r = x.requests.find(r => r.id === id); if (r) { r.status = status; r.photo = null; r.resolvedAt = new Date().toISOString(); } demo.putExtra(x); return; }
  const { error } = await sb.from('requests').update({ status }).eq('id', id);
  if (error) throw nice(error);
};
Store.setDaysFor = async (sid, classIds) => {
  if (!sb) { const x = demo.extra(); x.days[sid] = classIds; demo.putExtra(x); return; }
  const { data: u } = await sb.auth.getUser();
  const { error } = await sb.from('student_days').upsert({ owner: u.user.id, student_id: sid, class_ids: classIds, updated_at: new Date().toISOString() });
  if (error) throw nice(error);
};
Store.newInvite = async () => {
  if (!sb) { const x = demo.extra(); x.invite = 'demo' + BF.token().slice(0, 8); demo.putExtra(x); return (Store.invite = x.invite); }
  return (Store.invite = await rpc('new_invite', {}));
};
Store.resetDemo = () => { try { localStorage.removeItem(LOCAL_KEY); localStorage.removeItem(EXTRA_KEY); } catch (e) {} };

/* ======================= ученица ======================= */
Store.card = async tok => {
  if (sb) return rpc('student_card', { p_token: tok });
  const s = demo.find(tok), x = demo.extra();
  if (!s) { const j = x.requests.filter(r => r.kind === 'join' && r.token === tok).pop(); return j && j.status === 'new' ? { pending: true, name: j.payload.name } : null; }
  const d = demo.studio(), t = BF.today();
  return {
    student: { id: s.id, name: s.name },
    passes: d.passes.filter(p => p.studentId === s.id).map(({ paidAt, ...p }) => p),
    visits: d.visits.filter(v => v.studentId === s.id).map(v => ({ date: v.date, classId: v.classId, kind: v.kind, passId: v.passId })),
    schedule: d.schedule,
    cancels: (d.cancels || []).filter(c => c.date >= BF.addDays(t, -1)),
    messages: (d.messages || []).filter(m => (m.to === 'all' || (Array.isArray(m.to) && m.to.includes(s.id))) && m.date >= BF.addDays(t, -21)).sort((a, b) => a.date < b.date ? 1 : -1).map(({ id, text, date }) => ({ id, text, date })),
    settings: (({ soonLessons, soonDays, priceSingle, pricePerLesson, plans, payInfo }) => ({ soonLessons, soonDays, priceSingle, pricePerLesson, plans, payInfo }))(d.settings),
    days: x.days[s.id] || [],
    intents: x.intents.filter(i => i.studentId === s.id && i.date >= t).map(({ date, classId, kind }) => ({ date, classId, kind })),
    requests: x.requests.filter(r => r.studentId === s.id).reverse().map(r => ({ id: r.id, kind: r.kind, payload: r.payload, status: r.status, createdAt: r.createdAt, hasPhoto: !!r.photo })),
  };
};
Store.join = async (invite, name) => {
  if (sb) return rpc('join_studio', { p_invite: invite, p_name: name });
  const x = demo.extra();
  // в демо подходит любой код приглашения: преподаватель и ученица могут быть в разных браузерах
  const tok = BF.token();
  x.requests.push({ id: BF.uid(), kind: 'join', token: tok, payload: { name: name.trim() }, status: 'new', createdAt: new Date().toISOString() });
  demo.putExtra(x); return tok;
};
Store.setDays = async (tok, classIds) => {
  if (sb) return rpc('student_set_days', { p_token: tok, p_class_ids: classIds });
  const s = demo.find(tok); if (!s) throw new Error(ERR['not found']);
  const x = demo.extra(); x.days[s.id] = classIds; demo.putExtra(x);
};
Store.setIntent = async (tok, date, classId, kind) => {
  if (sb) return rpc('student_set_intent', { p_token: tok, p_date: date, p_class_id: classId, p_kind: kind });
  const s = demo.find(tok); if (!s) throw new Error(ERR['not found']);
  const x = demo.extra();
  x.intents = x.intents.filter(i => !(i.studentId === s.id && i.date === date && i.classId === classId));
  if (kind) x.intents.push({ studentId: s.id, date, classId, kind });
  demo.putExtra(x);
};
Store.request = async (tok, kind, payload, photo) => {
  if (sb) return rpc('student_request', { p_token: tok, p_kind: kind, p_payload: payload, p_photo: photo || null });
  const s = demo.find(tok); if (!s) throw new Error(ERR['not found']);
  const x = demo.extra();
  x.requests.push({ id: BF.uid(), studentId: s.id, kind, payload, photo: photo || null, status: 'new', createdAt: new Date().toISOString() });
  demo.putExtra(x);
};
Store.cancelRequest = async (tok, id) => {
  if (sb) return rpc('student_cancel_request', { p_token: tok, p_id: id });
  const x = demo.extra(); x.requests = x.requests.filter(r => !(r.id === id && r.status === 'new')); demo.putExtra(x);
};
})();
