// Приложение преподавателя: неделя, ученицы, заявки, деньги, настройки.
(() => {
'use strict';
const BF = window.BF, Store = BF.Store, ui = BF.ui;
const { today, addDays, diff, parse, weekStart, fmt, fmtDow, plural, zan, raz, rub, uid, token, esc, initials, firstName, callName, pad, DOW, DOW_FULL, MONTHS, MONTHS_NOM, REASONS, METHODS } = BF;
const BASE = new URL('./', location.href).href;

let db, C, inbox = { requests: [], days: {}, intents: [], unread: [] };
let tab = 'week', selDate = today(), studentFilter = '', moneyMonth = today().slice(0, 7);
const setDb = d => { db = d; C = BF.calc(db); };
BF.app = { db: () => db, save: () => Store.save(db) };
const save = () => Store.save(db);
const studentLink = s => `${BASE}me/?t=${s.token}`;
const inviteLink = () => `${BASE}me/?join=${Store.invite}`;
const app = document.getElementById('app');
const toast = ui.toast;

/* ---------- примеры для демо ---------- */
function sample() {
  const d = BF.defaults(), t = today();
  d.settings.payInfo = 'Перевод по номеру +7 900 000-00-00 (пример), Сбербанк';
  const mk = (name, remind = true) => { const s = { id: uid(), name, phone: '', remind, note: '', example: true, token: token() }; d.students.push(s); return s; };
  const pass = (s, perWeek, startOffset, extra = {}) => { const p = { id: uid(), studentId: s.id, perWeek, weeks: 4, total: perWeek * 4, price: perWeek * 4 * 500, paidAt: addDays(t, startOffset), start: addDays(t, startOffset), freezes: [], ...extra }; d.passes.push(p); return p; };
  const pastClassDays = from => { const out = []; for (let x = from; x < t; x = addDays(x, 1)) d.schedule.filter(c => c.dow === parse(x).getDay()).forEach(c => out.push({ date: x, classId: c.id })); return out; };
  const attend = (s, p, ids, keep = 0) => pastClassDays(p.start).filter(x => ids.includes(x.classId)).slice(0, p.total - keep).forEach(x => d.visits.push({ id: uid(), studentId: s.id, date: x.date, classId: x.classId, kind: 'pass', passId: p.id }));
  const a = mk('Алина Морозова'); attend(a, pass(a, 3, -24), ['c1', 'c2', 'c3', 'c4'], 1);
  const b = mk('Вера Соколова'); attend(b, pass(b, 2, -10), ['c2', 'c3']);
  const c = mk('Дарья Лебедева');
  const pc = pass(c, 4, -26, { freezes: [{ id: uid(), from: addDays(t, -12), to: addDays(t, -6), reason: 'trip' }] });
  pastClassDays(pc.start).filter(x => x.date < addDays(t, -12) || x.date > addDays(t, -6)).forEach(x => d.visits.push({ id: uid(), studentId: c.id, date: x.date, classId: x.classId, kind: 'pass', passId: pc.id }));
  const o = mk('Ольга Павлова', false);
  pastClassDays(addDays(t, -14)).filter(x => x.classId === 'c3').forEach(x => d.visits.push({ id: uid(), studentId: o.id, date: x.date, classId: x.classId, kind: 'single', price: 1000 }));
  const e = mk('Ксения Белова'); attend(e, pass(e, 3, -3), ['c2', 'c3', 'c4']);
  const f = mk('Марина Орлова'); attend(f, pass(f, 2, -35), ['c2', 'c4']);
  const nextOf = cid => { for (let i = 0; i < 8; i++) { const x = addDays(t, i); if (d.schedule.find(c => c.id === cid).dow === parse(x).getDay()) return x; } };
  const photo = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="420"><rect width="600" height="420" fill="#f4f4f2"/><rect x="40" y="40" width="520" height="340" fill="#fff" stroke="#999"/><text x="70" y="100" font-family="Arial" font-size="26" fill="#333">Листок нетрудоспособности</text><rect x="70" y="130" width="300" height="30" fill="#222"/><text x="70" y="210" font-family="Arial" font-size="20" fill="#555">Освобождение от работы</text><text x="70" y="250" font-family="Arial" font-size="20" fill="#555">с 08.10 по 13.10</text><rect x="70" y="290" width="200" height="26" fill="#222"/><text x="300" y="360" font-family="Arial" font-size="16" fill="#999">пример, ФИО и диагноз закрыты</text></svg>');
  const v0 = d.passes.find(p => p.studentId === b.id); v0.paid = false; v0.paidAt = null;
  d.messages.push({ id: uid(), date: t, to: 'all', text: 'Девочки, в воскресенье начинаем ровно в 13:00, приходите заранее размяться.' });
  const extra = {
    days: { [a.id]: ['c1', 'c2', 'c3'], [b.id]: ['c2', 'c3'], [c.id]: ['c1', 'c2', 'c3', 'c4'], [o.id]: ['c3'], [e.id]: ['c2', 'c3', 'c4'] },
    chat: [{ id: uid(), studentId: b.id, fromTeacher: false, text: 'Добрый вечер! В четверг опоздаю минут на 10, с работы не успеваю.', at: new Date().toISOString(), read: false }],
    intents: [{ studentId: b.id, date: nextOf('c2'), classId: 'c2', kind: 'skip' }, { studentId: o.id, date: nextOf('c4'), classId: 'c4', kind: 'extra' }],
    requests: [
      { id: uid(), studentId: a.id, kind: 'payment', payload: { planId: 'p3', perWeek: 3, weeks: 4, price: 6000, method: 'transfer' }, photo: null, status: 'new', createdAt: new Date().toISOString() },
      { id: uid(), studentId: e.id, kind: 'freeze', payload: { from: addDays(t, -2), to: addDays(t, 3), reason: 'sick' }, photo, status: 'new', createdAt: new Date().toISOString() },
      { id: uid(), token: token(), kind: 'join', payload: { name: 'Полина Смирнова' }, photo: null, status: 'new', createdAt: new Date().toISOString() },
    ],
  };
  return { studio: d, extra };
}

/* ---------- шапка, вкладки, статус ---------- */
const SYNC_TEXT = { saved: 'сохранено', pending: 'сохраняю…', offline: 'нет связи, сохранено в телефоне', conflict: 'загружены данные с другого устройства', auth: 'нужно войти заново' };
function showSync() {
  const el = document.getElementById('sync'); if (!el) return;
  if (Store.mode === 'local') { el.className = 'sync pending'; el.innerHTML = '<i></i>демо: данные только в этом браузере'; return; }
  const s = Store.status;
  el.className = 'sync ' + (s === 'pending' ? 'pending' : s === 'saved' ? '' : 'off');
  el.innerHTML = `<i></i>${SYNC_TEXT[s] || ''}`;
}
Store.onStatus(s => { showSync(); if (s === 'conflict') toast('Данные изменились на другом устройстве, показываю свежие'); if (s === 'auth') boot(); });

const tabsEl = document.getElementById('tabs');
tabsEl.addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (b) setTab(b.dataset.tab); });
document.getElementById('settingsBtn').addEventListener('click', () => setTab('settings'));
function setTab(t) { tab = t; render(); window.scrollTo(0, 0); }
function render() {
  const unreadBy = [...new Set((inbox.unread || []).map(m => m.studentId))];
  const n = inbox.requests.length + unreadBy.length;
  tabsEl.innerHTML = [['week', 'Неделя'], ['students', 'Ученицы'], ['inbox', `Входящие${n ? ` <b class="count">${n}</b>` : ''}`], ['money', 'Деньги'], ['music', 'Музыка']]
    .map(([k, l]) => `<button data-tab="${k}" ${tab === k ? 'aria-current="page"' : ''}>${l}</button>`).join('');
  if (tab === 'music') BF.music.render(app);
  else ({ week: renderWeek, students: renderStudents, inbox: renderInbox, money: renderMoney, settings: renderSettings })[tab]();
  showSync();
}

const meter = (p, st) => BF.meter(C, p, st);
const exPill = s => s && s.example ? ' <span class="pill ex">пример</span>' : '';
const nameOf = (r) => r.kind === 'join' ? r.payload.name : (C.studentById(r.studentId)?.name || 'Ученица');

/* ---------- Неделя ---------- */
function debts() {
  const out = [];
  db.passes.filter(p => C.unpaid(p)).forEach(p => out.push({ kind: 'pass', id: p.id, sid: p.studentId, sum: p.price, text: `абонемент ${raz(p.perWeek)} в неделю с ${fmt(p.start)}` }));
  db.visits.filter(v => v.kind === 'single' && v.paid === false).forEach(v => out.push({ kind: 'visit', id: v.id, sid: v.studentId, sum: v.price, text: `разовое ${fmt(v.date)}` }));
  return out;
}
function renderWeek() {
  const t = today(), ws = weekStart(selDate);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const we = days[6];
  const monthLabel = parse(ws).getMonth() === parse(we).getMonth() ? `${MONTHS_NOM[parse(ws).getMonth()]} ${parse(ws).getFullYear()}` : `${MONTHS_NOM[parse(ws).getMonth()]} – ${MONTHS_NOM[parse(we).getMonth()].toLowerCase()}`;
  const classes = C.classesFor(selDate);

  const soon = [];
  db.students.forEach(s => {
    const p = C.currentPass(s.id); if (!p) return;
    if (db.passes.some(q => q.studentId === s.id && q.start > p.start)) return;
    const st = C.passState(p);
    if (st.key === 'soon' || ((st.key === 'used' || st.key === 'expired') && diff(st.end, t) <= 14)) soon.push({ s, p, st });
  });
  soon.sort((a, b) => a.st.left - b.st.left || a.st.daysLeft - b.st.daysLeft);
  const owe = debts();
  const hasExamples = db.students.some(s => s.example);

  const classCard = cls => {
    const cancel = C.cancelOf(selDate, cls.id);
    if (cancel) return `<article class="card cls cancelled">
      <div class="cls-head"><div class="cls-time disp">${cls.start}</div><div class="main"><h3>${esc(cls.title)}</h3><div class="hint">Отменено${cancel.reason ? `: ${esc(cancel.reason)}` : ''}${cancel.extended?.length ? `. Абонементы продлены: ${cancel.extended.length}` : ''}</div></div></div>
      <button class="btn block" data-act="restore-class" data-date="${selDate}" data-class="${cls.id}">Вернуть занятие</button>
    </article>`;
    const visits = db.visits.filter(v => v.date === selDate && v.classId === cls.id);
    const exp = C.expected(selDate, cls.id, inbox.days, inbox.intents);
    const past = C.isPast(selDate, cls);
    const marked = visits.length > 0;
    const names = marked ? visits.map(v => C.studentById(v.studentId)?.name).filter(Boolean)
      : exp.coming.map(x => x.s.name);
    return `<article class="card cls">
      <div class="cls-head"><div class="cls-time disp">${cls.start}</div><div class="main"><h3>${esc(cls.title)}</h3><div class="hint num">${cls.start}–${cls.end}</div></div></div>
      <div class="cls-who">
        <div class="eyebrow">${marked ? `Пришли: ${visits.length}` : `Собираются: ${exp.coming.length}`}</div>
        ${names.length ? `<div class="names">${names.map(n => `<span>${esc(n)}</span>`).join('')}</div>` : `<p class="hint">${marked ? '' : 'Никто не отметил этот день постоянным.'}</p>`}
        ${!marked && exp.skipping.length ? `<p class="hint">Не придут: ${exp.skipping.map(s => esc(callName(s))).join(', ')}</p>` : ''}
      </div>
      <button class="btn ${past && !marked ? 'primary' : ''} block" data-act="mark" data-date="${selDate}" data-class="${cls.id}">${marked ? 'Изменить отметку' : 'Отметить, кто пришёл'}</button>
      ${!marked && !past ? `<div class="btns"><button class="btn small" data-act="cancel-class" data-date="${selDate}" data-class="${cls.id}">Отменить занятие</button><button class="btn small" data-act="message" data-date="${selDate}" data-class="${cls.id}">Написать тем, кто придёт</button></div>` : ''}
    </article>`;
  };

  app.innerHTML = `<div class="screen">
    ${hasExamples ? `<div class="banner"><span>Здесь выдуманные ученицы для примера.</span><button class="btn small" data-act="clear-examples">Убрать примеры</button></div>` : ''}
    ${inbox.requests.length || (inbox.unread || []).length ? `<button class="banner link" data-act="go-inbox"><span>${[inbox.requests.length ? `Новые заявки: ${inbox.requests.length}` : '', (inbox.unread || []).length ? `Сообщения: ${(inbox.unread || []).length}` : ''].filter(Boolean).join('. ')}</span><span aria-hidden="true">→</span></button>` : ''}
    <div class="btns"><button class="btn" style="flex:1" data-act="message">Написать ученицам</button><button class="btn" style="flex:1" data-act="schedule">Расписание</button></div>
    <section class="week">
      <div class="week-head"><button class="iconbtn" data-act="week" data-d="-7" aria-label="Предыдущая неделя">‹</button><div class="disp">${monthLabel}</div><button class="iconbtn" data-act="week" data-d="7" aria-label="Следующая неделя">›</button></div>
      <div class="week-days">${days.map(d => {
        const cls = C.classesFor(d), has = cls.length, marked = db.visits.some(v => v.date === d), allOff = has && cls.every(c => C.cancelOf(d, c.id));
        return `<button class="wd ${d === selDate ? 'sel' : ''} ${d === t ? 'today' : ''}" data-act="day" data-d="${d}" ${has ? '' : 'data-empty'}><small>${DOW[parse(d).getDay()]}</small><b>${parse(d).getDate()}</b><i class="${allOff ? 'off' : has ? (marked ? 'done' : 'dot') : ''}"></i></button>`;
      }).join('')}</div>
      ${selDate !== t ? `<button class="btn ghost small" data-act="day" data-d="${t}">Сегодня</button>` : ''}
    </section>
    <section class="day">
      <div class="sec-title"><h2>${selDate === t ? 'Сегодня' : diff(t, selDate) === 1 ? 'Завтра' : DOW_FULL[parse(selDate).getDay()][0].toUpperCase() + DOW_FULL[parse(selDate).getDay()].slice(1)}, ${fmt(selDate)}</h2></div>
      ${classes.length ? classes.map(classCard).join('') : '<p class="empty">В этот день занятий нет.</p>'}
    </section>
    ${soon.length ? `<section>
      <div class="sec-title"><h2>Абонементы заканчиваются</h2><span class="num">${soon.length}</span></div>
      <div class="list">${soon.map(({ s, p, st }) => `<button class="row" data-act="open-student" data-id="${s.id}">
        <div class="avatar">${esc(initials(s.name))}</div>
        <div class="main"><div class="name">${esc(s.name)}${exPill(s)}</div><div class="sub num">${st.key === 'soon' ? `осталось ${st.left} из ${p.total} · до ${fmt(st.end)}` : st.key === 'expired' ? `срок вышел ${fmt(st.end)}` : 'занятия закончились'}</div></div>
        <span class="pill ${st.tone}">${st.key === 'soon' ? st.left : 'всё'}</span></button>`).join('')}</div>
    </section>` : ''}
    ${owe.length ? `<section>
      <div class="sec-title"><h2>Не оплачено</h2><span class="num">${rub(owe.reduce((a, x) => a + Number(x.sum || 0), 0))}</span></div>
      <div class="list">${owe.map(x => `<button class="row" data-act="open-student" data-id="${x.sid}"><div class="avatar">${esc(initials(C.studentById(x.sid)?.name || ''))}</div><div class="main"><div class="name">${esc(C.studentById(x.sid)?.name || '—')}</div><div class="sub">${x.text}</div></div><span class="pill warn num">${rub(x.sum)}</span></button>`).join('')}</div>
    </section>` : ''}
  </div>`;
}

/* ---------- Отметка занятия ---------- */
const NOPASS = { paid: 'разово, оплачено', debt: 'разово, в долг', newpass: 'новый абонемент, в долг' };
function markPage(date, classId) {
  const cls = C.classById(classId);
  const existing = db.visits.filter(v => v.date === date && v.classId === classId);
  const exp = C.expected(date, classId, inbox.days, inbox.intents);
  const picked = new Set(existing.length ? existing.map(v => v.studentId) : exp.coming.map(x => x.s.id));
  const how = {}; existing.forEach(v => { if (v.kind === 'single') how[v.studentId] = v.paid === false ? 'debt' : 'paid'; });
  const expectedIds = new Set(exp.coming.map(x => x.s.id));
  const ids = existing.map(v => v.id);
  const order = [...db.students].sort((a, b) => (expectedIds.has(b.id) - expectedIds.has(a.id)) || a.name.localeCompare(b.name, 'ru'));

  const draw = body => {
    const row = s => {
      const p = C.passForVisit(s.id, date, ids), st = p ? C.passState(p, date) : null, on = picked.has(s.id);
      return `<div class="mark-item"><button class="row" data-act="toggle" data-id="${s.id}" aria-pressed="${on}">
        <div class="check">${ui.ICON_CHECK}</div>
        <div class="main"><div class="name">${esc(s.name)}${exPill(s)}</div><div class="sub num">${p ? `абонемент, осталось ${st.left}${C.unpaid(p) ? ' · не оплачен' : ''}` : 'нет действующего абонемента'}${expectedIds.has(s.id) ? ' · собиралась' : ''}</div></div>
      </button>
      ${on && !p ? `<div class="seg small" data-sid="${s.id}">${Object.entries(NOPASS).map(([k, l]) => `<button type="button" data-act="how" data-id="${s.id}" data-k="${k}" aria-pressed="${(how[s.id] || 'paid') === k}">${l}</button>`).join('')}</div>` : ''}</div>`;
    };
    const exp1 = order.filter(s => expectedIds.has(s.id)), rest = order.filter(s => !expectedIds.has(s.id));
    body.innerHTML = `
      <p class="hint">${existing.length ? 'Отметка уже сохранена, можно поправить.' : 'Отмечены те, кто собирался прийти. Снимите галочку, если не пришла, и добавьте тех, кто пришёл без записи.'} Если у пришедшей нет абонемента, выберите: разово, в долг или новый абонемент.</p>
      <button class="btn primary block" data-act="save-mark">Сохранить: пришли ${picked.size}</button>
      ${exp1.length ? `<div><div class="eyebrow" style="margin-bottom:6px">Собирались прийти</div><div class="list card">${exp1.map(row).join('')}</div></div>` : ''}
      ${rest.length ? `<div><div class="eyebrow" style="margin-bottom:6px">Остальные</div><div class="list card">${rest.map(row).join('')}</div></div>` : ''}
      <button class="btn primary block" data-act="save-mark">Сохранить: пришли ${picked.size}</button>`;
  };
  ui.page('', {
    title: `${esc(cls.title)}, ${fmtDow(date)}`,
    onMount: draw,
    onAction: e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const body = document.querySelector('#page .page-body');
      if (a.dataset.act === 'toggle') { picked.has(a.dataset.id) ? picked.delete(a.dataset.id) : picked.add(a.dataset.id); draw(body); }
      if (a.dataset.act === 'how') { how[a.dataset.id] = a.dataset.k; draw(body); }
      if (a.dataset.act === 'save-mark') {
        db.visits = db.visits.filter(v => !(v.date === date && v.classId === classId));
        let singles = 0, debt = 0;
        picked.forEach(sid => {
          const prev = existing.find(v => v.studentId === sid);
          let p = C.passForVisit(sid, date);
          if (!p && how[sid] === 'newpass') {
            const last = C.studentPasses(sid)[0], plans = db.settings.plans;
            const plan = (last && plans.find(x => x.perWeek === last.perWeek && x.weeks === last.weeks)) || plans[1] || plans[0];
            p = { id: uid(), studentId: sid, perWeek: plan.perWeek, weeks: plan.weeks, total: plan.perWeek * plan.weeks, price: plan.price, paid: false, paidAt: null, start: date, freezes: [] };
            db.passes.push(p); debt++;
          }
          if (p) db.visits.push({ id: prev?.id || uid(), studentId: sid, date, classId, kind: 'pass', passId: p.id });
          else {
            singles++; const unpaid = how[sid] === 'debt'; if (unpaid) debt++;
            db.visits.push({ id: prev?.id || uid(), studentId: sid, date, classId, kind: 'single', price: prev?.price ?? db.settings.priceSingle, paid: !unpaid });
          }
        });
        save(); ui.closePage(); render();
        toast(`Сохранено: ${picked.size}${singles ? `, разово ${singles}` : ''}${debt ? `, в долг ${debt}` : ''}`);
      }
    },
  });
}

/* ---------- Отмена занятия, сообщения, расписание ---------- */
function cancelPage(date, classId) {
  const cls = C.classById(classId);
  const exp = C.expected(date, classId, inbox.days, inbox.intents);
  const live = s => { const p = C.passForVisit(s.id, date); return p ? p : null; };
  const pick = new Set(exp.coming.filter(x => live(x.s)).map(x => x.s.id));
  const draw = body => {
    body.innerHTML = `
      <label class="f">Причина, её увидят ученицы<input type="text" id="cReason" maxlength="120" placeholder="Например: заболел преподаватель"></label>
      <div><div class="eyebrow" style="margin-bottom:6px">Продлить абонемент на неделю</div>
        <div class="list card">${db.students.filter(s => live(s)).sort((a, b) => (pick.has(b.id) - pick.has(a.id)) || a.name.localeCompare(b.name, 'ru')).map(s => `<button class="row" data-act="pick" data-id="${s.id}" aria-pressed="${pick.has(s.id)}"><div class="check">${ui.ICON_CHECK}</div><div class="main"><div class="name">${esc(s.name)}</div><div class="sub">${exp.coming.some(x => x.s.id === s.id) ? 'собиралась прийти' : 'не собиралась'}</div></div></button>`).join('') || '<p class="empty">Ни у кого нет действующего абонемента.</p>'}</div>
        <p class="hint" style="margin-top:6px">Отмечены те, кто собирался прийти. Им придёт сообщение об отмене.</p></div>
      <button class="btn primary block" data-act="do-cancel">Отменить занятие</button>`;
  };
  ui.page('', {
    title: `Отмена: ${esc(cls.title)}, ${fmtDow(date)}`, onMount: draw,
    onAction: e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const body = document.querySelector('#page .page-body');
      if (a.dataset.act === 'pick') { const r = body.querySelector('#cReason').value; pick.has(a.dataset.id) ? pick.delete(a.dataset.id) : pick.add(a.dataset.id); draw(body); body.querySelector('#cReason').value = r; }
      if (a.dataset.act === 'do-cancel') {
        const reason = body.querySelector('#cReason').value.trim(), cid = uid();
        const extended = [];
        pick.forEach(sid => { const p = live(C.studentById(sid)); if (p) { (p.extensions = p.extensions || []).push({ id: uid(), days: 7, reason: 'cancel', cancelId: cid }); extended.push(sid); } });
        db.cancels.push({ id: cid, date, classId, reason, extended });
        const to = [...new Set([...exp.coming.map(x => x.s.id), ...extended])];
        const text = `Занятие «${cls.title}» ${fmtDow(date)} в ${cls.start} отменено${reason ? `: ${reason}` : ''}.${extended.length ? ' Абонемент продлён на неделю.' : ''}`;
        if (to.length) addMessage(text, to);
        save(); ui.closePage(); render(); toast('Занятие отменено');
        if (to.length) sharePage('Сообщение об отмене', `Ученицы увидят его в приложении. Можно также отправить в группу в Максе.`, text);
      }
    },
  });
}
function addMessage(text, to) {
  db.messages = (db.messages || []).filter(m => m.date >= addDays(today(), -30));
  db.messages.push({ id: uid(), date: today(), text, to });
}
function messagePage(date, classId) {
  const exp = date ? C.expected(date, classId, inbox.days, inbox.intents) : null;
  const sel = new Set(exp ? exp.coming.map(x => x.s.id) : []);
  let mode = exp ? 'some' : 'all';
  const draw = body => {
    const txt = body.querySelector('#mText')?.value || '';
    body.innerHTML = `
      <label class="f">Текст<textarea id="mText" maxlength="600" placeholder="Например: в четверг начнём на 15 минут позже"></textarea></label>
      <div class="f">Кому<div class="seg" id="mMode"><button type="button" data-act="mode" data-k="all" aria-pressed="${mode === 'all'}">Всем</button><button type="button" data-act="mode" data-k="some" aria-pressed="${mode === 'some'}">Выбрать</button></div></div>
      ${mode === 'some' ? `<div class="btns"><button class="btn small" data-act="sel-soon">У кого заканчивается</button><button class="btn small" data-act="sel-none">Снять всех</button></div>
        <div class="list card">${[...db.students].sort((a, b) => a.name.localeCompare(b.name, 'ru')).map(s => `<button class="row" data-act="pick" data-id="${s.id}" aria-pressed="${sel.has(s.id)}"><div class="check">${ui.ICON_CHECK}</div><div class="main"><div class="name">${esc(s.name)}</div></div></button>`).join('')}</div>` : ''}
      <p class="hint">Сообщение появится вверху приложения у учениц и будет видно три недели.</p>
      <button class="btn primary block" data-act="send-msg">Отправить${mode === 'some' ? ` (${sel.size})` : ''}</button>`;
    body.querySelector('#mText').value = txt;
  };
  ui.page('', {
    title: exp ? `Тем, кто придёт ${fmtDow(date)}` : 'Сообщение ученицам', onMount: draw,
    onAction: e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const body = document.querySelector('#page .page-body');
      if (a.dataset.act === 'mode') { mode = a.dataset.k; draw(body); }
      if (a.dataset.act === 'pick') { sel.has(a.dataset.id) ? sel.delete(a.dataset.id) : sel.add(a.dataset.id); draw(body); }
      if (a.dataset.act === 'sel-none') { sel.clear(); draw(body); }
      if (a.dataset.act === 'sel-soon') { db.students.forEach(s => { const p = C.currentPass(s.id); const st = p && C.passState(p); if (st && ['soon', 'used', 'expired'].includes(st.key)) sel.add(s.id); }); draw(body); }
      if (a.dataset.act === 'send-msg') {
        const text = body.querySelector('#mText').value.trim();
        if (!text) { toast('Напишите текст'); return; }
        if (mode === 'some' && !sel.size) { toast('Выберите, кому отправить'); return; }
        if (mode === 'some' && sel.size === 1) { const one = [...sel][0]; Store.sendTo(one, text).then(() => { toast('Отправлено'); chatPage(one); }).catch(err => toast(err.message)); return; }
        addMessage(text, mode === 'all' ? 'all' : [...sel]); save(); toast('Отправлено в приложение');
        sharePage('Отправлено', 'Ученицы увидят сообщение в приложении. Если нужно, отправьте его и в группу в Максе.', text);
      }
    },
  });
}
function schedulePage() {
  const draw = body => {
    body.innerHTML = `<p class="hint">Постоянное расписание на каждую неделю. Нажмите на занятие, чтобы поменять название, день или время.</p>
      <div class="list card">${C.sortedSchedule().map(c => `<button class="row" data-act="edit-class" data-id="${c.id}"><div class="avatar" style="font-size:13px">${DOW[c.dow]}</div><div class="main"><div class="name">${esc(c.title)}</div><div class="sub num">${DOW_FULL[c.dow]}, ${c.start}–${c.end}</div></div><span aria-hidden="true">›</span></button>`).join('')}</div>
      <button class="btn block" data-act="edit-class" data-id="">Добавить занятие в расписание</button>
      <p class="hint">Чтобы отменить одно конкретное занятие, выберите день на вкладке «Неделя» и нажмите «Отменить занятие».</p>`;
  };
  ui.page('', { title: 'Расписание', onMount: draw, onAction: e => onAction(e) });
}

/* ---------- Ученицы ---------- */
function renderStudents() {
  const q = studentFilter.trim().toLowerCase();
  const list = db.students.filter(s => !q || s.name.toLowerCase().includes(q))
    .map(s => { const p = C.currentPass(s.id); return { s, p, st: p ? C.passState(p) : null }; })
    .sort((a, b) => a.s.name.localeCompare(b.s.name, 'ru'));
  app.innerHTML = `<div class="screen">
    <div class="btns"><button class="btn primary" style="flex:1" data-act="invite">Пригласить учениц</button><button class="btn" style="flex:1" data-act="new-student">Добавить вручную</button></div>
    <input type="text" id="sSearch" placeholder="Поиск по имени" value="${esc(studentFilter)}" aria-label="Поиск по имени">
    <div class="list">
      ${list.length ? list.map(({ s, p, st }) => `<button class="row" data-act="open-student" data-id="${s.id}">
        <div class="avatar">${esc(initials(s.name))}</div>
        <div class="main"><div class="name">${esc(s.name)}${exPill(s)}${(inbox.unread || []).some(m => m.studentId === s.id) ? ' <span class="pill warn">сообщение</span>' : ''}</div>
          <div class="sub num">${p ? `${raz(p.perWeek)} в неделю · до ${fmt(st.end)}` : 'разовые занятия'}${(inbox.days[s.id] || []).length ? ` · ${(inbox.days[s.id]).map(id => C.classById(id) ? DOW[C.classById(id).dow] : '').filter(Boolean).join(', ')}` : ''}</div></div>
        ${p ? `<span class="pill ${st.tone} num">${st.key === 'active' || st.key === 'soon' ? `${st.left} из ${p.total}` : st.label}</span>` : '<span class="pill mute">разово</span>'}
      </button>`).join('') : '<div class="empty">Пока никого. Пригласите учениц ссылкой: они сами пришлют заявку.</div>'}
    </div>
  </div>`;
  document.getElementById('sSearch').addEventListener('input', e => {
    studentFilter = e.target.value; const pos = e.target.selectionStart; render();
    const n = document.getElementById('sSearch'); n.focus(); n.setSelectionRange(pos, pos);
  });
}

function studentPage(sid) {
  const draw = body => {
    const s = C.studentById(sid); if (!s) { ui.closePage(); return; }
    const passes = C.studentPasses(sid), cur = C.currentPass(sid), st = cur ? C.passState(cur) : null;
    const live = cur && (C.isLive(st) || st.key === 'future');
    const visits = db.visits.filter(v => v.studentId === sid).sort((a, b) => a.date < b.date ? 1 : -1);
    const days = inbox.days[sid] || [];
    const owe = debts().filter(x => x.sid === sid);
    body.innerHTML = `
      <div class="who"><div class="avatar">${esc(initials(s.name))}</div><div class="main"><h2 class="disp">${esc(s.name)}</h2><div class="hint">${esc(s.phone || '')}${s.note ? (s.phone ? ' · ' : '') + esc(s.note) : ''}</div></div>
        <button class="iconbtn" data-act="student-menu" data-id="${sid}" aria-label="Изменить, объединить, удалить">⋯</button></div>
      <button class="btn block" data-act="chat" data-id="${sid}">Написать${(inbox.unread || []).filter(m => m.studentId === sid).length ? ` · новых: ${(inbox.unread || []).filter(m => m.studentId === sid).length}` : ''}</button>
      ${live ? `<div class="card status">
        <div class="status-top"><div class="eyebrow">Абонемент · ${raz(cur.perWeek)} в неделю</div><span class="pill ${st.tone}">${st.key === 'future' ? st.label : st.key === 'frozen' ? 'заморожен' : 'действует'}</span></div>
        <div class="big"><b>${st.left}</b><span>из ${cur.total} · до ${fmt(st.end)}</span></div>
        ${meter(cur, st)}
        <details class="cal-wrap"><summary>Календарь посещений</summary>${BF.calendar(C, db, sid, cur, inbox.days[sid] || [], inbox.intents)}</details>
        ${C.unpaid(cur) ? `<div class="note">Не оплачен: ${rub(cur.price)} <button class="btn small" data-act="mark-paid" data-kind="pass" data-id="${cur.id}">Оплачено</button></div>` : ''}
        ${cur.freezes.length || (cur.extensions || []).length ? `<div class="hint">${cur.freezes.map(f => `${REASONS[f.reason] || 'Заморозка'}: ${fmt(f.from)} – ${fmt(f.to)} <button class="btn small ghost danger" data-act="del-freeze" data-pass="${cur.id}" data-id="${f.id}">убрать</button>`).join('<br>')}${(cur.extensions || []).length ? `${cur.freezes.length ? '<br>' : ''}Продлён из-за отмены занятий: +${C.extraDays(cur)} дн.` : ''}</div>` : ''}
        <div class="btns"><button class="btn" style="flex:1" data-act="freeze" data-id="${cur.id}">Заморозить</button>${s.remind ? `<button class="btn" style="flex:1" data-act="remind" data-id="${sid}">Напомнить</button>` : ''}</div>
      </div>
      <button class="btn block" data-act="pay" data-id="${sid}">Оформить следующий абонемент</button>`
      : `<div class="card status"><div class="eyebrow">Абонемент</div><p class="disp" style="font-size:22px;margin:0">${cur ? (st.key === 'expired' ? `Закончился ${fmt(st.end)}` : 'Занятия закончились') : 'Нет абонемента'}</p>
        <button class="btn primary block" data-act="pay" data-id="${sid}">Оформить абонемент</button></div>`}
      ${owe.filter(x => x.kind === 'visit').length ? `<div class="card status"><div class="eyebrow">Долг за разовые</div>${owe.filter(x => x.kind === 'visit').map(x => `<div class="debt-row"><span>${x.text} · ${rub(x.sum)}</span><button class="btn small" data-act="mark-paid" data-kind="visit" data-id="${x.id}">Оплачено</button></div>`).join('')}</div>` : ''}
      <div><div class="eyebrow" style="margin-bottom:8px">Постоянные дни</div>
        <div class="chips">${C.sortedSchedule().map(c => `<button class="chip" data-act="day-toggle" data-sid="${sid}" data-id="${c.id}" aria-pressed="${days.includes(c.id)}">${DOW[c.dow]} · ${esc(c.title)}</button>`).join('')}</div>
        <p class="hint" style="margin-top:6px">Ученица может отметить дни и сама, в своём приложении.</p></div>
      <div class="btns">
        <button class="btn" style="flex:1" data-act="send-link" data-id="${sid}">Отправить ссылку на приложение</button>
        <a class="btn" style="flex:1" href="${studentLink(s)}" target="_blank" rel="noopener">Как она видит</a>
      </div>
      ${passes.length ? `<div><div class="eyebrow" style="margin-bottom:6px">Абонементы</div><div class="list">${passes.map(p => { const ps = C.passState(p); return `<div class="row"><div class="main"><div class="name num">${fmt(p.start)} – ${fmt(ps.end)}</div><div class="sub num">${raz(p.perWeek)} в неделю · ${zan(p.total)} · ${rub(p.price)}${C.unpaid(p) ? ' · не оплачен' : ''}</div></div><button class="iconbtn" data-act="delete-pass" data-id="${p.id}" aria-label="Удалить абонемент">×</button></div>`; }).join('')}</div></div>` : ''}
      <div><div class="eyebrow" style="margin-bottom:6px">Посещения</div>
        <div class="list">${visits.length ? visits.slice(0, 30).map(v => `<div class="row" style="min-height:44px"><div class="main"><div class="num">${fmtDow(v.date)}</div><div class="sub">${esc(C.classById(v.classId)?.title || 'занятие')}</div></div><span class="pill ${v.kind === 'single' ? (v.paid === false ? 'warn' : 'mute') : 'ok'}">${v.kind === 'single' ? `разово${v.paid === false ? ', долг' : ''}` : 'абонемент'}</span></div>`).join('') : '<div class="empty">Посещений пока нет.</div>'}</div></div>`;
  };
  ui.page('', { title: 'Ученица', onMount: draw, onAction: e => onAction(e, () => draw(document.querySelector('#page .page-body'))) });
}
function studentMenu(sid) {
  const s = C.studentById(sid);
  ui.page(`<p class="disp" style="font-size:22px;margin:0">${esc(s.name)}</p>
    <button class="btn block" data-act="edit-student" data-id="${sid}">Изменить имя, телефон, заметку</button>
    <button class="btn block" data-act="merge" data-id="${sid}">Объединить с другой карточкой</button>
    <p class="hint">Если ученица записана дважды: абонементы, посещения и дни перейдут в одну карточку, вторая удалится.</p>
    <button class="btn block danger" data-act="delete-student" data-id="${sid}">Удалить ученицу</button>`, { title: 'Действия', onAction: e => onAction(e) });
}
function mergePage(sid) {
  const s = C.studentById(sid);
  const others = db.students.filter(x => x.id !== sid).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  ui.page(`<p>Выберите карточку, <b>которую оставить</b>. В неё перейдут абонементы, посещения и дни из карточки «${esc(s.name)}», а эта карточка удалится.</p>
    <div class="list card">${others.map(o => `<button class="row" data-act="merge-into" data-id="${o.id}" data-from="${sid}"><div class="avatar">${esc(initials(o.name))}</div><div class="main"><div class="name">${esc(o.name)}</div><div class="sub">${C.studentPasses(o.id).length} абон. · ${db.visits.filter(v => v.studentId === o.id).length} посещ.</div></div></button>`).join('')}</div>`,
    { title: 'Объединить', onAction: e => onAction(e) });
}
function mergeStudents(from, into) {
  db.passes.forEach(p => { if (p.studentId === from) p.studentId = into; });
  db.visits.forEach(v => { if (v.studentId === from) v.studentId = into; });
  // одна отметка на одно занятие
  const seen = new Set(); db.visits = db.visits.filter(v => { const k = `${v.studentId}|${v.date}|${v.classId}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const days = [...new Set([...(inbox.days[into] || []), ...(inbox.days[from] || [])])];
  db.students = db.students.filter(x => x.id !== from);
  inbox.days[into] = days; delete inbox.days[from];
  save(); Store.setDaysFor(into, days).catch(() => {});
}

/* ---------- Заявки ---------- */
function renderInbox() {
  const rs = inbox.requests;
  const card = r => {
    const s = C.studentById(r.studentId), when = fmt(r.createdAt.slice(0, 10));
    if (r.kind === 'join') return `<article class="card req"><div class="eyebrow">Новая ученица · ${when}</div><h3>${esc(r.payload.name)}</h3>
      <p class="hint">Прислала заявку по ссылке-приглашению. После подтверждения появится в списке и сможет отмечать дни и оплаты.</p>
      <div class="btns"><button class="btn primary" data-act="approve" data-id="${r.id}">Принять</button><button class="btn" data-act="reject" data-id="${r.id}">Отклонить</button></div></article>`;
    if (r.kind === 'payment') {
      const p = r.payload;
      if (p.existing) return `<article class="card req"><div class="eyebrow">Перенос абонемента · ${when}</div><h3>${esc(s?.name || 'Ученица')}</h3>
        <p><b>Уже действующий абонемент</b>: ${raz(p.perWeek)} в неделю, с ${fmt(p.start)}, <b>осталось ${zan(Number(p.left) || 0)}</b>.<br><span class="hint">Сверьте с тетрадкой. Деньги за него получены раньше.</span></p>
        <div class="btns"><button class="btn primary" data-act="approve" data-id="${r.id}">Подтвердить</button><button class="btn" data-act="reject" data-id="${r.id}">Отклонить</button></div></article>`;
      return `<article class="card req"><div class="eyebrow">Оплата · ${when}</div><h3>${esc(s?.name || 'Ученица')}</h3>
        <p>${p.passId ? 'Оплата абонемента, который уже оформлен: ' : ''}<b>${raz(p.perWeek)} в неделю</b>, ${zan(p.perWeek * p.weeks)}${p.start ? `, с ${fmt(p.start)}` : ''} · <b>${rub(p.price)}</b><br><span class="hint">${METHODS[p.method] || ''}${p.method === 'transfer' ? '. Проверьте поступление в банке.' : '. Получите деньги на занятии.'}</span></p>
        <div class="btns"><button class="btn primary" data-act="approve" data-id="${r.id}">Деньги получены</button><button class="btn" data-act="reject" data-id="${r.id}">Отклонить</button></div></article>`;
    }
    const p = r.payload;
    return `<article class="card req"><div class="eyebrow">Пропуск по уважительной причине · ${when}</div><h3>${esc(s?.name || 'Ученица')}</h3>
      <p><b>${REASONS[p.reason] || 'Причина'}</b>: ${fmt(p.from)} – ${fmt(p.to)} (${diff(p.from, p.to) + 1} дн.)${p.note ? `<br><span class="hint">${esc(p.note)}</span>` : ''}</p>
      ${r.hasPhoto ? `<div class="photo-slot" id="ph-${r.id}"><button class="btn small" data-act="photo" data-id="${r.id}">Посмотреть документ</button></div>` : '<p class="hint">Без фото документа.</p>'}
      <p class="hint">После решения фото удалится с сервера.</p>
      <div class="btns"><button class="btn primary" data-act="approve" data-id="${r.id}">Продлить абонемент</button><button class="btn" data-act="reject" data-id="${r.id}">Отклонить</button></div></article>`;
  };
  const groups = {}; (inbox.unread || []).forEach(m => { (groups[m.studentId] = groups[m.studentId] || []).push(m); });
  const msgs = Object.entries(groups).map(([sid, list]) => ({ s: C.studentById(sid), list })).filter(x => x.s);
  app.innerHTML = `<div class="screen">
    ${msgs.length ? `<section><div class="sec-title"><h2>Сообщения</h2><span class="num">${(inbox.unread || []).length}</span></div>
      <div class="list">${msgs.map(({ s, list }) => `<button class="row" data-act="chat" data-id="${s.id}"><div class="avatar">${esc(initials(s.name))}</div><div class="main"><div class="name">${esc(s.name)}</div><div class="sub">${esc(list[list.length - 1].text.slice(0, 90))}</div></div><span class="pill warn num">${list.length}</span></button>`).join('')}</div></section>` : ''}
    ${rs.length ? `<section><div class="sec-title"><h2>Заявки</h2><span class="num">${rs.length}</span></div><div class="day">${rs.map(card).join('')}</div></section>` : ''}
    ${!rs.length && !msgs.length ? '<p class="empty">Новых сообщений и заявок нет. Здесь появятся сообщения учениц, оплаты, пропуски и новые ученицы.</p>' : ''}
    <button class="btn ghost" data-act="refresh">Проверить новые</button>
  </div>`;
}
async function decide(id, approve) {
  const r = inbox.requests.find(x => x.id === id); if (!r) return;
  try {
    if (approve) {
      if (r.kind === 'join') db.students.push({ id: uid(), name: r.payload.name, token: r.token, phone: '', remind: true, note: '' });
      const owed = r.kind === 'payment' && r.payload.passId && db.passes.find(x => x.id === r.payload.passId && C.unpaid(x));
      if (owed) { owed.paid = true; owed.paidAt = today(); }
      else if (r.kind === 'payment') {
        const p = r.payload, prev = C.studentPasses(r.studentId)[0], total = p.perWeek * p.weeks;
        let start = p.start || today(); if (!p.start && prev) { const ps = C.passState(prev); if (C.isLive(ps)) start = addDays(ps.end, 1); }
        const pass = { id: uid(), studentId: r.studentId, perWeek: p.perWeek, weeks: p.weeks, total, price: p.price, paid: true, paidAt: p.existing ? null : today(), start, freezes: [] };
        if (p.existing) { pass.carried = total - Math.min(total, Math.max(0, Number(p.left) || 0)); pass.imported = true; }
        db.passes.push(pass);
      }
      if (r.kind === 'freeze') {
        const p = r.payload;
        const pass = C.studentPasses(r.studentId).find(x => p.from <= C.passEnd(x) && p.to >= x.start) || C.currentPass(r.studentId);
        if (!pass) { toast('У ученицы нет абонемента, продлевать нечего'); }
        else pass.freezes.push({ id: uid(), from: p.from, to: p.to, reason: p.reason });
      }
      save();
    }
    await Store.resolve(id, approve ? 'approved' : 'rejected');
    inbox.requests = inbox.requests.filter(x => x.id !== id);
    toast(approve ? (r.kind === 'join' ? 'Ученица добавлена' : r.kind === 'payment' ? 'Абонемент оформлен' : 'Абонемент продлён') : 'Заявка отклонена');
    render();
  } catch (e) { toast(e.message); }
}

/* ---------- Деньги ---------- */
function renderMoney() {
  const [y, m] = moneyMonth.split('-').map(Number);
  const inMonth = d => d && d.slice(0, 7) === moneyMonth;
  const passes = db.passes.filter(p => !C.unpaid(p) && inMonth(p.paidAt));
  const singles = db.visits.filter(v => v.kind === 'single' && v.paid !== false && inMonth(v.paidAt || v.date));
  const owe = debts();
  const visits = db.visits.filter(v => inMonth(v.date));
  const passSum = passes.reduce((s, p) => s + Number(p.price || 0), 0);
  const singleSum = singles.reduce((s, v) => s + Number(v.price || 0), 0);
  const burned = db.passes.map(p => C.passState(p)).filter(st => st.key === 'expired' && inMonth(st.end)).reduce((s, st) => s + st.burned, 0);
  const shift = k => { const d = new Date(y, m - 1 + k, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
  const ops = [
    ...passes.map(p => ({ date: p.paidAt, text: C.studentById(p.studentId)?.name || '—', sub: `абонемент ${raz(p.perWeek)} в неделю`, sum: p.price })),
    ...singles.map(v => ({ date: v.paidAt || v.date, text: C.studentById(v.studentId)?.name || '—', sub: `разовое · ${C.classById(v.classId)?.title || ''}`, sum: v.price })),
  ].sort((a, b) => a.date < b.date ? 1 : -1);
  app.innerHTML = `<div class="screen">
    <div class="sec-title"><h2>${MONTHS_NOM[m - 1]} ${y}</h2>
      <span class="btns"><button class="iconbtn" data-act="month" data-m="${shift(-1)}" aria-label="Предыдущий месяц">‹</button><button class="iconbtn" data-act="month" data-m="${shift(1)}" aria-label="Следующий месяц">›</button></span></div>
    <div class="stats">
      <div class="card stat"><b>${rub(passSum + singleSum)}</b><span>всего получено</span></div>
      <div class="card stat"><b>${visits.length}</b><span>посещений</span></div>
      <div class="card stat"><b>${rub(passSum)}</b><span>абонементы (${passes.length})</span></div>
      <div class="card stat"><b>${rub(singleSum)}</b><span>разовые (${singles.length})</span></div>
    </div>
    <div class="card stat"><b>${burned}</b><span>${plural(burned, 'занятие сгорело', 'занятия сгорело', 'занятий сгорело')} у абонементов, истёкших в этом месяце</span></div>
    ${owe.length ? `<section><div class="sec-title"><h2>Не оплачено</h2><span class="num">${rub(owe.reduce((a, x) => a + Number(x.sum || 0), 0))}</span></div>
      <div class="list">${owe.map(x => `<div class="row"><div class="main"><div class="name">${esc(C.studentById(x.sid)?.name || '—')}</div><div class="sub">${x.text} · ${rub(x.sum)}</div></div><button class="btn small" data-act="mark-paid" data-kind="${x.kind}" data-id="${x.id}">Оплачено</button></div>`).join('')}</div></section>` : ''}
    <section><div class="sec-title"><h2>Оплаты</h2></div>
      <div class="list">${ops.length ? ops.map(o => `<div class="row" style="min-height:52px"><div class="main"><div class="name">${esc(o.text)}</div><div class="sub">${fmt(o.date)} · ${esc(o.sub)}</div></div><b class="num" style="font-weight:500">${rub(o.sum)}</b></div>`).join('') : '<div class="empty">В этом месяце оплат нет.</div>'}</div></section>
  </div>`;
}

/* ---------- Настройки ---------- */
function renderSettings() {
  const st = db.settings;
  app.innerHTML = `<div class="screen">
    <div class="sec-title"><h2>Настройки</h2><button class="btn small" data-act="tab-week">Готово</button></div>
    <section class="form">
      <div class="sec-title"><h2>Абонементы</h2></div>
      <p class="hint">Эти варианты видят ученицы, когда нажимают «Я оплатила».</p>
      <div class="plans-edit">${st.plans.map((p, i) => `<div class="plan-edit" data-i="${i}">
        <label class="f">Раз в неделю<input type="number" inputmode="numeric" min="1" max="7" data-k="perWeek" value="${p.perWeek}"></label>
        <label class="f">Недель<input type="number" inputmode="numeric" min="1" max="12" data-k="weeks" value="${p.weeks}"></label>
        <label class="f">Цена, ₽<input type="number" inputmode="numeric" min="0" data-k="price" value="${p.price}"></label>
        <button class="iconbtn" data-act="plan-del" data-i="${i}" aria-label="Убрать вариант">×</button></div>`).join('')}</div>
      <button class="btn ghost" data-act="plan-add">Добавить вариант</button>
      <label class="f">Разовое занятие, ₽<input type="number" inputmode="numeric" id="stSingle" value="${st.priceSingle}" min="0"></label>
      <label class="f">Как переводить деньги<textarea id="stPay" placeholder="Например: перевод по номеру +7 900 000-00-00, Сбербанк, Иван И.">${esc(st.payInfo)}</textarea></label>
      <p class="hint">Ученица увидит этот текст, когда выберет оплату переводом.</p>
      <div class="sec-title"><h2>Предупреждать</h2></div>
      <div class="grid2">
        <label class="f">Осталось занятий не больше<input type="number" inputmode="numeric" id="stSoonL" value="${st.soonLessons}" min="0"></label>
        <label class="f">Или дней до конца не больше<input type="number" inputmode="numeric" id="stSoonD" value="${st.soonDays}" min="0"></label>
      </div>
      <label class="f">Текст напоминания<textarea id="stTpl">${esc(st.template)}</textarea></label>
      <p class="hint">Подставляется: {имя}, {осталось}, {до}, {ссылка}.</p>
      <button class="btn primary" data-act="save-settings">Сохранить настройки</button>
    </section>
    <section class="form">
      <div class="sec-title"><h2>Расписание</h2></div>
      <button class="btn" data-act="schedule">Изменить расписание</button>
    </section>
    <section class="form">
      <div class="sec-title"><h2>Ссылка-приглашение</h2></div>
      <p class="hint">Одна ссылка для всей группы в Максе. По ней новые ученицы присылают заявку.</p>
      <div class="msg">${esc(inviteLink())}</div>
      <div class="btns"><button class="btn primary" data-act="invite">Отправить</button><button class="btn" data-act="new-invite">Сделать новую</button></div>
    </section>
    <section class="form">
      <div class="sec-title"><h2>Резервная копия</h2></div>
      <div class="btns"><button class="btn" data-act="export">Сохранить в файл</button><button class="btn" data-act="copy-backup">Скопировать текстом</button></div>
      <label class="btn" style="cursor:pointer">Загрузить из файла<input type="file" id="importFile" accept=".json,application/json,text/plain" hidden></label>
      ${st.lastBackup ? `<p class="hint">Последняя копия: ${fmt(st.lastBackup)}.</p>` : ''}
    </section>
    <section class="form">
      <div class="sec-title"><h2>Прочее</h2></div>
      <div class="btns">
        ${Store.mode === 'local' ? '<button class="btn" data-act="reset-demo">Вернуть примеры</button>' : ''}
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
function readPlans() {
  return [...document.querySelectorAll('.plan-edit')].map((el, i) => {
    const v = k => Math.max(0, Number(el.querySelector(`[data-k="${k}"]`).value) || 0);
    return { id: db.settings.plans[i]?.id || uid(), perWeek: Math.max(1, v('perWeek')), weeks: Math.max(1, v('weeks')), price: v('price') };
  });
}
function importText(text) {
  try {
    const data = JSON.parse(text);
    if (!Array.isArray(data.students) || !Array.isArray(data.passes) || !Array.isArray(data.visits)) throw new Error();
    confirmPage('Загрузить копию?', `В копии ${data.students.length} учениц и ${data.passes.length} абонементов. Текущие данные заменятся.`, 'Загрузить', () => { setDb(BF.normalize(data)); save(); toast('Копия загружена'); setTab('week'); });
  } catch (e) { toast('Это не похоже на файл копии Ballet Forever'); }
}

/* ---------- формы ---------- */
function confirmPage(title, text, ok, cb) {
  ui.page(`<p>${esc(text)}</p><button class="btn primary block" data-act="ok">${esc(ok)}</button><button class="btn block" data-act="close">Отмена</button>`,
    { title, onAction: e => { if (e.target.closest('[data-act="ok"]')) { ui.closePage(); cb(); } } });
}

function studentForm(id, after) {
  const s = id ? C.studentById(id) : { name: '', phone: '', remind: true, note: '' };
  ui.page(`<form class="form" id="stForm">
      <label class="f">Имя и фамилия<input type="text" id="fName" value="${esc(s.name)}" required autocomplete="off"></label>
      <label class="f">Как обращаться в сообщениях<input type="text" id="fCall" value="${esc(s.callName || '')}" placeholder="${esc(s.name ? callName({ name: s.name }) : 'Ксения')}" autocomplete="off"></label>
      <label class="f">Телефон, если нужен<input type="tel" id="fPhone" value="${esc(s.phone)}" placeholder="+7"></label>
      <label class="switch">Напоминать о конце абонемента<input type="checkbox" id="fRemind" ${s.remind ? 'checked' : ''}></label>
      <label class="f">Заметка<input type="text" id="fNote" value="${esc(s.note)}"></label>
      <button class="btn primary" type="submit">Сохранить</button>
      ${id ? `<button class="btn ghost danger" type="button" data-act="delete-student" data-id="${id}">Удалить ученицу</button>` : ''}
    </form>`, {
    title: id ? 'Данные ученицы' : 'Новая ученица',
    onAction: e => onAction(e),
    onMount: el => {
      el.querySelector('#stForm').addEventListener('submit', e => {
        e.preventDefault();
        const name = el.querySelector('#fName').value.trim(); if (!name) return;
        const data = { name, callName: el.querySelector('#fCall').value.trim(), phone: el.querySelector('#fPhone').value.trim(), remind: el.querySelector('#fRemind').checked, note: el.querySelector('#fNote').value.trim() };
        let sid = id;
        if (id) Object.assign(C.studentById(id), data); else { sid = uid(); db.students.push({ id: sid, token: token(), ...data }); }
        save(); ui.closePage(); render(); toast('Сохранено');
        after ? after(sid) : studentPage(sid);
      });
    },
  });
}

function payForm(sid) {
  const plans = db.settings.plans, t = today();
  let planId = plans[1]?.id || plans[0].id;
  const prev = C.studentPasses(sid)[0];
  if (prev) { const same = plans.find(p => p.perWeek === prev.perWeek && p.weeks === prev.weeks); if (same) planId = same.id; }
  let start = t; if (prev) { const ps = C.passState(prev); if (C.isLive(ps)) start = addDays(ps.end, 1); }
  ui.page(`<form class="form" id="pForm">
      <p class="disp" style="font-size:20px;margin:0">${esc(C.studentById(sid).name)}</p>
      <div class="plan-cards" id="pPlans">${plans.map(p => `<button type="button" class="plan" data-id="${p.id}" aria-pressed="${p.id === planId}"><b>${BF.planTitle(p)}</b><span>${BF.planSub(p)}</span><em>${rub(p.price)}</em></button>`).join('')}</div>
      <div class="grid2"><label class="f">Начало<input type="date" id="pStart" value="${start}"></label><label class="f">Сумма, ₽<input type="number" inputmode="numeric" id="pPrice" min="0"></label></div>
      <label class="switch">Абонемент уже идёт (перенос из тетрадки)<input type="checkbox" id="pOld"></label>
      <label class="f" id="pLeftLine" hidden>Сколько занятий осталось<input type="number" inputmode="numeric" id="pLeft" min="1"></label>
      <label class="switch" id="pPaidLine">Уже оплачено<input type="checkbox" id="pPaid" checked></label>
      <label class="switch" id="pConvLine" hidden><span id="pConvText"></span><input type="checkbox" id="pConv" checked></label>
      <div class="summary" id="pSum"></div>
      <button class="btn primary" type="submit">Оформить абонемент</button>
    </form>`, {
    title: 'Оформить абонемент',
    onMount: el => {
      const $ = q => el.querySelector(q);
      const singlesFrom = s => db.visits.filter(v => v.studentId === sid && v.kind === 'single' && v.date >= s);
      const upd = () => {
        const p = plans.find(x => x.id === planId); $('#pPrice').value = p.price;
        const s = $('#pStart').value || t, sg = singlesFrom(s), old = $('#pOld').checked, total = p.perWeek * p.weeks;
        $('#pLeftLine').hidden = !old; $('#pPaidLine').hidden = old;
        $('#pLeft').max = total;
        if (old && $('#pStart').value === t && !$('#pStart').dataset.touched) $('#pStart').value = addDays(t, -7);
        $('#pConvLine').hidden = old || !sg.length;
        $('#pConvText').textContent = `Засчитать в абонемент разовые с ${fmt(s)}: ${sg.length}`;
        const st0 = $('#pStart').value || t;
        $('#pSum').innerHTML = old
          ? `Действует <b>с ${fmt(st0)} по ${fmt(addDays(st0, p.weeks * 7 - 1))}</b>, осталось <b>${zan(Number($('#pLeft').value) || 0)}</b>. Деньги за него уже получены раньше, в выручку месяца он не попадёт.`
          : `<b>${zan(total)}</b>, действует <b>с ${fmt(st0)} по ${fmt(addDays(st0, p.weeks * 7 - 1))}</b>.${$('#pPaid').checked ? '' : ' Будет в списке «Не оплачено», пока не отметите оплату.'}`;
      };
      $('#pPlans').addEventListener('click', e => { const b = e.target.closest('.plan'); if (!b) return; planId = b.dataset.id; $('#pPlans').querySelectorAll('.plan').forEach(x => x.setAttribute('aria-pressed', x === b)); upd(); });
      // остаток подставляем только при включении переноса и смене абонемента, а не пока человек печатает
      const resetLeft = () => { const p = plans.find(x => x.id === planId); $('#pLeft').value = p.perWeek * p.weeks; };
      $('#pPlans').addEventListener('click', () => { if ($('#pOld').checked) resetLeft(); upd(); });
      $('#pStart').addEventListener('change', () => { $('#pStart').dataset.touched = '1'; upd(); }); $('#pPaid').addEventListener('change', upd);
      $('#pOld').addEventListener('change', () => { if ($('#pOld').checked && !$('#pLeft').value) resetLeft(); upd(); }); $('#pLeft').addEventListener('input', upd); upd();
      $('#pForm').addEventListener('submit', e => {
        e.preventDefault();
        const p = plans.find(x => x.id === planId), old = $('#pOld').checked, paid = old || $('#pPaid').checked, s = $('#pStart').value || t, total = p.perWeek * p.weeks;
        const left = Number($('#pLeft').value) || 0;
        if (old && !(left >= 1 && left <= total)) { toast(`Сколько осталось: от 1 до ${total}`); $('#pLeft').focus(); return; }
        const pass = { id: uid(), studentId: sid, perWeek: p.perWeek, weeks: p.weeks, total, price: Number($('#pPrice').value) || 0, paid, paidAt: paid && !old ? t : null, start: s, freezes: [] };
        if (old) { pass.carried = total - left; pass.imported = true; }
        db.passes.push(pass);
        if (!old && !$('#pConvLine').hidden && $('#pConv').checked) singlesFrom(s).slice(0, pass.total).forEach(v => { v.kind = 'pass'; v.passId = pass.id; delete v.price; delete v.paid; });
        save(); toast(old ? 'Абонемент перенесён' : paid ? 'Абонемент оформлен' : 'Абонемент оформлен, ждёт оплаты'); render(); studentPage(sid);
      });
    },
  });
}

function freezeForm(passId) {
  const p = db.passes.find(x => x.id === passId), t = today();
  ui.page(`<form class="form" id="fzForm">
      <p class="hint">Срок абонемента сдвинется на эти дни, занятия не сгорят.</p>
      <label class="f">Причина<select id="fzReason">${Object.entries(REASONS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <div class="grid2"><label class="f">С<input type="date" id="fzFrom" value="${t}"></label><label class="f">По<input type="date" id="fzTo" value="${addDays(t, 6)}"></label></div>
      <div class="summary" id="fzSum"></div>
      <button class="btn primary" type="submit">Заморозить</button>
    </form>`, {
    title: 'Заморозка',
    onMount: el => {
      const $ = q => el.querySelector(q);
      const upd = () => { const a = $('#fzFrom').value, b = $('#fzTo').value; if (!a || !b || b < a) { $('#fzSum').textContent = 'Дата «по» должна быть не раньше даты «с».'; return; } const n = diff(a, b) + 1; $('#fzSum').innerHTML = `${n} ${plural(n, 'день', 'дня', 'дней')}. Абонемент будет действовать до <b>${fmt(addDays(C.passEnd(p), n))}</b>.`; };
      $('#fzFrom').addEventListener('change', upd); $('#fzTo').addEventListener('change', upd); upd();
      $('#fzForm').addEventListener('submit', e => {
        e.preventDefault(); const a = $('#fzFrom').value, b = $('#fzTo').value; if (!a || !b || b < a) return;
        p.freezes.push({ id: uid(), from: a, to: b, reason: $('#fzReason').value });
        save(); toast('Абонемент заморожен'); render(); studentPage(p.studentId);
      });
    },
  });
}

function remindPage(sid) {
  const s = C.studentById(sid), p = C.currentPass(sid), st = p ? C.passState(p) : null;
  const text = db.settings.template.replaceAll('{имя}', callName(s)).replaceAll('{осталось}', st ? zan(st.left) : '').replaceAll('{до}', st ? fmt(st.end) : '').replaceAll('{ссылка}', studentLink(s));
  ui.page(`<p class="hint">Для ${esc(s.name)}. Текст можно поправить.</p>
    <label class="f">Сообщение<textarea id="rText" rows="6">${esc(text)}</textarea></label>
    <div class="f">Куда отправить</div>
    <button class="btn primary block" data-act="r-app">В приложение</button>
    <p class="hint">Появится вверху её страницы в Ballet Forever.</p>
    ${navigator.share ? '<button class="btn block" data-act="r-max">В Макс…</button>' : ''}
    <button class="btn block" data-act="r-copy">Скопировать текст</button>
    <p class="hint">Если у ученицы нет приложения, отправьте в Макс: откроется список приложений, выберите Макс и её чат.</p>`, {
    title: 'Напоминание',
    onAction: e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const t = document.getElementById('rText').value.trim(); if (!t) { toast('Текст пустой'); return; }
      if (a.dataset.act === 'r-app') { Store.sendTo(sid, t).then(() => toast('Отправлено в приложение')).catch(err => toast(err.message)); a.disabled = true; a.textContent = 'Отправлено в приложение'; }
      if (a.dataset.act === 'r-max') navigator.share({ text: t }).catch(() => {});
      if (a.dataset.act === 'r-copy') ui.copy(t, 'Текст скопирован');
    },
  });
}

const when = iso => { const d = new Date(iso); const day = BF.iso(d); return `${day === today() ? 'сегодня' : day === addDays(today(), -1) ? 'вчера' : fmt(day)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
function chatPage(sid) {
  const s = C.studentById(sid); let list = [];
  const draw = body => {
    const keep = body.querySelector('#cText')?.value || '';
    body.innerHTML = `<div class="thread">${list.length ? list.map(m => `<div class="bubble ${m.fromTeacher ? 'me' : ''}"><p>${esc(m.text)}</p><span>${when(m.at)}${m.fromTeacher && m.read ? ' · прочитано' : ''}</span></div>`).join('') : '<p class="empty">Сообщений пока нет.</p>'}</div>
      <label class="f">Сообщение<textarea id="cText" rows="3" maxlength="1000" placeholder="Например: ${esc(callName(s))}, напоминаю про оплату"></textarea></label>
      <button class="btn primary block" data-act="c-send">Отправить в приложение</button>
      ${navigator.share ? '<button class="btn block" data-act="c-max">Отправить в Макс…</button>' : ''}
      <p class="hint">Если у ученицы нет приложения, отправьте в Макс.</p>`;
    body.querySelector('#cText').value = keep;
    const th = body.querySelector('.thread'); th.scrollTop = th.scrollHeight;
  };
  const load = async body => { try { list = await Store.thread(sid); inbox.unread = (inbox.unread || []).filter(m => m.studentId !== sid); render(); } catch (e) { toast(e.message); } draw(body); };
  ui.page('<p class="empty">Загружаю…</p>', {
    title: esc(s.name), onMount: load,
    onAction: async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const body = document.querySelector('#page .page-body'), t = body.querySelector('#cText').value.trim();
      if (!t) { toast('Напишите текст'); return; }
      if (a.dataset.act === 'c-max') navigator.share({ text: t }).catch(() => {});
      if (a.dataset.act === 'c-send') { a.disabled = true; try { await Store.sendTo(sid, t); body.querySelector('#cText').value = ''; await load(body); } catch (err) { toast(err.message); a.disabled = false; } }
    },
  });
}

let shareText = '';
function sharePage(title, hint, text) {
  shareText = text;
  ui.page(`<p class="hint">${hint}</p><div class="msg">${esc(text)}</div>
    ${navigator.share ? '<button class="btn primary block" data-act="share">Отправить в Макс…</button>' : ''}
    <button class="btn block ${navigator.share ? '' : 'primary'}" data-act="copy-text">Скопировать</button>
    <p class="hint">«Отправить в Макс…» открывает список приложений: выберите Макс и нужный чат.</p>`, { title, onAction: e => onAction(e) });
}

function classForm(id) {
  const c = id ? C.classById(id) : { dow: 1, title: 'Балет', start: '19:00', end: '20:30' };
  ui.page(`<form class="form" id="cForm">
      <label class="f">Название<input type="text" id="cTitle" value="${esc(c.title)}" required></label>
      <label class="f">День недели<select id="cDow">${[1, 2, 3, 4, 5, 6, 0].map(d => `<option value="${d}" ${d === c.dow ? 'selected' : ''}>${DOW_FULL[d]}</option>`).join('')}</select></label>
      <div class="grid2"><label class="f">Начало<input type="time" id="cStart" value="${c.start}"></label><label class="f">Конец<input type="time" id="cEnd" value="${c.end}"></label></div>
      <button class="btn primary" type="submit">Сохранить</button>
      ${id ? `<button class="btn ghost danger" type="button" data-act="delete-class" data-id="${id}">Удалить из расписания</button>` : ''}
    </form>`, {
    title: id ? 'Занятие' : 'Новое занятие', onAction: e => onAction(e),
    onMount: el => el.querySelector('#cForm').addEventListener('submit', e => {
      e.preventDefault();
      const data = { title: el.querySelector('#cTitle').value.trim() || 'Занятие', dow: Number(el.querySelector('#cDow').value), start: el.querySelector('#cStart').value, end: el.querySelector('#cEnd').value };
      if (id) Object.assign(C.classById(id), data); else db.schedule.push({ id: uid(), ...data });
      save(); render(); toast('Расписание сохранено'); schedulePage();
    }),
  });
}

function exportFile() {
  const name = `ballet-forever-${today()}.json`, blob = new Blob([JSON.stringify(db)], { type: 'application/json' });
  const file = typeof File === 'function' ? new File([blob], name, { type: 'application/json' }) : null;
  const done = () => { db.settings.lastBackup = today(); save(); render(); };
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: 'Копия Ballet Forever' }).then(done).catch(() => {}); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); done(); toast('Файл копии сохранён');
}

/* ---------- нажатия ---------- */
async function onAction(e, redraw) {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act, id = el.dataset.id;
  switch (act) {
    case 'tab-week': setTab('week'); break;
    case 'go-inbox': setTab('inbox'); break;
    case 'week': selDate = addDays(selDate, Number(el.dataset.d)); render(); break;
    case 'day': selDate = el.dataset.d; render(); break;
    case 'mark': markPage(el.dataset.date, el.dataset.class); break;
    case 'open-student': studentPage(id); break;
    case 'new-student': studentForm(null); break;
    case 'edit-student': studentForm(id); break;
    case 'pay': payForm(id); break;
    case 'student-menu': studentMenu(id); break;
    case 'chat': chatPage(id); break;
    case 'merge': mergePage(id); break;
    case 'merge-into': { const from = el.dataset.from, a = C.studentById(from), b = C.studentById(id);
      confirmPage('Объединить?', `Всё из карточки «${a.name}» перейдёт в «${b.name}», карточка «${a.name}» удалится.`, 'Объединить', () => { mergeStudents(from, id); render(); toast('Объединено'); studentPage(id); }); break; }
    case 'mark-paid': {
      if (el.dataset.kind === 'pass') { const p = db.passes.find(x => x.id === id); p.paid = true; p.paidAt = today(); }
      else { const v = db.visits.find(x => x.id === id); v.paid = true; v.paidAt = today(); }
      save(); render(); redraw && redraw(); toast('Отмечено как оплачено'); break;
    }
    case 'cancel-class': cancelPage(el.dataset.date, el.dataset.class); break;
    case 'restore-class': { const c = C.cancelOf(el.dataset.date, el.dataset.class);
      confirmPage('Вернуть занятие?', `Занятие снова будет в расписании.${c.extended?.length ? ' Продление абонементов из-за этой отмены уберётся.' : ''}`, 'Вернуть', () => {
        db.passes.forEach(p => { if (p.extensions) p.extensions = p.extensions.filter(x => x.cancelId !== c.id); });
        db.cancels = db.cancels.filter(x => x !== c); save(); render(); toast('Занятие возвращено'); }); break; }
    case 'message': messagePage(el.dataset.date, el.dataset.class); break;
    case 'schedule': schedulePage(); break;
    case 'freeze': freezeForm(id); break;
    case 'del-freeze': { const p = db.passes.find(x => x.id === el.dataset.pass); p.freezes = p.freezes.filter(f => f.id !== id); save(); render(); redraw && redraw(); break; }
    case 'day-toggle': {
      const sid = el.dataset.sid; if (!sid) break;
      const cur = new Set(inbox.days[sid] || []); cur.has(id) ? cur.delete(id) : cur.add(id);
      const list = [...cur]; inbox.days[sid] = list; redraw && redraw(); render();
      Store.setDaysFor(sid, list).catch(err => toast(err.message)); break;
    }
    case 'send-link': { const s = C.studentById(id); sharePage('Ссылка для ученицы', `Личная ссылка ${esc(s.name)}. По ней видно только её абонемент.`, `${callName(s)}, это твоё приложение Ballet Forever: остаток занятий, твои дни, оплата и пропуски.\n${studentLink(s)}\nОткрой ссылку и добавь страницу на главный экран телефона.`); break; }
    case 'remind': remindPage(id); break;
    case 'invite': sharePage('Пригласить учениц', 'Отправьте это сообщение в общую группу в Максе. Каждая откроет ссылку, напишет имя, и заявка придёт вам в «Заявки».', `Девочки, у нас теперь своё приложение Ballet Forever: видно, сколько занятий осталось в абонементе, можно отметить свои дни, сообщить об оплате или пропуске.\nОткройте ссылку и напишите имя и фамилию:\n${inviteLink()}`); break;
    case 'new-invite': confirmPage('Сделать новую ссылку?', 'Старая ссылка-приглашение перестанет работать. Личные ссылки учениц не изменятся.', 'Сделать', async () => { try { await Store.newInvite(); render(); toast('Новая ссылка готова'); } catch (err) { toast(err.message); } }); break;
    case 'copy-text': ui.copy(shareText, 'Текст скопирован'); break;
    case 'share': navigator.share({ text: shareText }).catch(() => {}); break;
    case 'approve': case 'reject': el.disabled = true; decide(id, act === 'approve'); break;
    case 'photo': {
      const slot = document.getElementById('ph-' + id); slot.innerHTML = '<p class="hint">Загружаю…</p>';
      try { const src = await Store.photo(id); slot.innerHTML = src ? `<img class="doc" src="${src}" alt="Фото документа">` : '<p class="hint">Фото уже удалено.</p>'; } catch (err) { slot.innerHTML = `<p class="hint">${esc(err.message)}</p>`; }
      break;
    }
    case 'refresh': await refreshInbox(true); break;
    case 'delete-student': { const s = C.studentById(id); confirmPage('Удалить ученицу?', `${s.name}: её абонементы и посещения удалятся.`, 'Удалить', () => {
      db.students = db.students.filter(x => x.id !== id); db.passes = db.passes.filter(p => p.studentId !== id); db.visits = db.visits.filter(v => v.studentId !== id); save(); render(); toast('Удалено'); }); break; }
    case 'delete-pass': { const p = db.passes.find(x => x.id === id); confirmPage('Удалить абонемент?', `Абонемент с ${fmt(p.start)} на ${zan(p.total)}, ${rub(p.price)}. Посещения по нему станут разовыми.`, 'Удалить', () => {
      db.visits.forEach(v => { if (v.passId === id) { v.kind = 'single'; v.price = db.settings.priceSingle; v.paid = false; delete v.passId; } }); db.passes = db.passes.filter(x => x.id !== id); save(); render(); studentPage(p.studentId); }); break; }
    case 'month': moneyMonth = el.dataset.m; render(); break;
    case 'plan-add': db.settings.plans = [...readPlans(), { id: uid(), perWeek: 1, weeks: 4, price: 4 * db.settings.pricePerLesson }]; render(); break;
    case 'plan-del': { const ps = readPlans(); if (ps.length <= 1) { toast('Нужен хотя бы один вариант'); break; } ps.splice(Number(el.dataset.i), 1); db.settings.plans = ps; render(); break; }
    case 'save-settings': {
      const n = (q, d) => { const v = Number(document.getElementById(q).value); return Number.isFinite(v) && v >= 0 ? v : d; };
      Object.assign(db.settings, { plans: readPlans(), priceSingle: n('stSingle', 1000), payInfo: document.getElementById('stPay').value.trim(), soonLessons: n('stSoonL', 2), soonDays: n('stSoonD', 5), template: document.getElementById('stTpl').value.trim() || BF.DEFAULT_TEMPLATE });
      save(); toast('Настройки сохранены'); break;
    }
    case 'edit-class': classForm(id); break;
    case 'delete-class': confirmPage('Удалить занятие из расписания?', 'Прошлые отметки посещений сохранятся.', 'Удалить', () => { db.schedule = db.schedule.filter(c => c.id !== id); save(); render(); schedulePage(); }); break;
    case 'export': exportFile(); break;
    case 'copy-backup': ui.copy(JSON.stringify(db), 'Копия скопирована, вставьте её в «Избранное»'); break;
    case 'clear-examples': confirmPage('Убрать примеры?', 'Выдуманные ученицы, их абонементы и посещения удалятся. Расписание и цены останутся.', 'Убрать', () => {
      const ex = new Set(db.students.filter(s => s.example).map(s => s.id));
      db.students = db.students.filter(s => !ex.has(s.id)); db.passes = db.passes.filter(p => !ex.has(p.studentId)); db.visits = db.visits.filter(v => !ex.has(v.studentId));
      inbox.requests = inbox.requests.filter(r => r.kind === 'join' || !ex.has(r.studentId)); save(); render(); toast('Примеры убраны'); }); break;
    case 'reset-demo': confirmPage('Вернуть примеры?', 'Всё, что вы внесли в демо, сотрётся, и появятся выдуманные ученицы и заявки.', 'Вернуть', () => { Store.resetDemo(); location.reload(); }); break;
    case 'wipe': confirmPage('Стереть всё?', 'Удалятся ученицы, оплаты, посещения и настройки. Отменить нельзя.', 'Стереть', () => { setDb(BF.defaults()); save(); setTab('week'); }); break;
    case 'logout': Store.signOut().then(() => location.reload()); break;
  }
}
app.addEventListener('click', e => onAction(e));

async function refreshInbox(loud) {
  try { inbox = await Store.inbox(); if (!document.getElementById('page') && tab !== 'music') render(); if (loud) toast(inbox.requests.length ? `Новых заявок: ${inbox.requests.length}` : 'Новых заявок нет'); }
  catch (e) { if (loud) toast(e.message); }
}
setInterval(() => { if (document.visibilityState === 'visible' && db) refreshInbox(false); }, 60000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && db) refreshInbox(false); });

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
    <p class="hint">Ученицам вход не нужен: у каждой своя ссылка.</p>
  </div>`;
  const err = document.getElementById('lErr');
  const go = async signup => {
    err.hidden = true;
    const email = document.getElementById('lEmail').value.trim(), pass = document.getElementById('lPass').value;
    if (!email || pass.length < 6) { err.textContent = 'Введите почту и пароль не короче 6 символов'; err.hidden = false; return; }
    try { signup ? await Store.signUp(email, pass) : await Store.signIn(email, pass); boot(); } catch (e) { err.textContent = e.message; err.hidden = false; }
  };
  document.getElementById('loginForm').addEventListener('submit', e => { e.preventDefault(); go(false); });
  document.getElementById('lSignup').addEventListener('click', () => go(true));
}

async function boot() {
  BF.loadBallerina(BASE);
  try {
    const user = await Store.user();
    if (!user) { renderLogin(); return; }
    document.body.classList.remove('logged-out');
    setDb(await Store.load({ sample, replaced: d => { setDb(d); render(); } }));
    if (!C.classesFor(selDate).length) { const [u] = C.upcoming(1); if (u) selDate = u.date; }
    let changed = false; db.students.forEach(s => { if (!s.token) { s.token = token(); changed = true; } }); if (changed) save();
    try { inbox = await Store.inbox(); } catch (e) { toast(e.message); }
    render();
  } catch (e) {
    app.innerHTML = `<div class="screen"><div class="banner"><span>${esc(e.message)}</span><button class="btn small" onclick="location.reload()">Обновить</button></div></div>`;
  }
}
boot();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
