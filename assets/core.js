// Общие правила: даты, абонементы, страница ученицы. Используется и приложением преподавателя, и страницей ученицы.
(() => {
'use strict';
const BF = window.BF = window.BF || {};

/* ---------- даты и текст ---------- */
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => iso(new Date());
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const diff = (a, b) => Math.round((parse(b) - parse(a)) / 86400000); // b - a в днях
const MONTHS = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const MONTHS_NOM = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const DOW = ['вс','пн','вт','ср','чт','пт','сб'];
const DOW_FULL = ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'];
const fmt = s => { const d = parse(s); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
const fmtDow = s => `${DOW[parse(s).getDay()]}, ${fmt(s)}`;
const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c; };
const zan = n => `${n} ${plural(n, 'занятие', 'занятия', 'занятий')}`;
const rub = n => `${Number(n).toLocaleString('ru-RU')} ₽`;
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const token = () => { const a = new Uint8Array(15); crypto.getRandomValues(a); return Array.from(a, b => 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 56]).join(''); };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = name => name.trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
const firstName = name => name.trim().split(/\s+/)[0] || name;

Object.assign(BF, { pad, iso, parse, today, addDays, diff, MONTHS, MONTHS_NOM, DOW, DOW_FULL, fmt, fmtDow, plural, zan, rub, uid, token, esc, initials, firstName });

BF.REASONS = { sick: 'Болезнь (больничный)', trip: 'Командировка', vacation: 'Отпуск', other: 'Другое уважительное' };
BF.DEFAULT_TEMPLATE = '{имя}, привет! В твоём абонементе осталось {осталось}, он действует до {до}. Если хочешь продолжать, продлим на следующем занятии.\nТвоя страница: {ссылка}';

BF.defaults = () => ({
  settings: { pricePerLesson: 500, priceSingle: 1000, soonLessons: 2, soonDays: 5, template: BF.DEFAULT_TEMPLATE, lastBackup: null },
  schedule: [
    { id: 'c1', dow: 1, title: 'Растяжка', start: '18:00', end: '19:00' },
    { id: 'c2', dow: 2, title: 'Балет', start: '19:00', end: '20:30' },
    { id: 'c3', dow: 4, title: 'Балет', start: '19:00', end: '20:30' },
    { id: 'c4', dow: 0, title: 'Балет + силовая', start: '13:00', end: '14:30' },
  ],
  students: [], passes: [], visits: [],
});

/* ---------- расчёты по абонементу ----------
   Абонемент: perWeek × weeks занятий, действует weeks недель с даты начала плюс дни заморозок.
   Заканчивается, когда кончились занятия или прошёл срок. Остаток после срока сгорает. */
BF.calc = db => {
  const C = {};
  C.frozenDays = p => (p.freezes || []).reduce((s, f) => s + Math.max(0, diff(f.from, f.to) + 1), 0);
  C.passEnd = p => addDays(p.start, p.weeks * 7 - 1 + C.frozenDays(p));
  C.passUsed = p => db.visits.filter(v => v.passId === p.id).length;
  C.passLeft = p => p.total - C.passUsed(p);
  C.isFrozenOn = (p, d) => (p.freezes || []).some(f => d >= f.from && d <= f.to);
  C.passState = (p, on = today()) => {
    const left = C.passLeft(p), end = C.passEnd(p), daysLeft = diff(on, end);
    if (on < p.start) return { key: 'future', left, end, daysLeft, label: `с ${fmt(p.start)}`, tone: 'mute' };
    if (left <= 0) return { key: 'used', left: 0, end, daysLeft, label: 'занятия закончились', tone: 'bad' };
    if (on > end) return { key: 'expired', left, end, daysLeft, burned: left, label: `истёк, сгорело ${left}`, tone: 'bad' };
    if (C.isFrozenOn(p, on)) return { key: 'frozen', left, end, daysLeft, label: 'заморожен', tone: 'mute' };
    const soon = left <= db.settings.soonLessons || daysLeft <= db.settings.soonDays;
    return { key: soon ? 'soon' : 'active', left, end, daysLeft, label: `осталось ${left} из ${p.total}`, tone: soon ? 'warn' : 'ok' };
  };
  C.isLive = st => ['active', 'soon', 'frozen'].includes(st.key);
  C.studentPasses = sid => db.passes.filter(p => p.studentId === sid).sort((a, b) => a.start < b.start ? 1 : -1);
  C.currentPass = (sid, on = today()) => {
    const list = C.studentPasses(sid);
    return list.find(p => C.isLive(C.passState(p, on))) || list.find(p => C.passState(p, on).key === 'future') || list[0] || null;
  };
  C.passForVisit = (sid, date, exceptVisitIds = []) => db.passes
    .filter(p => p.studentId === sid && date >= p.start && date <= C.passEnd(p))
    .sort((a, b) => a.start < b.start ? -1 : 1)
    .find(p => p.total - db.visits.filter(v => v.passId === p.id && !exceptVisitIds.includes(v.id)).length > 0) || null;
  C.studentById = id => db.students.find(s => s.id === id);
  C.classById = id => db.schedule.find(c => c.id === id);
  C.classesFor = date => db.schedule.filter(c => c.dow === parse(date).getDay()).sort((a, b) => a.start < b.start ? -1 : 1);
  C.upcoming = (count = 1) => {
    const now = new Date(), out = [];
    for (let i = 0; i < 14 && out.length < count; i++) {
      const d = addDays(today(), i);
      for (const c of C.classesFor(d)) {
        if (i === 0) { const [h, m] = c.end.split(':').map(Number); if (now.getHours() * 60 + now.getMinutes() > h * 60 + m) continue; }
        out.push({ date: d, cls: c }); if (out.length >= count) break;
      }
    }
    return out;
  };
  return C;
};

/* ---------- рисунок ---------- */
BF.ballerina = '';
BF.loadBallerina = async base => {
  if (BF.ballerina) return BF.ballerina;
  try { const r = await fetch(base + 'assets/ballerina.svg'); BF.ballerina = (await r.text()).replace('<svg ', '<svg aria-hidden="true" '); } catch (e) { BF.ballerina = ''; }
  document.querySelectorAll('[data-ballerina]').forEach(el => { el.innerHTML = BF.ballerina; });
  return BF.ballerina;
};

/* ---------- страница ученицы ----------
   card = { student, passes, visits, schedule, settings } — то, что сервер отдаёт по личной ссылке. */
BF.studentView = card => {
  const db = { settings: card.settings, schedule: card.schedule || [], students: [card.student], passes: card.passes || [], visits: card.visits || [] };
  const C = BF.calc(db);
  const s = card.student, t = today();
  const p = C.currentPass(s.id);
  const st = p ? C.passState(p) : null;
  const visits = [...db.visits].sort((a, b) => a.date < b.date ? 1 : -1);
  const up = C.upcoming(4);
  const meter = p && p.total <= 24 ? `<div class="meter" aria-hidden="true">${Array.from({ length: p.total }, (_, i) => `<i class="${i < st.left && (C.isLive(st) || st.key === 'future') ? 'on' : ''}"></i>`).join('')}</div>` : '';
  let note = '';
  if (st && st.key === 'soon') note = `<div class="note">Абонемент скоро закончится${st.left <= db.settings.soonLessons ? `: осталось ${zan(st.left)}` : `: срок до ${fmt(st.end)}`}. Продлить можно на ближайшем занятии.</div>`;
  if (st && st.key === 'used') note = '<div class="note bad">Занятия в абонементе закончились. Чтобы продолжать, оплатите новый абонемент на занятии.</div>';
  if (st && st.key === 'expired') note = `<div class="note bad">Срок абонемента вышел ${fmt(st.end)}. Неиспользованные занятия сгорели: ${st.burned}.</div>`;
  if (st && st.key === 'frozen') { const f = p.freezes.find(f => t >= f.from && t <= f.to); note = `<div class="note">Абонемент заморожен до ${fmt(f.to)}. Срок продлён на эти дни.</div>`; }

  return `
  <section class="me-hero">
    <div><h1>${esc(firstName(s.name))}</h1><p>Ballet Forever · мой абонемент</p></div>
    <div class="ballerina" data-ballerina>${BF.ballerina}</div>
  </section>
  ${p ? `<section class="card ticket">
    <div class="eyebrow">${st.key === 'future' ? `Абонемент с ${fmt(p.start)}` : 'Осталось занятий'}</div>
    <div class="big"><b>${st.key === 'expired' ? 0 : st.left}</b><span>из ${p.total}</span></div>
    ${meter}
    <div class="facts">
      <div><span class="eyebrow">Действует до</span><b>${fmt(st.end)}</b></div>
      <div><span class="eyebrow">${st.daysLeft >= 0 ? 'Дней осталось' : 'Статус'}</span><b>${st.daysLeft >= 0 && C.isLive(st) ? st.daysLeft + 1 : esc(st.label)}</b></div>
      <div><span class="eyebrow">В неделю</span><b>${p.perWeek} ${plural(p.perWeek, 'раз', 'раза', 'раз')}</b></div>
      <div><span class="eyebrow">Начало</span><b>${fmt(p.start)}</b></div>
    </div>
    ${(p.freezes || []).length ? `<p class="hint">Заморозки: ${p.freezes.map(f => `${fmt(f.from)} – ${fmt(f.to)}`).join(', ')}. Срок продлён на ${C.frozenDays(p)} дн.</p>` : ''}
  </section>` : `<section class="card ticket"><div class="eyebrow">Абонемента нет</div><p style="margin:0">Вы ходите на разовые занятия, ${rub(db.settings.priceSingle)} за занятие. Абонемент выгоднее: ${rub(db.settings.pricePerLesson)} за занятие.</p></section>`}
  ${note}
  ${up.length ? `<section><div class="sec-title"><h2>Афиша</h2><span>ближайшие занятия</span></div>
    <div class="list afisha">${up.map(u => `<div class="row"><div class="day">${DOW[parse(u.date).getDay()]}</div><div class="main"><div class="name">${esc(u.cls.title)}</div><div class="sub num">${fmt(u.date)}, ${u.cls.start}–${u.cls.end}</div></div></div>`).join('')}</div></section>` : ''}
  <section><div class="sec-title"><h2>Мои занятия</h2><span class="num">${visits.length ? visits.length : ''}</span></div>
    <div class="list">${visits.length ? visits.slice(0, 40).map(v => `<div class="row" style="min-height:48px"><div class="main"><div class="num">${fmtDow(v.date)}</div><div class="sub">${esc(C.classById(v.classId)?.title || 'занятие')}</div></div><span class="pill ${v.kind === 'single' ? 'mute' : 'ok'}">${v.kind === 'single' ? 'разово' : 'абонемент'}</span></div>`).join('') : '<div class="empty">Пока нет отмеченных занятий.</div>'}</div></section>`;
};
})();
