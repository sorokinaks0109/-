// Общие правила: даты, абонементы, кто придёт на занятие. Используется и приложением преподавателя, и страницей ученицы.
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
const weekStart = s => addDays(s, -((parse(s).getDay() + 6) % 7));
const MONTHS = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const MONTHS_NOM = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const DOW = ['вс','пн','вт','ср','чт','пт','сб'];
const DOW_FULL = ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'];
const fmt = s => { const d = parse(s); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
const fmtDow = s => `${DOW[parse(s).getDay()]}, ${fmt(s)}`;
const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c; };
const zan = n => `${n} ${plural(n, 'занятие', 'занятия', 'занятий')}`;
const raz = n => `${n} ${plural(n, 'раз', 'раза', 'раз')}`;
const rub = n => `${Number(n || 0).toLocaleString('ru-RU')} ₽`;
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const token = () => { const a = new Uint8Array(15); crypto.getRandomValues(a); return Array.from(a, b => 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 56]).join(''); };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = name => String(name || '').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
const firstName = name => String(name || '').trim().split(/\s+/)[0] || name;

Object.assign(BF, { pad, iso, parse, today, addDays, diff, weekStart, MONTHS, MONTHS_NOM, DOW, DOW_FULL, fmt, fmtDow, plural, zan, raz, rub, uid, token, esc, initials, firstName });

BF.REASONS = { sick: 'Болезнь', trip: 'Командировка', vacation: 'Отпуск', other: 'Другое' };
BF.METHODS = { transfer: 'переводом', cash: 'наличными на занятии' };
BF.DEFAULT_TEMPLATE = '{имя}, привет! В твоём абонементе осталось {осталось}, он действует до {до}. Продлить можно в приложении: {ссылка}';

BF.defaults = () => ({
  settings: {
    pricePerLesson: 500, priceSingle: 1000, soonLessons: 2, soonDays: 5,
    template: BF.DEFAULT_TEMPLATE, lastBackup: null, payInfo: '',
    plans: [
      { id: 'p2', perWeek: 2, weeks: 4, price: 4000 },
      { id: 'p3', perWeek: 3, weeks: 4, price: 6000 },
      { id: 'p4', perWeek: 4, weeks: 4, price: 8000 },
    ],
  },
  schedule: [
    { id: 'c1', dow: 1, title: 'Растяжка', start: '18:00', end: '19:00' },
    { id: 'c2', dow: 2, title: 'Балет', start: '19:00', end: '20:30' },
    { id: 'c3', dow: 4, title: 'Балет', start: '19:00', end: '20:30' },
    { id: 'c4', dow: 0, title: 'Балет + силовая', start: '13:00', end: '14:30' },
  ],
  students: [], passes: [], visits: [],
});
BF.normalize = d => {
  const def = BF.defaults();
  const out = { ...def, ...(d || {}), settings: { ...def.settings, ...((d && d.settings) || {}) } };
  if (!Array.isArray(out.settings.plans) || !out.settings.plans.length) out.settings.plans = def.settings.plans;
  return out;
};
BF.planTitle = p => `${raz(p.perWeek)} в неделю`;
BF.planSub = p => `${zan(p.perWeek * p.weeks)} · ${p.weeks} ${plural(p.weeks, 'неделя', 'недели', 'недель')}`;

/* ---------- расчёты ----------
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
  C.sortedSchedule = () => [...db.schedule].sort((a, b) => ((a.dow + 6) % 7) - ((b.dow + 6) % 7) || (a.start < b.start ? -1 : 1));
  C.isPast = (date, cls) => { if (date < today()) return true; if (date > today()) return false; const n = new Date(), [h, m] = cls.end.split(':').map(Number); return n.getHours() * 60 + n.getMinutes() > h * 60 + m; };
  C.upcoming = (count = 1) => {
    const out = [];
    for (let i = 0; i < 21 && out.length < count; i++) {
      const d = addDays(today(), i);
      for (const c of C.classesFor(d)) { if (C.isPast(d, c)) continue; out.push({ date: d, cls: c }); if (out.length >= count) break; }
    }
    return out;
  };
  // кто собирается прийти: постоянные дни минус «не приду» плюс «приду дополнительно»
  C.expected = (date, classId, days, intents) => {
    const coming = [], skipping = [];
    db.students.forEach(s => {
      const it = (intents || []).find(i => i.studentId === s.id && i.date === date && i.classId === classId);
      const regular = (days[s.id] || []).includes(classId);
      if (it && it.kind === 'extra') coming.push({ s, extra: true });
      else if (regular && !(it && it.kind === 'skip')) coming.push({ s, extra: false });
      else if (regular) skipping.push(s);
    });
    coming.sort((a, b) => a.s.name.localeCompare(b.s.name, 'ru'));
    return { coming, skipping };
  };
  return C;
};

/* ---------- рисунок ---------- */
BF.ballerina = '';
BF.loadBallerina = async base => {
  if (!BF.ballerina) {
    try { const r = await fetch(base + 'assets/ballerina.svg'); BF.ballerina = (await r.text()).replace('<svg ', '<svg aria-hidden="true" '); } catch (e) { BF.ballerina = ''; }
  }
  document.querySelectorAll('[data-ballerina]').forEach(el => { if (!el.innerHTML) el.innerHTML = BF.ballerina; });
  return BF.ballerina;
};

/* ---------- фото: уменьшаем до 1280 px, чтобы не гонять большие файлы ---------- */
BF.shrinkPhoto = file => new Promise((resolve, reject) => {
  const img = new Image(), url = URL.createObjectURL(file);
  img.onload = () => {
    const k = Math.min(1, 1280 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    let q = .75, out = c.toDataURL('image/jpeg', q);
    while (out.length > 900000 && q > .3) { q -= .15; out = c.toDataURL('image/jpeg', q); }
    resolve(out);
  };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не получилось открыть фото')); };
  img.src = url;
});

/* ---------- общие кусочки интерфейса ---------- */
BF.ui = {
  toast(text) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = text; t.setAttribute('role', 'status');
    document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
  },
  ICON_CHECK: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  ICON_BACK: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  // Экран поверх основного: шапка с «Назад», содержимое прокручивается, кнопки не прячутся под панелью браузера.
  page(html, { title, onMount, onAction }) {
    BF.ui.closePage();
    const el = document.createElement('div'); el.className = 'page'; el.id = 'page'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    el.innerHTML = `<div class="page-head"><button class="iconbtn" data-act="close" aria-label="Назад">${BF.ui.ICON_BACK}</button><h2>${title}</h2></div><div class="page-body">${html}</div>`;
    el.addEventListener('click', e => { const a = e.target.closest('[data-act]'); if (a && a.dataset.act === 'close') { BF.ui.closePage(); return; } onAction && onAction(e); });
    document.body.appendChild(el); document.body.classList.add('has-page');
    onMount && onMount(el.querySelector('.page-body'));
    return el;
  },
  closePage() { const p = document.getElementById('page'); if (p) p.remove(); document.body.classList.remove('has-page'); },
  async copy(text, okMsg) {
    try { await navigator.clipboard.writeText(text); BF.ui.toast(okMsg); return true; }
    catch (e) {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (_) {}
      ta.remove(); BF.ui.toast(ok ? okMsg : 'Не получилось скопировать, выделите текст вручную'); return ok;
    }
  },
};
document.addEventListener('keydown', e => { if (e.key === 'Escape') BF.ui.closePage(); });
})();
