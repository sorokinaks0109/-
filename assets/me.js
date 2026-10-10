// Приложение ученицы: остаток занятий, постоянные дни, «не приду / приду», оплата и пропуски по уважительной причине.
(() => {
'use strict';
const BF = window.BF, Store = BF.Store, ui = BF.ui;
const { today, addDays, diff, parse, fmt, fmtDow, plural, zan, raz, rub, esc, firstName, DOW, REASONS, METHODS } = BF;
const root = document.getElementById('me');
const BASE = new URL('../', location.href).href;
const KEY = 'ballet-forever-me';
const toast = ui.toast;

const params = new URLSearchParams(location.search);
let tok = params.get('t');
const joinCode = params.get('join');
try { if (tok) localStorage.setItem(KEY, tok); else tok = localStorage.getItem(KEY); } catch (e) {}
let card = null, C = null;

let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; const b = document.getElementById('installBtn'); if (b) b.hidden = false; });
const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isYandex = /YaBrowser/i.test(navigator.userAgent);

const hero = (title, sub) => `<section class="me-hero"><div><h1>${esc(title)}</h1><p>${sub}</p></div><div class="ballerina" data-ballerina>${BF.ballerina}</div></section>`;

/* ---------- вступление по общей ссылке ---------- */
function renderJoin() {
  root.innerHTML = `${hero('Ballet Forever', 'запись в группу')}
    <form class="form" id="joinForm">
      <p>Напишите имя и фамилию. Преподаватель подтвердит заявку, и здесь появится ваш абонемент и расписание.</p>
      <label class="f">Имя и фамилия, например: Ксения Сорокина<input type="text" id="jName" autocomplete="name" required minlength="2" maxlength="60"></label>
      <p class="err" id="jErr" hidden></p>
      <button class="btn primary" type="submit">Отправить заявку</button>
    </form>`;
  document.getElementById('joinForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button'), err = document.getElementById('jErr');
    btn.disabled = true; err.hidden = true;
    try {
      tok = await Store.join(joinCode, document.getElementById('jName').value);
      try { localStorage.setItem(KEY, tok); } catch (_) {}
      history.replaceState(null, '', location.pathname + '?t=' + tok);
      show();
    } catch (x) { err.textContent = x.message; err.hidden = false; btn.disabled = false; }
  });
}

/* ---------- главная ученицы ---------- */
async function show(quiet) {
  BF.loadBallerina(BASE);
  if (!tok && joinCode) return renderJoin();
  if (!tok) {
    root.innerHTML = `${hero('Ballet Forever', 'приложение ученицы')}<p>Откройте ссылку, которую прислал преподаватель.</p>`;
    return;
  }
  if (!quiet && !card) root.innerHTML = '<p class="empty">Загружаю…</p>';
  try {
    card = await Store.card(tok);
    if (!card) {
      if (joinCode) return renderJoin();
      root.innerHTML = `${hero('Ballet Forever', 'приложение ученицы')}<p>Ссылка устарела. Попросите у преподавателя новую.</p>`;
      return;
    }
    try { localStorage.setItem(KEY + '-card', JSON.stringify(card)); } catch (_) {}
  } catch (e) {
    let cached = null; try { cached = JSON.parse(localStorage.getItem(KEY + '-card')); } catch (_) {}
    if (!cached) { root.innerHTML = `<div class="banner"><span>${esc(e.message)}</span></div>`; return; }
    card = cached; toast('Нет интернета, показаны сохранённые данные');
  }
  if (card.pending) {
    root.innerHTML = `${hero(card.name, 'заявка отправлена')}
      <p>Преподаватель скоро подтвердит заявку. После этого здесь появятся абонемент, расписание и кнопки оплаты.</p>
      <button class="btn" data-act="reload">Проверить</button>${installBlock()}`;
    return;
  }
  draw();
}

function draw() {
  const db = { settings: card.settings, schedule: card.schedule || [], students: [card.student], passes: card.passes || [], visits: card.visits || [], cancels: card.cancels || [] };
  C = BF.calc(db);
  const s = card.student, t = today();
  const p = C.currentPass(s.id), st = p ? C.passState(p) : null;
  const visits = [...db.visits].sort((a, b) => a.date < b.date ? 1 : -1);
  const days = card.days || [];
  const intents = card.intents || [];
  const up = C.upcoming(8);
  const pending = (card.requests || []).filter(r => r.status === 'new');
  const decided = (card.requests || []).filter(r => r.status !== 'new').slice(0, 3);
  const meter = p && p.total <= 24 ? `<div class="meter" aria-hidden="true">${Array.from({ length: p.total }, (_, i) => `<i class="${i < st.left && (C.isLive(st) || st.key === 'future') ? 'on' : ''}"></i>`).join('')}</div>` : '';

  let note = '';
  if (st && st.key === 'soon') note = `<div class="note">Абонемент скоро закончится: ${st.left <= db.settings.soonLessons ? `осталось ${zan(st.left)}` : `срок до ${fmt(st.end)}`}.</div>`;
  if (st && st.key === 'used') note = '<div class="note bad">Занятия в абонементе закончились.</div>';
  if (st && st.key === 'expired') note = `<div class="note bad">Срок абонемента вышел ${fmt(st.end)}. Неиспользованные занятия сгорели: ${st.burned}.</div>`;
  if (st && st.key === 'frozen') { const f = p.freezes.find(f => t >= f.from && t <= f.to); note = `<div class="note">Абонемент заморожен до ${fmt(f.to)}, срок продлён на эти дни.</div>`; }

  const reqText = r => r.kind === 'payment' && r.payload.existing ? `Перенос абонемента: ${raz(r.payload.perWeek)} в неделю, осталось ${zan(Number(r.payload.left) || 0)}` : r.kind === 'payment' ? `Оплата: ${raz(r.payload.perWeek)} в неделю, ${rub(r.payload.price)}, ${METHODS[r.payload.method] || ''}` : `Пропуск: ${REASONS[r.payload.reason] || ''}, ${fmt(r.payload.from)} – ${fmt(r.payload.to)}`;

  root.innerHTML = `
  ${hero(s.name, 'Ballet Forever · мой абонемент')}
  ${p ? `<section class="card ticket">
    <div class="eyebrow">${st.key === 'future' ? `Абонемент с ${fmt(p.start)}` : 'Осталось занятий'}</div>
    <div class="big"><b>${st.key === 'expired' ? 0 : st.left}</b><span>из ${p.total}</span></div>
    ${meter}
    <div class="facts">
      <div><span class="eyebrow">Действует до</span><b>${fmt(st.end)}</b></div>
      <div><span class="eyebrow">${C.isLive(st) ? 'Дней осталось' : 'Статус'}</span><b>${C.isLive(st) ? st.daysLeft + 1 : esc(st.label)}</b></div>
    </div>
  </section>` : `<section class="card ticket"><div class="eyebrow">Абонемента нет</div><p style="margin:0">Сейчас вы ходите разово, ${rub(db.settings.priceSingle)} за занятие.</p></section>`}
  ${note}
  ${p && p.paid === false && !pending.some(r => r.kind === 'payment' && r.payload.passId === p.id) ? `<div class="note">Абонемент ещё не оплачен: ${rub(p.price)}. <button class="btn small" data-act="pay-owed">Я оплатила</button></div>` : ''}
  ${(card.messages || []).length ? `<section class="msgs"><div class="eyebrow">Сообщения от преподавателя</div>${card.messages.slice(0, 3).map(m => `<div class="msg-item"><span class="hint">${fmt(m.date)}</span><p>${esc(m.text)}</p></div>`).join('')}</section>` : ''}
  ${pending.map(r => `<div class="note"><b>На проверке у преподавателя.</b> ${esc(reqText(r))}. <button class="btn small ghost" data-act="cancel-req" data-id="${r.id}">Отменить</button></div>`).join('')}
  ${decided.filter(r => diff(String(r.createdAt).slice(0, 10), t) <= 7).map(r => `<div class="note ${r.status === 'approved' ? 'ok' : 'bad'}">${r.status === 'approved' ? 'Подтверждено' : 'Отклонено'}: ${esc(reqText(r))}.</div>`).join('')}
  <div class="actions">
    <button class="btn primary" data-act="pay">${p && (C.isLive(st) || st.key === 'future') ? 'Продлить абонемент' : 'Купить абонемент'}</button>
    ${!p || !(C.isLive(st) || st.key === 'future') ? '<button class="btn" data-act="pay-existing">У меня уже есть абонемент</button>' : ''}
    <button class="btn" data-act="freeze">Пропущу по уважительной причине</button>
  </div>
  <section><div class="sec-title"><h2>Ближайшие занятия</h2></div>
    <div class="list">${up.map(u => {
      const off = C.cancelOf(u.date, u.cls.id);
      if (off) return `<div class="row up off"><div class="day">${DOW[parse(u.date).getDay()]}</div><div class="main"><div class="name">${esc(u.cls.title)}</div><div class="sub num">${fmt(u.date)} · отменено${off.reason ? `: ${esc(off.reason)}` : ''}</div></div><span class="pill bad">Отменено</span></div>`;
      const it = intents.find(i => i.date === u.date && i.classId === u.cls.id);
      const regular = days.includes(u.cls.id);
      const going = (regular && !(it && it.kind === 'skip')) || (it && it.kind === 'extra');
      const label = going ? 'Иду' : 'Не иду';
      return `<div class="row up"><div class="day">${DOW[parse(u.date).getDay()]}</div>
        <div class="main"><div class="name">${esc(u.cls.title)}</div><div class="sub num">${fmt(u.date)}, ${u.cls.start}–${u.cls.end}</div></div>
        <button class="toggle ${going ? 'on' : ''}" data-act="intent" data-date="${u.date}" data-class="${u.cls.id}" aria-pressed="${going}">${label}</button></div>`;
    }).join('')}</div>
    <p class="hint" style="margin-top:8px">Нажмите, чтобы поменять «Иду» на «Не иду» и обратно. Преподаватель видит, кто придёт.</p>
  </section>
  <section><div class="sec-title"><h2>Мои постоянные дни</h2></div>
    <div class="chips">${C.sortedSchedule().map(c => `<button class="chip" data-act="day" data-id="${c.id}" aria-pressed="${days.includes(c.id)}">${DOW[c.dow]} · ${esc(c.title)} · ${c.start}</button>`).join('')}</div>
    <p class="hint" style="margin-top:8px">Отметьте дни, когда обычно ходите. На них вы будете записаны автоматически.</p>
  </section>
  <section><div class="sec-title"><h2>Мои занятия</h2><span class="num">${visits.length || ''}</span></div>
    <div class="list">${visits.length ? visits.slice(0, 30).map(v => `<div class="row" style="min-height:48px"><div class="main"><div class="num">${fmtDow(v.date)}</div><div class="sub">${esc(C.classById(v.classId)?.title || 'занятие')}</div></div><span class="pill ${v.kind === 'single' ? 'mute' : 'ok'}">${v.kind === 'single' ? 'разово' : 'абонемент'}</span></div>`).join('') : '<div class="empty">Пока нет отмеченных занятий.</div>'}</div></section>
  ${installBlock()}
  <p class="footer-mark">Ballet Forever</p>`;
}

function installBlock() {
  if (standalone) return '';
  const how = isIOS ? 'В Safari нажмите «Поделиться» внизу экрана, затем «На экран Домой».'
    : isYandex ? 'В Яндекс Браузере нажмите на три точки рядом с адресной строкой и выберите «Добавить ярлык» или «Установить приложение».'
    : 'В меню браузера (три точки) выберите «Добавить на главный экран» или «Установить приложение».';
  return `<section class="card" style="padding:14px;display:flex;flex-direction:column;gap:10px">
    <div class="eyebrow">Поставить на телефон</div><p class="hint">${how}</p>
    <button class="btn primary" id="installBtn" data-act="install" ${installEvt ? '' : 'hidden'}>Установить</button></section>`;
}

/* ---------- оплата ---------- */
function payPage(mode = 'new') {
  const plans = card.settings.plans || [], t = today();
  const prev = C.studentPasses(card.student.id)[0], prevSt = prev ? C.passState(prev) : null;
  let planId = (prev && plans.find(p => p.perWeek === prev.perWeek && p.weeks === prev.weeks)?.id) || plans[1]?.id || plans[0]?.id;
  let method = 'transfer';
  const days = new Set(card.days || []);
  const startNew = prev && prevSt && C.isLive(prevSt) ? addDays(prevSt.end, 1) : t;
  const draw = el => {
    const plan = plans.find(x => x.id === planId), total = plan ? plan.perWeek * plan.weeks : 0;
    const keep = id => el.querySelector(id)?.value;
    const startV = keep('#pStart') || (mode === 'new' ? startNew : addDays(t, -7)), leftV = keep('#pLeft') || total;
    el.innerHTML = `<div class="form">
      <div class="seg"><button type="button" data-act="mode" data-k="new" aria-pressed="${mode === 'new'}">Новый абонемент</button><button type="button" data-act="mode" data-k="existing" aria-pressed="${mode === 'existing'}">Уже есть</button></div>
      <p>${mode === 'new' ? 'Выберите абонемент, дату начала и как оплатили. Преподаватель проверит оплату и подтвердит.' : 'Если абонемент куплен раньше и записан в тетрадке, перенесите его сюда: преподаватель сверит и подтвердит.'}</p>
      <div class="plan-cards">${plans.map(p => `<button type="button" class="plan" data-act="plan" data-id="${p.id}" aria-pressed="${p.id === planId}"><b>${BF.planTitle(p)}</b><span>${BF.planSub(p)}</span>${mode === 'new' ? `<em>${rub(p.price)}</em>` : ''}</button>`).join('')}</div>
      <div class="grid2">
        <label class="f">${mode === 'new' ? 'Начать с' : 'Действует с'}<input type="date" id="pStart" value="${startV}" min="${addDays(t, -60)}" max="${addDays(t, 60)}"></label>
        ${mode === 'existing' ? `<label class="f">Сколько занятий осталось<input type="number" inputmode="numeric" id="pLeft" min="1" max="${total}" value="${Math.min(Number(leftV) || total, total)}"></label>` : '<div></div>'}
      </div>
      <div class="f">Мои дни<div class="chips">${C.sortedSchedule().map(c => `<button type="button" class="chip" data-act="pday" data-id="${c.id}" aria-pressed="${days.has(c.id)}">${DOW[c.dow]} · ${esc(c.title)}</button>`).join('')}</div></div>
      ${mode === 'new' ? `<div class="f">Как оплатили<div class="seg"><button type="button" data-act="method" data-k="transfer" aria-pressed="${method === 'transfer'}">Переводом</button><button type="button" data-act="method" data-k="cash" aria-pressed="${method === 'cash'}">Наличными</button></div></div>
        ${method === 'transfer' ? (card.settings.payInfo ? `<div class="msg">${esc(card.settings.payInfo)}</div><button class="btn small" type="button" data-act="copy-pay">Скопировать реквизиты</button>` : '<p class="hint">Реквизиты для перевода уточните у преподавателя.</p>') : '<p class="hint">Передайте деньги на ближайшем занятии.</p>'}` : ''}
      <button class="btn primary" data-act="send-pay">Отправить преподавателю</button>
    </div>`;
  };
  ui.page('', {
    title: 'Абонемент', onMount: draw,
    onAction: async e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const el = document.querySelector('#page .page-body');
      const act = a.dataset.act;
      if (act === 'mode') { mode = a.dataset.k; el.querySelector('#pStart').value = ''; draw(el); }
      if (act === 'plan') { planId = a.dataset.id; draw(el); }
      if (act === 'method') { method = a.dataset.k; draw(el); }
      if (act === 'pday') { days.has(a.dataset.id) ? days.delete(a.dataset.id) : days.add(a.dataset.id); draw(el); }
      if (act === 'copy-pay') ui.copy(card.settings.payInfo, 'Скопировано');
      if (act === 'send-pay') {
        const p = plans.find(x => x.id === planId); if (!p) return;
        const start = el.querySelector('#pStart').value || t, total = p.perWeek * p.weeks;
        const payload = { planId: p.id, perWeek: p.perWeek, weeks: p.weeks, price: p.price, start };
        if (mode === 'existing') {
          const left = Number(el.querySelector('#pLeft').value);
          if (!(left >= 1 && left <= total)) { toast(`Укажите, сколько осталось: от 1 до ${total}`); return; }
          if (start > t) { toast('Дата начала уже действующего абонемента не может быть в будущем'); return; }
          Object.assign(payload, { existing: true, left });
        } else payload.method = method;
        a.disabled = true;
        try {
          await Store.request(tok, 'payment', payload, null);
          const list = [...days]; if (list.join() !== (card.days || []).join()) { await Store.setDays(tok, list); card.days = list; }
          ui.closePage(); toast('Отправлено преподавателю'); show(true);
        } catch (x) { toast(x.message); a.disabled = false; }
      }
    },
  });
}

function payOwedPage() {
  const p = C.currentPass(card.student.id);
  let method = 'transfer';
  ui.page(`<div class="form">
      <p>Абонемент ${raz(p.perWeek)} в неделю с ${fmt(p.start)}: <b>${rub(p.price)}</b>.</p>
      <div class="f">Как оплатили<div class="seg" id="method"><button type="button" data-m="transfer" aria-pressed="true">Переводом</button><button type="button" data-m="cash" aria-pressed="false">Наличными</button></div></div>
      ${card.settings.payInfo ? `<div class="msg">${esc(card.settings.payInfo)}</div>` : ''}
      <button class="btn primary" data-act="send-owed">Отправить</button>
    </div>`, {
    title: 'Оплата абонемента',
    onMount: el => el.querySelector('#method').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; method = b.dataset.m; el.querySelectorAll('#method button').forEach(x => x.setAttribute('aria-pressed', x === b)); }),
    onAction: async e => {
      const a = e.target.closest('[data-act="send-owed"]'); if (!a) return;
      a.disabled = true;
      try { await Store.request(tok, 'payment', { passId: p.id, perWeek: p.perWeek, weeks: p.weeks, price: p.price, method }, null); ui.closePage(); toast('Отправлено преподавателю'); show(true); }
      catch (x) { toast(x.message); a.disabled = false; }
    },
  });
}

/* ---------- пропуск по уважительной причине ---------- */
function freezePage() {
  const t = today();
  let photo = null;
  ui.page(`<form class="form" id="fz">
      <p>Если пропускаете по болезни, из-за командировки или отпуска, абонемент продлится на эти дни. Преподаватель подтвердит.</p>
      <label class="f">Причина<select id="fzReason">${Object.entries(REASONS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
      <div class="grid2"><label class="f">С<input type="date" id="fzFrom" value="${t}" min="${addDays(t, -30)}"></label><label class="f">По<input type="date" id="fzTo" value="${addDays(t, 6)}"></label></div>
      <label class="f">Комментарий, если нужно<input type="text" id="fzNote" maxlength="200"></label>
      <div class="card" style="padding:14px;display:flex;flex-direction:column;gap:10px">
        <div class="eyebrow">Фото документа</div>
        <p class="hint">Больничный, справка, билеты. <b>Перед отправкой закройте ФИО, номер документа и диагноз</b>: в галерее телефона откройте фото → «Изменить» → «Рисовать» и закрасьте. Видно должно быть только даты.</p>
        <p class="hint">Фото увидит только преподаватель. Оно удалится сразу после решения, самое позднее через 14 дней.</p>
        <label class="btn" style="cursor:pointer">Выбрать фото<input type="file" id="fzPhoto" accept="image/*" hidden></label>
        <div id="fzPrev"></div>
        <label class="check-line" id="fzAgreeLine" hidden><input type="checkbox" id="fzAgree"> Я закрыла ФИО и диагноз</label>
      </div>
      <p class="err" id="fzErr" hidden></p>
      <button class="btn primary" type="submit">Отправить</button>
    </form>`, {
    title: 'Пропуск по уважительной причине',
    onMount: el => {
      const $ = q => el.querySelector(q);
      $('#fzPhoto').addEventListener('change', async e => {
        const f = e.target.files[0]; if (!f) return;
        $('#fzPrev').innerHTML = '<p class="hint">Обрабатываю фото…</p>';
        try { photo = await BF.shrinkPhoto(f); $('#fzPrev').innerHTML = `<img class="doc" src="${photo}" alt="Выбранное фото"><button class="btn small ghost danger" type="button" id="fzDrop">Убрать фото</button>`; $('#fzAgreeLine').hidden = false;
          $('#fzDrop').addEventListener('click', () => { photo = null; $('#fzPrev').innerHTML = ''; $('#fzAgreeLine').hidden = true; $('#fzPhoto').value = ''; }); }
        catch (x) { $('#fzPrev').innerHTML = `<p class="err">${esc(x.message)}</p>`; }
      });
      $('#fz').addEventListener('submit', async e => {
        e.preventDefault();
        const err = $('#fzErr'); err.hidden = true;
        const from = $('#fzFrom').value, to = $('#fzTo').value;
        if (!from || !to || to < from) { err.textContent = 'Дата «по» должна быть не раньше даты «с»'; err.hidden = false; return; }
        if (diff(from, to) > 60) { err.textContent = 'Слишком длинный период, обсудите его с преподавателем'; err.hidden = false; return; }
        if (photo && !$('#fzAgree').checked) { err.textContent = 'Подтвердите, что закрыли ФИО и диагноз на фото'; err.hidden = false; return; }
        const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true;
        try { await Store.request(tok, 'freeze', { from, to, reason: $('#fzReason').value, note: $('#fzNote').value.trim() }, photo); ui.closePage(); toast('Отправлено преподавателю'); show(true); }
        catch (x) { err.textContent = x.message; err.hidden = false; btn.disabled = false; }
      });
    },
  });
}

/* ---------- нажатия ---------- */
root.addEventListener('click', async e => {
  const a = e.target.closest('[data-act]'); if (!a) return;
  const act = a.dataset.act;
  try {
    if (act === 'reload') show();
    if (act === 'pay') payPage();
    if (act === 'pay-owed') payOwedPage();
    if (act === 'pay-existing') payPage('existing');
    if (act === 'freeze') freezePage();
    if (act === 'install' && installEvt) { installEvt.prompt(); await installEvt.userChoice; installEvt = null; a.hidden = true; }
    if (act === 'cancel-req') { await Store.cancelRequest(tok, a.dataset.id); toast('Заявка отменена'); show(true); }
    if (act === 'day') {
      const set = new Set(card.days || []); set.has(a.dataset.id) ? set.delete(a.dataset.id) : set.add(a.dataset.id);
      card.days = [...set]; draw();
      await Store.setDays(tok, card.days);
    }
    if (act === 'intent') {
      const { date, class: classId } = a.dataset;
      const regular = (card.days || []).includes(classId);
      const it = (card.intents || []).find(i => i.date === date && i.classId === classId);
      // постоянный день: иду ⇄ не приду; не постоянный: не записана ⇄ приду дополнительно
      const kind = it ? null : (regular ? 'skip' : 'extra');
      card.intents = (card.intents || []).filter(i => !(i.date === date && i.classId === classId));
      if (kind) card.intents.push({ date, classId, kind });
      draw();
      await Store.setIntent(tok, date, classId, kind);
      toast(kind === 'skip' || (!kind && !regular) ? 'Отмечено: не иду' : 'Отмечено: иду');
    }
  } catch (x) { toast(x.message); show(true); }
});

show();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && tok && !document.getElementById('page')) show(true); });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('../sw.js', { scope: '../' }).catch(() => {});
})();
