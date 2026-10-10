// Приложение преподавателя: главная, отметка занятия, ученицы, деньги, настройки.
(() => {
'use strict';
const BF = window.BF, Store = BF.Store;
const { today, addDays, diff, parse, fmt, fmtDow, plural, zan, rub, uid, token, esc, initials, firstName, pad, DOW, DOW_FULL, MONTHS_NOM, REASONS } = BF;
const BASE = new URL('./', location.href).href;

let db, C;
const setDb = d => { db = d; C = BF.calc(db); ensureTokens(); };
const save = () => Store.save(db);
function ensureTokens() { let changed = false; db.students.forEach(s => { if (!s.token) { s.token = token(); changed = true; } }); return changed; }
const studentLink = s => `${BASE}me/?t=${s.token}`;

/* ---------- примеры ---------- */
function sample() {
  const d = BF.defaults(), t = today();
  const mk = (name, remind) => { const s = { id: uid(), name, phone: '', remind, note: '', example: true, token: token() }; d.students.push(s); return s; };
  const pass = (s, perWeek, weeks, startOffset, extra = {}) => {
    const p = { id: uid(), studentId: s.id, perWeek, weeks, total: perWeek * weeks, price: perWeek * weeks * 500, paidAt: addDays(t, startOffset), start: addDays(t, startOffset), freezes: [], ...extra };
    d.passes.push(p); return p;
  };
  const pastClassDays = from => { const out = []; for (let x = from; x < t; x = addDays(x, 1)) { const c = d.schedule.find(c => c.dow === parse(x).getDay()); if (c) out.push({ date: x, classId: c.id }); } return out; };
  const attend = (s, p, take, keep = 0) => { pastClassDays(p.start).filter(take).slice(0, p.total - keep).forEach(x => d.visits.push({ id: uid(), studentId: s.id, date: x.date, classId: x.classId, kind: 'pass', passId: p.id })); };
  const a = mk('Алина Морозова', true); attend(a, pass(a, 3, 4, -24), () => true, 1);
  const b = mk('Вера Соколова', true); attend(b, pass(b, 2, 4, -10), x => [2, 4].includes(parse(x.date).getDay()));
  const c = mk('Дарья Лебедева', true);
  const pc = pass(c, 4, 4, -26, { freezes: [{ id: uid(), from: addDays(t, -12), to: addDays(t, -6), reason: 'trip' }] });
  attend(c, pc, x => diff(x.date, addDays(t, -12)) > 0 || diff(addDays(t, -6), x.date) > 0);
  const o = mk('Ольга Павлова', false);
  pastClassDays(addDays(t, -14)).filter(x => parse(x.date).getDay() === 4).forEach(x => d.visits.push({ id: uid(), studentId: o.id, date: x.date, classId: x.classId, kind: 'single', price: 1000 }));
  const e = mk('Ксения Белова', true); attend(e, pass(e, 3, 4, -3), () => true);
  const f = mk('Марина Орлова', true); attend(f, pass(f, 2, 4, -35), x => [2, 0].includes(parse(x.date).getDay()) && diff(x.date, addDays(t, -22)) > 0);
  return d;
}

/* ---------- общее ---------- */
const app = document.getElementById('app');
let tab = 'home', markState = null, studentFilter = '', moneyMonth = today().slice(0, 7);
const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const ICON_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const meter = (p, st) => p.total > 24 ? '' : `<div class="meter" aria-hidden="true">${Array.from({ length: p.total }, (_, i) => `<i class="${i < st.left && (C.isLive(st) || st.key === 'future') ? 'on' : ''}"></i>`).join('')}</div>`;
const exPill = s => s.example ? ' <span class="pill ex">пример</span>' : '';

function toast(text) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = text; t.setAttribute('role', 'status');
  document.body.appendChild(t); setTimeout(() => t.remove(), 2400);
}

const SYNC_TEXT = { saved: 'сохранено', pending: 'сохраняю…', offline: 'нет связи, сохранено в телефоне', conflict: 'загружены данные с другого устройства', auth: 'нужно войти заново' };
function showSync() {
  const el = document.getElementById('sync');
  if (!el) return;
  if (Store.mode === 'local') { el.className = 'sync'; el.innerHTML = '<i></i>данные в этом телефоне'; return; }
  const s = Store.status;
  el.className = 'sync ' + (s === 'pending' ? 'pending' : s === 'saved' ? '' : 'off');
  el.innerHTML = `<i></i>${SYNC_TEXT[s] || ''}`;
}
Store.onStatus(s => { showSync(); if (s === 'conflict') toast('Данные изменились на другом устройстве, показываю свежие'); if (s === 'auth') boot(); });

function setTab(t) { tab = t; if (t !== 'mark') markState = null; render(); window.scrollTo(0, 0); }
document.querySelectorAll('nav.tabs button').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
document.getElementById('settingsBtn').addEventListener('click', () => { tab = 'settings'; render(); window.scrollTo(0, 0); });

function render() {
  document.querySelectorAll('nav.tabs button').forEach(b => { if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  ({ home: renderHome, mark: renderMark, students: renderStudents, money: renderMoney, settings: renderSettings })[tab]();
  showSync();
}

/* ---------- Главная ---------- */
function renderHome() {
  const t = today();
  const soon = [], ended = [];
  db.students.forEach(s => {
    const p = C.currentPass(s.id); if (!p) return;
    if (db.passes.some(q => q.studentId === s.id && q.start > p.start)) return;
    const st = C.passState(p);
    if (st.key === 'soon') soon.push({ s, p, st });
    if ((st.key === 'used' || st.key === 'expired') && diff(st.end, t) <= 21) ended.push({ s, p, st });
  });
  soon.sort((a, b) => a.st.left - b.st.left || a.st.daysLeft - b.st.daysLeft);
  const [up] = C.upcoming(1);
  const hasExamples = db.students.some(s => s.example);
  const backupDays = db.settings.lastBackup ? diff(db.settings.lastBackup, t) : null;
  const needBackup = Store.mode === 'local' && !hasExamples && db.students.length && (backupDays === null || backupDays >= 14);

  app.innerHTML = `<div class="screen">
    ${hasExamples ? `<div class="banner"><span>Сейчас здесь выдуманные ученицы для примера.</span><button class="btn small" data-act="clear-examples">Убрать примеры</button></div>` : ''}
    ${!Store.storageOk ? `<div class="banner"><span>Браузер не даёт сохранять данные. Откройте приложение в обычном окне, не в режиме инкогнито.</span></div>` : ''}
    ${needBackup ? `<div class="banner"><span>${backupDays === null ? 'Резервной копии ещё нет.' : `Последняя копия ${backupDays} дн. назад.`} Сохраните копию данных.</span><button class="btn small" data-act="go-settings">Сохранить</button></div>` : ''}

    ${up ? `<div class="card next">
      <div class="when"><b>${up.cls.start}</b><small>${up.date === t ? 'сегодня' : diff(t, up.date) === 1 ? 'завтра' : DOW_FULL[parse(up.date).getDay()]}</small></div>
      <div class="main"><div class="eyebrow">Ближайшее занятие</div><h3>${esc(up.cls.title)}</h3><div class="hint num">${fmtDow(up.date)}, до ${up.cls.end}</div></div>
      <button class="btn primary small" data-act="mark-class" data-date="${up.date}" data-class="${up.cls.id}">Отметить</button>
    </div>` : ''}

    <section>
      <div class="sec-title"><h2>Скоро закончится</h2><span class="num">${soon.length || ''}</span></div>
      <div class="list">
        ${soon.length ? soon.map(({ s, p, st }) => `<div class="row">
          <div class="avatar">${esc(initials(s.name))}</div>
          <div class="main"><button class="name" style="background:none;border:0;padding:0;text-align:left" data-act="open-student" data-id="${s.id}">${esc(s.name)}</button>${exPill(s)}
            <div class="sub num">осталось ${st.left} из ${p.total} · до ${fmt(st.end)}</div>${meter(p, st)}</div>
          <div class="btns" style="flex-direction:column;align-items:stretch">
            ${s.remind ? `<button class="btn small" data-act="remind" data-id="${s.id}">Напомнить</button>` : ''}
            <button class="btn small primary" data-act="renew" data-id="${s.id}">Продлить</button>
          </div></div>`).join('') : `<div class="empty">Ни у кого абонемент не кончается в ближайшие ${db.settings.soonDays} дн.</div>`}
      </div>
    </section>

    ${ended.length ? `<section>
      <div class="sec-title"><h2>Закончился</h2><span>за 3 недели</span></div>
      <div class="list">
        ${ended.map(({ s, p, st }) => `<div class="row">
          <div class="avatar">${esc(initials(s.name))}</div>
          <div class="main"><div class="name">${esc(s.name)}${exPill(s)}</div>
            <div class="sub">${st.key === 'expired' ? `срок вышел ${fmt(st.end)}, сгорело ${zan(st.burned)}` : `все ${zan(p.total)} использованы`}</div></div>
          <button class="btn small primary" data-act="renew" data-id="${s.id}">Продлить</button></div>`).join('')}
      </div></section>` : ''}

    <div class="btns">
      <button class="btn primary" style="flex:1" data-act="new-pass">Оплата абонемента</button>
      <button class="btn" style="flex:1" data-act="new-student">Новая ученица</button>
    </div>
  </div>`;
}

/* ---------- Отметка занятия ---------- */
function openMark(date, classId) {
  const existing = db.visits.filter(v => v.date === date && v.classId === classId);
  markState = { date, classId, picked: new Map(existing.map(v => [v.studentId, { kind: v.kind }])) };
  tab = 'mark'; render();
}
function renderMark() {
  if (!markState) {
    const t = today(), todays = C.classesFor(t);
    const start = todays.length ? { date: t, cls: todays[0] } : C.upcoming(1)[0];
    if (start) { openMark(start.date, start.cls.id); return; }
    markState = { date: t, classId: '', picked: new Map() };
  }
  const { date, classId, picked } = markState;
  const opts = C.classesFor(date);
  const ids = db.visits.filter(v => v.date === date && v.classId === classId).map(v => v.id);
  const rows = db.students.map(s => { const p = C.passForVisit(s.id, date, ids); return { s, p, st: p ? C.passState(p, date) : null }; })
    .sort((a, b) => (!!b.p - !!a.p) || a.s.name.localeCompare(b.s.name, 'ru'));
  const withPass = rows.filter(r => r.p), noPass = rows.filter(r => !r.p);
  const count = picked.size;

  const rowHtml = ({ s, p, st }) => {
    const on = picked.has(s.id);
    const frozen = p && C.isFrozenOn(p, date);
    let sub = p ? `абонемент: осталось ${st.left}${frozen ? ' · заморожен на эту дату' : ''}` : `разово, ${rub(db.settings.priceSingle)}`;
    if (on && picked.get(s.id).kind === 'single' && p) sub = 'отмечена как разовое';
    return `<button class="row" data-act="toggle" data-id="${s.id}" aria-pressed="${on}">
      <div class="check">${ICON_CHECK}</div>
      <div class="main"><div class="name">${esc(s.name)}${exPill(s)}</div><div class="sub num">${sub}</div></div>
      ${p ? `<span class="pill ${st.tone} num">${st.left}</span>` : '<span class="pill mute">разово</span>'}
    </button>`;
  };

  app.innerHTML = `<div class="screen">
    <div class="sec-title"><h2>Кто пришёл</h2><span class="num">${count ? `отмечено ${count}` : ''}</span></div>
    <div class="grid2">
      <label class="f">Дата<input type="date" id="mDate" value="${date}"></label>
      <label class="f">Занятие<select id="mClass">
        ${opts.map(c => `<option value="${c.id}" ${c.id === classId ? 'selected' : ''}>${esc(c.title)}, ${c.start}</option>`).join('')}
        ${opts.length ? '' : '<option value="">В этот день занятий нет</option>'}
      </select></label>
    </div>
    ${classId ? `
      <div class="card list">${withPass.length ? withPass.map(rowHtml).join('') : '<div class="empty">На эту дату ни у кого нет действующего абонемента.</div>'}</div>
      ${noPass.length ? `<div><div class="eyebrow" style="margin-bottom:8px">Без абонемента, оплата разово</div><div class="card list">${noPass.map(rowHtml).join('')}</div></div>` : ''}
      <button class="btn ghost" data-act="new-student-mark">Новая ученица</button>
      <div class="stickybar"><button class="btn primary block" data-act="save-mark">Сохранить${count ? ` (${count})` : ''}</button></div>
    ` : `<p class="hint">Выберите другую дату или добавьте занятие в расписание в настройках.</p>`}
  </div>`;

  document.getElementById('mDate').addEventListener('change', e => {
    const d = e.target.value || today(); const c = C.classesFor(d)[0];
    if (c) openMark(d, c.id); else { markState = { date: d, classId: '', picked: new Map() }; render(); }
  });
  document.getElementById('mClass').addEventListener('change', e => openMark(markState.date, e.target.value));
}
function toggleMark(sid) {
  const { date, classId, picked } = markState;
  if (picked.has(sid)) picked.delete(sid);
  else {
    const ids = db.visits.filter(v => v.date === date && v.classId === classId).map(v => v.id);
    picked.set(sid, { kind: C.passForVisit(sid, date, ids) ? 'pass' : 'single' });
  }
  render();
}
function saveMark() {
  const { date, classId, picked } = markState;
  const old = db.visits.filter(v => v.date === date && v.classId === classId);
  db.visits = db.visits.filter(v => !(v.date === date && v.classId === classId));
  C = BF.calc(db);
  let singles = 0;
  picked.forEach((val, sid) => {
    const prev = old.find(v => v.studentId === sid);
    const p = val.kind === 'pass' ? C.passForVisit(sid, date) : null;
    if (p) db.visits.push({ id: prev?.id || uid(), studentId: sid, date, classId, kind: 'pass', passId: p.id });
    else { singles++; db.visits.push({ id: prev?.id || uid(), studentId: sid, date, classId, kind: 'single', price: prev?.price ?? db.settings.priceSingle }); }
  });
  save();
  toast(`Сохранено: ${picked.size}${singles ? `, из них разово ${singles}` : ''}`);
  openMark(date, classId);
}

/* ---------- Ученицы ---------- */
function renderStudents() {
  const q = studentFilter.trim().toLowerCase();
  const list = db.students.filter(s => !q || s.name.toLowerCase().includes(q))
    .map(s => { const p = C.currentPass(s.id); return { s, p, st: p ? C.passState(p) : null }; })
    .sort((a, b) => a.s.name.localeCompare(b.s.name, 'ru'));
  app.innerHTML = `<div class="screen">
    <div class="sec-title"><h2>Ученицы</h2><span class="num">${db.students.length}</span></div>
    <input type="text" id="sSearch" placeholder="Поиск по имени" value="${esc(studentFilter)}" aria-label="Поиск по имени">
    <div class="list">
      ${list.length ? list.map(({ s, p, st }) => `<button class="row" data-act="open-student" data-id="${s.id}">
        <div class="avatar">${esc(initials(s.name))}</div>
        <div class="main"><div class="name">${esc(s.name)}${exPill(s)}</div>
          <div class="sub num">${p ? `${p.perWeek} р/нед · до ${fmt(st.end)}` : 'разовые занятия'}</div></div>
        ${p ? `<span class="pill ${st.tone} num">${st.key === 'active' || st.key === 'soon' ? `${st.left} из ${p.total}` : st.label}</span>` : '<span class="pill mute">разово</span>'}
      </button>`).join('') : '<div class="empty">Пока никого. Добавьте первую ученицу кнопкой ниже.</div>'}
    </div>
    <button class="btn primary" data-act="new-student">Новая ученица</button>
  </div>`;
  document.getElementById('sSearch').addEventListener('input', e => {
    studentFilter = e.target.value; const pos = e.target.selectionStart; render();
    const n = document.getElementById('sSearch'); n.focus(); n.setSelectionRange(pos, pos);
  });
}

/* ---------- Деньги ---------- */
function renderMoney() {
  const [y, m] = moneyMonth.split('-').map(Number);
  const inMonth = d => d && d.slice(0, 7) === moneyMonth;
  const passes = db.passes.filter(p => inMonth(p.paidAt));
  const singles = db.visits.filter(v => v.kind === 'single' && inMonth(v.date));
  const visits = db.visits.filter(v => inMonth(v.date));
  const passSum = passes.reduce((s, p) => s + Number(p.price || 0), 0);
  const singleSum = singles.reduce((s, v) => s + Number(v.price || 0), 0);
  const burnedCount = db.passes.map(p => C.passState(p)).filter(st => st.key === 'expired' && inMonth(st.end)).reduce((s, st) => s + st.burned, 0);
  const shift = k => { const d = new Date(y, m - 1 + k, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
  const ops = [
    ...passes.map(p => ({ date: p.paidAt, text: C.studentById(p.studentId)?.name || '—', sub: `абонемент ${p.perWeek} р/нед, ${zan(p.total)}`, sum: p.price })),
    ...singles.map(v => ({ date: v.date, text: C.studentById(v.studentId)?.name || '—', sub: `разовое · ${C.classById(v.classId)?.title || ''}`, sum: v.price })),
  ].sort((a, b) => a.date < b.date ? 1 : -1);

  app.innerHTML = `<div class="screen">
    <div class="sec-title"><h2>${MONTHS_NOM[m - 1]} ${y}</h2>
      <span class="btns"><button class="btn small" data-act="month" data-m="${shift(-1)}" aria-label="Предыдущий месяц">‹</button><button class="btn small" data-act="month" data-m="${shift(1)}" aria-label="Следующий месяц">›</button></span></div>
    <div class="stats">
      <div class="card stat"><b>${rub(passSum + singleSum)}</b><span>всего получено</span></div>
      <div class="card stat"><b>${visits.length}</b><span>посещений</span></div>
      <div class="card stat"><b>${rub(passSum)}</b><span>абонементы (${passes.length})</span></div>
      <div class="card stat"><b>${rub(singleSum)}</b><span>разовые (${singles.length})</span></div>
    </div>
    <div class="card stat"><b>${burnedCount}</b><span>${plural(burnedCount, 'занятие сгорело', 'занятия сгорело', 'занятий сгорело')} у абонементов, истёкших в этом месяце</span></div>
    <section><div class="sec-title"><h2>Оплаты</h2></div>
      <div class="list">
        ${ops.length ? ops.map(o => `<div class="row" style="min-height:52px"><div class="main"><div class="name">${esc(o.text)}</div><div class="sub">${fmt(o.date)} · ${esc(o.sub)}</div></div><b class="num" style="font-weight:500">${rub(o.sum)}</b></div>`).join('') : '<div class="empty">В этом месяце оплат нет.</div>'}
      </div></section>
  </div>`;
}

/* ---------- Настройки ---------- */
function renderSettings() {
  const st = db.settings;
  const sched = [...db.schedule].sort((a, b) => ((a.dow + 6) % 7) - ((b.dow + 6) % 7) || (a.start < b.start ? -1 : 1));
  app.innerHTML = `<div class="screen">
    <div class="sec-title"><h2>Настройки</h2><button class="btn small" data-act="tab-home">Готово</button></div>
    <section class="form">
      <div class="eyebrow">Цены</div>
      <div class="grid2">
        <label class="f">Занятие в абонементе, ₽<input type="number" inputmode="numeric" id="stLesson" value="${st.pricePerLesson}" min="0"></label>
        <label class="f">Разовое занятие, ₽<input type="number" inputmode="numeric" id="stSingle" value="${st.priceSingle}" min="0"></label>
      </div>
      <div class="eyebrow">Когда предупреждать</div>
      <div class="grid2">
        <label class="f">Осталось занятий не больше<input type="number" inputmode="numeric" id="stSoonL" value="${st.soonLessons}" min="0"></label>
        <label class="f">Или до конца дней не больше<input type="number" inputmode="numeric" id="stSoonD" value="${st.soonDays}" min="0"></label>
      </div>
      <label class="f">Текст напоминания<textarea id="stTpl">${esc(st.template)}</textarea></label>
      <p class="hint">Подставляется: {имя}, {осталось}, {до}, {ссылка} (личная страница ученицы).</p>
      <button class="btn primary" data-act="save-settings">Сохранить</button>
    </section>

    <section>
      <div class="sec-title"><h2>Расписание</h2></div>
      <div class="list">
        ${sched.map(c => `<button class="row" data-act="edit-class" data-id="${c.id}"><div class="avatar" style="font-size:13px">${DOW[c.dow]}</div>
          <div class="main"><div class="name">${esc(c.title)}</div><div class="sub num">${DOW_FULL[c.dow]}, ${c.start}–${c.end}</div></div></button>`).join('')}
      </div>
      <button class="btn ghost" style="margin-top:8px" data-act="edit-class" data-id="">Добавить занятие</button>
    </section>

    <section class="form">
      <div class="sec-title"><h2>Резервная копия</h2></div>
      <p class="hint">${Store.mode === 'cloud' ? 'Данные хранятся на сервере. Копия в файл нужна на всякий случай, например раз в месяц.' : 'Сейчас данные хранятся только в этом телефоне. Раз в пару недель сохраняйте копию и отправляйте себе в «Избранное» в Максе.'}</p>
      <div class="btns">
        <button class="btn primary" data-act="export">Сохранить копию в файл</button>
        <button class="btn" data-act="copy-backup">Скопировать как текст</button>
      </div>
      <label class="btn" style="cursor:pointer">Загрузить копию из файла<input type="file" id="importFile" accept=".json,application/json,text/plain" hidden></label>
      ${st.lastBackup ? `<p class="hint">Последняя копия: ${fmt(st.lastBackup)}.</p>` : ''}
    </section>

    <section class="form">
      <div class="sec-title"><h2>Прочее</h2></div>
      <div class="btns">
        ${db.students.some(s => s.example) ? '<button class="btn" data-act="clear-examples">Убрать примеры</button>' : ''}
        ${Store.mode === 'cloud' ? '<button class="btn" data-act="logout">Выйти</button>' : ''}
        <button class="btn danger" data-act="wipe">Стереть все данные</button>
      </div>
    </section>
  </div>`;
  document.getElementById('importFile').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader(); r.onload = () => importText(String(r.result)); r.readAsText(f);
  });
}
function importText(text) {
  try {
    const data = JSON.parse(text);
    if (!Array.isArray(data.students) || !Array.isArray(data.passes) || !Array.isArray(data.visits)) throw new Error();
    confirmSheet('Загрузить копию?', `В копии ${data.students.length} учениц, ${data.passes.length} абонементов. Текущие данные заменятся.`, 'Загрузить', () => {
      const def = BF.defaults();
      setDb({ ...def, ...data, settings: { ...def.settings, ...data.settings } }); save(); toast('Копия загружена'); tab = 'home'; render();
    });
  } catch (e) { toast('Это не похоже на файл копии Ballet Forever'); }
}

/* ---------- листы ---------- */
function sheet(html, onMount) {
  closeSheet();
  const scrim = document.createElement('div'); scrim.className = 'scrim'; scrim.id = 'scrim';
  scrim.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  scrim.addEventListener('click', e => { if (e.target === scrim) closeSheet(); });
  document.body.appendChild(scrim);
  document.body.style.overflow = 'hidden';
  scrim.querySelector('.sheet').addEventListener('click', onAction);
  onMount && onMount(scrim.querySelector('.sheet'));
}
function closeSheet() { const s = document.getElementById('scrim'); if (s) s.remove(); document.body.style.overflow = ''; }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
const sheetHead = title => `<div class="head"><h2>${title}</h2><button class="iconbtn" data-act="close" aria-label="Закрыть">${ICON_CLOSE}</button></div>`;

let confirmCb = null;
function confirmSheet(title, text, okLabel, cb) {
  confirmCb = cb;
  sheet(`${sheetHead(title)}<p style="margin:0">${esc(text)}</p><div class="btns"><button class="btn primary" style="flex:1" data-act="confirm-ok">${esc(okLabel)}</button><button class="btn" style="flex:1" data-act="close">Отмена</button></div>`);
}

function studentSheet(id, afterSave) {
  const s = id ? C.studentById(id) : { name: '', phone: '', remind: true, note: '' };
  sheet(`${sheetHead(id ? 'Изменить' : 'Новая ученица')}
    <form class="form" id="stForm">
      <label class="f">Имя и фамилия<input type="text" id="fName" value="${esc(s.name)}" required autocomplete="off"></label>
      <label class="f">Телефон, если нужен<input type="tel" id="fPhone" value="${esc(s.phone)}" placeholder="+7"></label>
      <label class="switch">Напоминать о конце абонемента<input type="checkbox" id="fRemind" ${s.remind ? 'checked' : ''}></label>
      <label class="f">Заметка<input type="text" id="fNote" value="${esc(s.note)}" placeholder="например, ходит по вт и чт"></label>
      <button class="btn primary" type="submit">Сохранить</button>
      ${id ? `<button class="btn ghost danger" type="button" data-act="delete-student" data-id="${id}">Удалить ученицу</button>` : ''}
    </form>`, el => {
    el.querySelector('#fName').focus();
    el.querySelector('#stForm').addEventListener('submit', e => {
      e.preventDefault();
      const name = el.querySelector('#fName').value.trim(); if (!name) return;
      const data = { name, phone: el.querySelector('#fPhone').value.trim(), remind: el.querySelector('#fRemind').checked, note: el.querySelector('#fNote').value.trim() };
      let sid = id;
      if (id) Object.assign(C.studentById(id), data); else { sid = uid(); db.students.push({ id: sid, token: token(), ...data }); }
      save(); closeSheet(); toast('Сохранено');
      afterSave ? afterSave(sid) : render();
    });
  });
}

function passSheet(studentId, prefill = {}) {
  const t = today(), st = db.settings;
  let perWeek = prefill.perWeek || 3, weeks = prefill.weeks || 4, priceTouched = false;
  const prev = studentId ? C.studentPasses(studentId)[0] : null;
  let start = t;
  if (prev) { const ps = C.passState(prev); if (C.isLive(ps)) start = addDays(ps.end, 1); }
  const students = [...db.students].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  sheet(`${sheetHead('Оплата абонемента')}
    <form class="form" id="pForm">
      <label class="f">Ученица<select id="pStudent" required>
        <option value="">Выберите</option>
        ${students.map(s => `<option value="${s.id}" ${s.id === studentId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
      </select></label>
      <div class="f">Раз в неделю
        <div class="seg" id="pPer">${[1, 2, 3, 4].map(n => `<button type="button" data-n="${n}" aria-pressed="${n === perWeek}">${n}</button>`).join('')}</div></div>
      <div class="grid2">
        <label class="f">Недель<input type="number" inputmode="numeric" id="pWeeks" value="${weeks}" min="1" max="12"></label>
        <label class="f">Начало<input type="date" id="pStart" value="${start}"></label>
      </div>
      <div class="grid2">
        <label class="f">Сумма, ₽<input type="number" inputmode="numeric" id="pPrice" min="0"></label>
        <label class="f">Дата оплаты<input type="date" id="pPaid" value="${t}"></label>
      </div>
      <div class="summary" id="pSum"></div>
      <button class="btn primary" type="submit">Записать оплату</button>
    </form>`, el => {
    const $ = q => el.querySelector(q);
    const upd = () => {
      weeks = Math.max(1, Number($('#pWeeks').value) || 1);
      const total = perWeek * weeks;
      if (!priceTouched) $('#pPrice').value = total * st.pricePerLesson;
      const s = $('#pStart').value || t;
      $('#pSum').innerHTML = `<b>${zan(total)}</b> за ${weeks} ${plural(weeks, 'неделю', 'недели', 'недель')}, действует <b>с ${fmt(s)} по ${fmt(addDays(s, weeks * 7 - 1))}</b>. Что не использовано к концу срока, сгорает.`;
    };
    $('#pPer').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; perWeek = Number(b.dataset.n); $('#pPer').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); upd(); });
    $('#pWeeks').addEventListener('input', upd); $('#pStart').addEventListener('change', upd);
    $('#pPrice').addEventListener('input', () => { priceTouched = true; });
    upd();
    $('#pForm').addEventListener('submit', e => {
      e.preventDefault();
      const sid = $('#pStudent').value; if (!sid) { $('#pStudent').focus(); return; }
      db.passes.push({ id: uid(), studentId: sid, perWeek, weeks, total: perWeek * weeks, price: Number($('#pPrice').value) || 0, paidAt: $('#pPaid').value || t, start: $('#pStart').value || t, freezes: [] });
      save(); closeSheet(); toast('Оплата записана'); render();
    });
  });
}

function freezeSheet(passId) {
  const p = db.passes.find(x => x.id === passId), t = today();
  sheet(`${sheetHead('Заморозка')}
    <p class="hint">Пропуск по уважительной причине. Срок абонемента сдвинется на эти дни, занятия не сгорят.</p>
    <form class="form" id="fzForm">
      <label class="f">Причина<select id="fzReason">${Object.entries(REASONS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <div class="grid2">
        <label class="f">С<input type="date" id="fzFrom" value="${t}"></label>
        <label class="f">По<input type="date" id="fzTo" value="${addDays(t, 6)}"></label>
      </div>
      <div class="summary" id="fzSum"></div>
      <button class="btn primary" type="submit">Заморозить</button>
    </form>`, el => {
    const $ = q => el.querySelector(q);
    const upd = () => {
      const from = $('#fzFrom').value, to = $('#fzTo').value;
      if (!from || !to || to < from) { $('#fzSum').textContent = 'Дата «по» должна быть не раньше даты «с».'; return; }
      const days = diff(from, to) + 1;
      $('#fzSum').innerHTML = `${days} ${plural(days, 'день', 'дня', 'дней')}. Абонемент будет действовать до <b>${fmt(addDays(C.passEnd(p), days))}</b> вместо ${fmt(C.passEnd(p))}.`;
    };
    $('#fzFrom').addEventListener('change', upd); $('#fzTo').addEventListener('change', upd); upd();
    $('#fzForm').addEventListener('submit', e => {
      e.preventDefault();
      const from = $('#fzFrom').value, to = $('#fzTo').value;
      if (!from || !to || to < from) return;
      p.freezes.push({ id: uid(), from, to, reason: $('#fzReason').value });
      save(); closeSheet(); toast('Абонемент заморожен'); render(); studentCard(p.studentId);
    });
  });
}

let sheetText = '';
function shareSheet(title, hint, text, note) {
  sheetText = text;
  const canShare = typeof navigator.share === 'function';
  sheet(`${sheetHead(title)}
    <p class="hint">${hint}</p>
    <div class="msg">${esc(text)}</div>
    <div class="btns">
      ${canShare ? '<button class="btn primary" style="flex:1" data-act="share">Отправить в Макс…</button>' : ''}
      <button class="btn ${canShare ? '' : 'primary'}" style="flex:1" data-act="copy-text">Скопировать</button>
    </div>
    <p class="hint">${note}</p>`);
}
function remindSheet(sid) {
  const s = C.studentById(sid), p = C.currentPass(sid), st = C.passState(p);
  const text = db.settings.template
    .replaceAll('{имя}', firstName(s.name)).replaceAll('{осталось}', zan(st.left))
    .replaceAll('{до}', fmt(st.end)).replaceAll('{ссылка}', studentLink(s));
  shareSheet('Напоминание', `Для ${esc(s.name)}${s.phone ? `, ${esc(s.phone)}` : ''}.`, text, '«Отправить в Макс…» открывает список приложений телефона: выберите Макс и чат с ученицей.');
}
function linkSheet(sid) {
  const s = C.studentById(sid);
  const text = `${firstName(s.name)}, это твоя страница Ballet Forever: там видно, сколько занятий осталось в абонементе и до какого числа он действует.\n${studentLink(s)}\nОткрой ссылку и добавь страницу на главный экран телефона.`;
  shareSheet('Ссылка для ученицы', `Личная страница ${esc(s.name)}. Ссылку знает только она: по ней видно только её абонемент.`, text, 'Если ссылка попала не тому человеку, нажмите «Новая ссылка» в карточке ученицы, старая перестанет работать.');
}
function previewSheet(sid) {
  const s = C.studentById(sid);
  const card = { student: { id: s.id, name: s.name }, passes: db.passes.filter(p => p.studentId === sid), visits: db.visits.filter(v => v.studentId === sid), schedule: db.schedule, settings: db.settings };
  sheet(`${sheetHead('Так видит ученица')}<div style="display:flex;flex-direction:column;gap:22px">${BF.studentView(card)}</div>`);
}

function studentCard(sid) {
  const s = C.studentById(sid);
  const passes = C.studentPasses(sid);
  const cur = C.currentPass(sid);
  const st = cur ? C.passState(cur) : null;
  const visits = db.visits.filter(v => v.studentId === sid).sort((a, b) => a.date < b.date ? 1 : -1);
  sheet(`<div class="head"><div style="display:flex;gap:12px;align-items:center;min-width:0"><div class="avatar">${esc(initials(s.name))}</div><div style="min-width:0"><h2 style="overflow-wrap:anywhere">${esc(s.name)}</h2><div class="hint">${esc(s.phone || '')}${s.phone && !s.remind ? ' · ' : ''}${s.remind ? '' : 'без напоминаний'}</div></div></div>
      <button class="iconbtn" data-act="close" aria-label="Закрыть">${ICON_CLOSE}</button></div>
    ${s.note ? `<p class="hint">${esc(s.note)}</p>` : ''}
    ${cur ? `<div class="card" style="padding:14px">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap"><div class="eyebrow">Текущий абонемент</div><span class="pill ${st.tone}">${st.label}</span></div>
      <div style="margin-top:6px;font-weight:500" class="num">${cur.perWeek} ${plural(cur.perWeek, 'раз', 'раза', 'раз')} в неделю · ${zan(cur.total)} · ${rub(cur.price)}</div>
      <div class="hint num">с ${fmt(cur.start)} по ${fmt(st.end)}${cur.freezes.length ? `, продлён на ${C.frozenDays(cur)} дн.` : ''}</div>
      ${meter(cur, st)}
      ${cur.freezes.length ? `<div style="margin-top:10px;display:flex;flex-direction:column;gap:4px">${cur.freezes.map(f => `<div class="hint" style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span>${REASONS[f.reason] || 'Заморозка'}: ${fmt(f.from)} – ${fmt(f.to)}</span><button class="btn small ghost danger" data-act="del-freeze" data-pass="${cur.id}" data-id="${f.id}">убрать</button></div>`).join('')}</div>` : ''}
      <div class="btns" style="margin-top:12px">
        ${C.isLive(st) || st.key === 'future' ? `<button class="btn small" data-act="freeze" data-id="${cur.id}">Заморозить</button>` : ''}
        ${s.remind && C.isLive(st) ? `<button class="btn small" data-act="remind" data-id="${sid}">Напомнить</button>` : ''}
      </div>
    </div>` : '<p class="hint">Абонементов нет, ходит разово.</p>'}
    <div class="btns">
      <button class="btn primary" style="flex:1" data-act="renew" data-id="${sid}">${cur ? 'Продлить' : 'Купить абонемент'}</button>
      <button class="btn" style="flex:1" data-act="edit-student" data-id="${sid}">Изменить</button>
    </div>
    <div class="card" style="padding:14px;display:flex;flex-direction:column;gap:10px">
      <div class="eyebrow">Страница ученицы</div>
      <p class="hint">Личная ссылка: ученица открывает её и видит свой остаток занятий, срок и расписание.</p>
      <div class="btns">
        <button class="btn small primary" data-act="send-link" data-id="${sid}">Отправить ссылку</button>
        <button class="btn small" data-act="preview" data-id="${sid}">Как она видит</button>
        <button class="btn small ghost" data-act="new-token" data-id="${sid}">Новая ссылка</button>
      </div>
    </div>
    ${passes.length > 1 ? `<div><div class="eyebrow" style="margin-bottom:6px">Все абонементы</div><div class="list">${passes.map(p => { const ps = C.passState(p); return `<div class="row"><div class="main"><div class="name num">${fmt(p.start)} – ${fmt(ps.end)}</div><div class="sub num">${p.perWeek} р/нед · ${zan(p.total)} · ${rub(p.price)}</div></div><span class="pill ${ps.tone}">${ps.key === 'active' || ps.key === 'soon' ? ps.left : ps.label}</span></div>`; }).join('')}</div></div>` : ''}
    <div><div class="eyebrow" style="margin-bottom:6px">Посещения</div>
      <div class="list">${visits.length ? visits.slice(0, 30).map(v => `<div class="row" style="min-height:44px"><div class="main"><div class="num">${fmtDow(v.date)}</div><div class="sub">${esc(C.classById(v.classId)?.title || 'занятие')}</div></div><span class="pill ${v.kind === 'single' ? 'mute' : 'ok'}">${v.kind === 'single' ? `разово, ${rub(v.price)}` : 'абонемент'}</span></div>`).join('') : '<div class="empty">Посещений пока нет.</div>'}</div></div>
    ${passes.length ? `<button class="btn ghost danger" data-act="delete-pass" data-id="${passes[0].id}">Удалить последнюю оплату</button>` : ''}`);
}

function classSheet(id) {
  const c = id ? C.classById(id) : { dow: 1, title: 'Балет', start: '19:00', end: '20:30' };
  sheet(`${sheetHead(id ? 'Занятие' : 'Новое занятие')}
    <form class="form" id="cForm">
      <label class="f">Название<input type="text" id="cTitle" value="${esc(c.title)}" required></label>
      <label class="f">День недели<select id="cDow">${[1, 2, 3, 4, 5, 6, 0].map(d => `<option value="${d}" ${d === c.dow ? 'selected' : ''}>${DOW_FULL[d]}</option>`).join('')}</select></label>
      <div class="grid2"><label class="f">Начало<input type="time" id="cStart" value="${c.start}"></label><label class="f">Конец<input type="time" id="cEnd" value="${c.end}"></label></div>
      <button class="btn primary" type="submit">Сохранить</button>
      ${id ? `<button class="btn ghost danger" type="button" data-act="delete-class" data-id="${id}">Удалить из расписания</button>` : ''}
    </form>`, el => {
    el.querySelector('#cForm').addEventListener('submit', e => {
      e.preventDefault();
      const data = { title: el.querySelector('#cTitle').value.trim() || 'Занятие', dow: Number(el.querySelector('#cDow').value), start: el.querySelector('#cStart').value, end: el.querySelector('#cEnd').value };
      if (id) Object.assign(C.classById(id), data); else db.schedule.push({ id: uid(), ...data });
      save(); closeSheet(); render();
    });
  });
}

/* ---------- копирование и копии ---------- */
async function copy(text, okMsg) {
  try { await navigator.clipboard.writeText(text); toast(okMsg); return true; }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (_) {}
    ta.remove(); toast(ok ? okMsg : 'Не получилось скопировать, выделите текст вручную'); return ok;
  }
}
function markBackup() { db.settings.lastBackup = today(); save(); }
function exportFile() {
  const json = JSON.stringify(db);
  const name = `ballet-forever-${today()}.json`;
  const blob = new Blob([json], { type: 'application/json' });
  const file = typeof File === 'function' ? new File([blob], name, { type: 'application/json' }) : null;
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: 'Копия Ballet Forever' }).then(() => { markBackup(); render(); }).catch(() => {});
    return;
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  markBackup(); render(); toast('Файл копии сохранён');
}

/* ---------- нажатия ---------- */
function onAction(e) {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act, id = el.dataset.id;
  switch (act) {
    case 'close': closeSheet(); break;
    case 'confirm-ok': { const cb = confirmCb; closeSheet(); cb && cb(); break; }
    case 'tab-home': setTab('home'); break;
    case 'go-settings': tab = 'settings'; render(); break;
    case 'mark-class': openMark(el.dataset.date, el.dataset.class); window.scrollTo(0, 0); break;
    case 'toggle': toggleMark(id); break;
    case 'save-mark': saveMark(); break;
    case 'new-student': studentSheet(null); break;
    case 'new-student-mark': studentSheet(null, sid => { if (markState) markState.picked.set(sid, { kind: 'single' }); render(); }); break;
    case 'edit-student': studentSheet(id, () => { render(); studentCard(id); }); break;
    case 'open-student': studentCard(id); break;
    case 'new-pass': passSheet(null); break;
    case 'renew': { const p = C.studentPasses(id)[0]; passSheet(id, p ? { perWeek: p.perWeek, weeks: p.weeks } : {}); break; }
    case 'freeze': freezeSheet(id); break;
    case 'del-freeze': { const p = db.passes.find(x => x.id === el.dataset.pass); p.freezes = p.freezes.filter(f => f.id !== id); save(); render(); studentCard(p.studentId); break; }
    case 'remind': remindSheet(id); break;
    case 'send-link': linkSheet(id); break;
    case 'preview': previewSheet(id); break;
    case 'new-token': confirmSheet('Сделать новую ссылку?', 'Старая ссылка перестанет работать. Новую нужно будет отправить ученице.', 'Сделать', () => { C.studentById(id).token = token(); save(); linkSheet(id); }); break;
    case 'copy-text': copy(sheetText, 'Текст скопирован'); break;
    case 'share': navigator.share({ text: sheetText }).catch(() => {}); break;
    case 'delete-student': { const s = C.studentById(id); confirmSheet('Удалить ученицу?', `${s.name}, её абонементы и посещения удалятся.`, 'Удалить', () => {
      db.students = db.students.filter(x => x.id !== id); db.passes = db.passes.filter(p => p.studentId !== id); db.visits = db.visits.filter(v => v.studentId !== id); save(); render(); toast('Удалено'); }); break; }
    case 'delete-pass': { const p = db.passes.find(x => x.id === id); confirmSheet('Удалить оплату?', `Абонемент с ${fmt(p.start)} на ${zan(p.total)}, ${rub(p.price)}. Посещения по нему станут разовыми без оплаты.`, 'Удалить', () => {
      db.visits.forEach(v => { if (v.passId === id) { v.kind = 'single'; v.price = 0; delete v.passId; } }); db.passes = db.passes.filter(x => x.id !== id); save(); render(); studentCard(p.studentId); }); break; }
    case 'month': moneyMonth = el.dataset.m; render(); break;
    case 'save-settings': {
      const n = (q, d) => { const v = Number(document.getElementById(q).value); return Number.isFinite(v) && v >= 0 ? v : d; };
      Object.assign(db.settings, { pricePerLesson: n('stLesson', 500), priceSingle: n('stSingle', 1000), soonLessons: n('stSoonL', 2), soonDays: n('stSoonD', 5), template: document.getElementById('stTpl').value.trim() || BF.DEFAULT_TEMPLATE });
      save(); toast('Настройки сохранены'); break;
    }
    case 'edit-class': classSheet(id); break;
    case 'delete-class': confirmSheet('Удалить занятие из расписания?', 'Прошлые отметки посещений сохранятся.', 'Удалить', () => { db.schedule = db.schedule.filter(c => c.id !== id); C = BF.calc(db); save(); render(); }); break;
    case 'export': exportFile(); break;
    case 'copy-backup': copy(JSON.stringify(db), 'Копия скопирована, вставьте её в «Избранное»').then(ok => { if (ok) { markBackup(); render(); } }); break;
    case 'clear-examples': confirmSheet('Убрать примеры?', 'Выдуманные ученицы, их абонементы и посещения удалятся. Расписание и цены останутся.', 'Убрать', () => {
      const ex = new Set(db.students.filter(s => s.example).map(s => s.id));
      db.students = db.students.filter(s => !ex.has(s.id)); db.passes = db.passes.filter(p => !ex.has(p.studentId)); db.visits = db.visits.filter(v => !ex.has(v.studentId));
      C = BF.calc(db); save(); render(); toast('Примеры убраны'); }); break;
    case 'wipe': confirmSheet('Стереть всё?', 'Удалятся ученицы, оплаты, посещения и настройки. Отменить нельзя.', 'Стереть', () => { setDb(BF.defaults()); save(); setTab('home'); }); break;
    case 'logout': Store.signOut().then(() => location.reload()); break;
  }
  // после удаления/замены массивов пересчитываем
  C = BF.calc(db);
}
app.addEventListener('click', onAction);

/* ---------- вход ---------- */
function renderLogin(message) {
  document.body.classList.add('logged-out');
  app.innerHTML = `<div class="login">
    <div class="hero"><div class="ballerina" data-ballerina>${BF.ballerina}</div><h1>Ballet Forever</h1><p>вход для преподавателя</p></div>
    <form class="form" id="loginForm">
      <label class="f">Почта<input type="email" id="lEmail" autocomplete="email" required></label>
      <label class="f">Пароль<input type="password" id="lPass" autocomplete="current-password" minlength="6" required></label>
      <p class="err" id="lErr" ${message ? '' : 'hidden'}>${esc(message || '')}</p>
      <button class="btn primary" type="submit">Войти</button>
      <button class="btn ghost" type="button" id="lSignup">Первый раз? Создать аккаунт</button>
    </form>
    <p class="hint">Ученицам вход не нужен: у каждой своя ссылка, её можно отправить из карточки ученицы.</p>
  </div>`;
  const form = document.getElementById('loginForm'), err = document.getElementById('lErr');
  const go = async signup => {
    err.hidden = true;
    const email = document.getElementById('lEmail').value.trim(), pass = document.getElementById('lPass').value;
    if (!email || pass.length < 6) { err.textContent = 'Введите почту и пароль не короче 6 символов'; err.hidden = false; return; }
    try { signup ? await Store.signUp(email, pass) : await Store.signIn(email, pass); boot(); }
    catch (e) { err.textContent = e.message; err.hidden = false; }
  };
  form.addEventListener('submit', e => { e.preventDefault(); go(false); });
  document.getElementById('lSignup').addEventListener('click', () => go(true));
}

async function boot() {
  BF.loadBallerina(BASE);
  try {
    const user = await Store.user();
    if (!user) { document.body.classList.add('logged-out'); renderLogin(); return; }
    document.body.classList.remove('logged-out');
    setDb(await Store.load({ sample, replaced: d => { setDb(d); render(); } }));
    if (ensureTokens()) save();
    render();
  } catch (e) {
    app.innerHTML = `<div class="screen"><div class="banner"><span>${esc(e.message)}</span><button class="btn small" onclick="location.reload()">Обновить</button></div></div>`;
  }
}
boot();

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
