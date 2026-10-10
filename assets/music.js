// Музыка к занятиям: композиции хранятся в телефоне преподавателя (IndexedDB), планы занятий — в данных студии.
(() => {
'use strict';
const BF = window.BF, ui = BF.ui;
const { esc, uid, pad } = BF;
const toast = ui.toast;

/* ---------- хранилище файлов в телефоне ---------- */
const idb = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('ballet-forever-music', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('tracks', { keyPath: 'id' });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = async (mode, fn) => { const d = await open(); return new Promise((res, rej) => { const t = d.transaction('tracks', mode); const st = t.objectStore('tracks'); const out = fn(st); t.oncomplete = () => res(out && out.result !== undefined ? out.result : out); t.onerror = () => rej(t.error); }); };
  return {
    all: () => tx('readonly', st => st.getAll()),
    get: id => tx('readonly', st => st.get(id)),
    put: v => tx('readwrite', st => st.put(v)),
    del: id => tx('readwrite', st => st.delete(id)),
  };
})();

let tracks = []; // { id, name, duration, size } без самого файла
const loadTracks = async () => { try { tracks = (await idb.all()).map(({ blob, ...t }) => t).sort((a, b) => a.name.localeCompare(b.name, 'ru')); } catch (e) { tracks = []; } return tracks; };
const trackById = id => tracks.find(t => t.id === id);
const mmss = sec => { sec = Math.max(0, Math.round(sec || 0)); return `${Math.floor(sec / 60)}:${pad(sec % 60)}`; };
const parseMmss = v => { v = String(v || '').trim(); if (!v) return 0; const m = v.match(/^(\d+):(\d{1,2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : Math.max(0, Number(v.replace(',', '.')) || 0); };
const audioDuration = blob => new Promise(res => { const a = new Audio(); a.preload = 'metadata'; const u = URL.createObjectURL(blob); const done = d => { res(Number.isFinite(d) ? d : 0); URL.revokeObjectURL(u); }; a.onloadedmetadata = () => done(a.duration); a.onerror = () => done(0); setTimeout(() => done(0), 5000); a.src = u; });

/* ---------- пример плана ---------- */
const SAMPLE = () => ({
  id: uid(), name: 'Пример: экзерсис у станка', example: true,
  items: [
    ['Плие', 2, 'правая и левая сторона'], ['Батман тандю', 2, ''], ['Батман тандю жете', 2, ''], ['Ронд де жамб пар тер', 2, ''],
    ['Батман фондю', 2, ''], ['Батман фраппе', 2, ''], ['Адажио', 2, ''], ['Гран батман жете', 2, ''],
  ].map(([name, repeats, note]) => ({ id: uid(), name, trackId: '', repeats, start: 0, end: 0, gap: 5, note })),
});

/* ---------- раздел «Музыка» ---------- */
let host = null;
BF.music = {
  async render(el) {
    host = el;
    const db = BF.app.db();
    if (!Array.isArray(db.programs)) { db.programs = [SAMPLE()]; BF.app.save(); }
    el.innerHTML = '<p class="empty">Загружаю…</p>';
    await loadTracks();
    const totalMb = tracks.reduce((s, t) => s + (t.size || 0), 0) / 1048576;
    const progDur = p => p.items.reduce((s, it) => { const t = trackById(it.trackId); if (!t) return s; const len = (it.end || t.duration) - (it.start || 0); return s + Math.max(0, len) * (it.repeats || 1); }, 0);
    el.innerHTML = `<div class="screen">
      <p class="hint">Соберите план занятия из упражнений и музыки, а на занятии запускайте композиции по очереди. Композиции хранятся в этом телефоне: интернет для них не нужен.</p>
      <section><div class="sec-title"><h2>Планы занятий</h2><span class="num">${db.programs.length || ''}</span></div>
        <div class="day">${db.programs.map(p => `<article class="card cls">
          <div class="main"><h3>${esc(p.name)}</h3><div class="hint">${p.items.length} ${BF.plural(p.items.length, 'упражнение', 'упражнения', 'упражнений')}${progDur(p) ? ` · ${mmss(progDur(p))}` : ''}${p.items.some(it => !trackById(it.trackId)) ? ' · не у всех упражнений есть музыка' : ''}</div></div>
          <div class="btns"><button class="btn primary" style="flex:1" data-mact="play" data-id="${p.id}">Играть</button><button class="btn" style="flex:1" data-mact="edit" data-id="${p.id}">Изменить</button></div>
        </article>`).join('') || '<p class="empty">Планов пока нет.</p>'}</div>
        <button class="btn block" style="margin-top:10px" data-mact="new">Новый план занятия</button>
      </section>
      <section><div class="sec-title"><h2>Мои композиции</h2><span class="num">${tracks.length ? `${tracks.length} · ${totalMb.toFixed(0)} МБ` : ''}</span></div>
        <div class="list">${tracks.map(t => `<div class="row"><button class="iconbtn" data-mact="preview" data-id="${t.id}" aria-label="Послушать">▶</button><div class="main"><div class="name">${esc(t.name)}</div><div class="sub num">${mmss(t.duration)}</div></div><button class="btn small ghost" data-mact="rename" data-id="${t.id}">Название</button><button class="iconbtn" data-mact="del-track" data-id="${t.id}" aria-label="Удалить">×</button></div>`).join('') || '<div class="empty">Композиций пока нет. Скачайте mp3 в телефон и добавьте их сюда.</div>'}</div>
        <label class="btn primary block" style="margin-top:10px;cursor:pointer">Добавить композиции<input type="file" id="mFiles" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg" multiple hidden></label>
        <p class="hint" style="margin-top:8px">Выберите один или несколько файлов из «Загрузок». Музыка из Яндекс Музыки и ВК не подойдёт: нужны обычные файлы mp3.</p>
      </section>
    </div>`;
  },
};

// выбор файлов ловим на документе: экран раздела может перерисоваться, пока человек выбирает файлы
document.addEventListener('change', async e => {
  if (e.target.id !== 'mFiles') return;
  const files = [...e.target.files]; if (!files.length) return;
  toast(`Добавляю: ${files.length}`);
  let ok = 0;
  for (const f of files) {
    try { const duration = await audioDuration(f); await idb.put({ id: uid(), name: f.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim(), duration, size: f.size, blob: f, added: Date.now() }); ok++; }
    catch (err) { toast(`Не получилось добавить ${f.name}`); }
  }
  toast(ok ? `Добавлено: ${ok}` : 'Ничего не добавилось'); if (host) BF.music.render(host);
});

let previewAudio = null;
document.addEventListener('click', async e => {
  const a = e.target.closest('[data-mact]'); if (!a) return;
  const act = a.dataset.mact, id = a.dataset.id, db = BF.app.db();
  if (act === 'new') { const p = { id: uid(), name: 'Новое занятие', items: [] }; db.programs.push(p); BF.app.save(); editPage(p.id); }
  if (act === 'edit') editPage(id);
  if (act === 'play') playerPage(id);
  if (act === 'preview') {
    if (previewAudio) { previewAudio.pause(); URL.revokeObjectURL(previewAudio.src); const was = previewAudio.dataset.id; previewAudio = null; if (was === id) return; }
    const t = await idb.get(id); if (!t) return;
    previewAudio = new Audio(URL.createObjectURL(t.blob)); previewAudio.dataset.id = id; previewAudio.play().catch(() => {});
  }
  if (act === 'rename') {
    const t = trackById(id);
    ui.page(`<label class="f">Название<input type="text" id="tName" value="${esc(t.name)}" maxlength="80"></label><button class="btn primary block" data-act="ok">Сохранить</button>`, {
      title: 'Название композиции',
      onAction: async ev => { if (!ev.target.closest('[data-act="ok"]')) return; const full = await idb.get(id); full.name = document.getElementById('tName').value.trim() || full.name; await idb.put(full); ui.closePage(); BF.music.render(host); },
    });
  }
  if (act === 'del-track') {
    const t = trackById(id), used = db.programs.filter(p => p.items.some(it => it.trackId === id)).length;
    ui.page(`<p>Удалить «${esc(t.name)}» из телефона?${used ? ` Она стоит в планах: ${used}. В этих упражнениях музыка пропадёт.` : ''}</p><button class="btn primary block" data-act="ok">Удалить</button><button class="btn block" data-act="close">Отмена</button>`, {
      title: 'Удалить композицию',
      onAction: async ev => { if (!ev.target.closest('[data-act="ok"]')) return; await idb.del(id); ui.closePage(); BF.music.render(host); toast('Удалено'); },
    });
  }
});

/* ---------- конструктор плана ---------- */
function editPage(pid) {
  const db = BF.app.db(), p = db.programs.find(x => x.id === pid);
  const opts = sel => `<option value="">— выберите композицию —</option>${tracks.map(t => `<option value="${t.id}" ${t.id === sel ? 'selected' : ''}>${esc(t.name)} (${mmss(t.duration)})</option>`).join('')}`;
  const read = body => {
    p.name = body.querySelector('#pName').value.trim() || 'Занятие';
    body.querySelectorAll('.ex').forEach((row, i) => {
      const it = p.items[i]; if (!it) return;
      const v = k => row.querySelector(`[data-k="${k}"]`).value;
      Object.assign(it, { name: v('name').trim() || `Упражнение ${i + 1}`, trackId: v('trackId'), repeats: Math.max(1, Math.min(20, Number(v('repeats')) || 1)), start: parseMmss(v('start')), end: parseMmss(v('end')), gap: Math.max(0, Math.min(60, Number(v('gap')) || 0)), note: v('note').trim() });
    });
  };
  const draw = body => {
    body.innerHTML = `
      <label class="f">Название плана<input type="text" id="pName" value="${esc(p.name)}" maxlength="60" placeholder="Например: Балет, вторник"></label>
      ${p.example ? '<p class="hint">Это пример: поменяйте названия упражнений и выберите к ним композиции.</p>' : ''}
      ${tracks.length ? '' : '<p class="note">Сначала добавьте композиции в разделе «Музыка» → «Добавить композиции».</p>'}
      <div class="exs">${p.items.map((it, i) => `<div class="card ex">
        <div class="ex-head"><b class="disp">${i + 1}</b><input type="text" data-k="name" value="${esc(it.name)}" placeholder="Упражнение, например: Плие" maxlength="60">
          <button class="iconbtn" type="button" data-e="up" data-i="${i}" aria-label="Выше" ${i ? '' : 'disabled'}>↑</button><button class="iconbtn" type="button" data-e="down" data-i="${i}" aria-label="Ниже" ${i < p.items.length - 1 ? '' : 'disabled'}>↓</button></div>
        <label class="f">Композиция<select data-k="trackId">${opts(it.trackId)}</select></label>
        <div class="grid3">
          <label class="f">Сколько раз<input type="number" inputmode="numeric" min="1" max="20" data-k="repeats" value="${it.repeats || 1}"></label>
          <label class="f">Начать с<input type="text" inputmode="numeric" data-k="start" value="${it.start ? mmss(it.start) : ''}" placeholder="0:00"></label>
          <label class="f">Закончить на<input type="text" inputmode="numeric" data-k="end" value="${it.end ? mmss(it.end) : ''}" placeholder="до конца"></label>
        </div>
        <div class="grid2">
          <label class="f">Пауза между повторами, сек<input type="number" inputmode="numeric" min="0" max="60" data-k="gap" value="${it.gap ?? 5}"></label>
          <label class="f">Заметка<input type="text" data-k="note" value="${esc(it.note || '')}" maxlength="80" placeholder="правая и левая"></label>
        </div>
        <div class="btns"><button class="btn small" type="button" data-e="test" data-i="${i}">Послушать начало</button><button class="btn small" type="button" data-e="copy" data-i="${i}">Повторить ниже</button><button class="btn small ghost danger" type="button" data-e="del" data-i="${i}">Удалить</button></div>
      </div>`).join('')}</div>
      <button class="btn block" type="button" data-e="add">Добавить упражнение</button>
      <button class="btn primary block" type="button" data-e="save">Сохранить план</button>
      <button class="btn ghost danger" type="button" data-e="drop">Удалить план</button>`;
  };
  let testAudio = null;
  ui.page('', {
    title: 'План занятия', onMount: draw,
    onAction: async e => {
      const b = e.target.closest('[data-e]'); if (!b) return;
      const body = document.querySelector('#page .page-body'), i = Number(b.dataset.i);
      read(body);
      const act = b.dataset.e;
      if (act === 'add') { p.items.push({ id: uid(), name: '', trackId: '', repeats: 2, start: 0, end: 0, gap: 5, note: '' }); draw(body); body.querySelectorAll('.ex [data-k="name"]')[p.items.length - 1].focus(); }
      if (act === 'up' && i > 0) { [p.items[i - 1], p.items[i]] = [p.items[i], p.items[i - 1]]; draw(body); }
      if (act === 'down' && i < p.items.length - 1) { [p.items[i + 1], p.items[i]] = [p.items[i], p.items[i + 1]]; draw(body); }
      if (act === 'copy') { p.items.splice(i + 1, 0, { ...p.items[i], id: uid() }); draw(body); }
      if (act === 'del') { p.items.splice(i, 1); draw(body); }
      if (act === 'test') {
        if (testAudio) { testAudio.pause(); testAudio = null; return; }
        const it = p.items[i], t = it.trackId && await idb.get(it.trackId); if (!t) { toast('Выберите композицию'); return; }
        testAudio = new Audio(URL.createObjectURL(t.blob)); testAudio.currentTime = it.start || 0; testAudio.play().catch(() => {});
        setTimeout(() => { if (testAudio) { testAudio.pause(); testAudio = null; } }, 10000);
      }
      if (act === 'save') { delete p.example; BF.app.save(); ui.closePage(); BF.music.render(host); toast('План сохранён'); }
      if (act === 'drop') { ui.closePage(); const db2 = BF.app.db(); db2.programs = db2.programs.filter(x => x.id !== pid); BF.app.save(); BF.music.render(host); toast('План удалён'); }
    },
  });
}

/* ---------- плеер на занятии ---------- */
function playerPage(pid) {
  const p = BF.app.db().programs.find(x => x.id === pid);
  const steps = []; p.items.forEach(it => { for (let r = 1; r <= (it.repeats || 1); r++) steps.push({ it, r }); });
  if (!steps.length) { toast('В плане нет упражнений'); return; }
  let i = 0, audio = null, url = null, auto = true, timer = null, wake = null, countdown = 0;
  const stopAudio = () => { clearInterval(timer); timer = null; countdown = 0; if (audio) { audio.pause(); audio.ontimeupdate = audio.onended = null; } if (url) URL.revokeObjectURL(url); audio = null; url = null; };
  const keepAwake = async () => { try { wake = await navigator.wakeLock?.request('screen'); } catch (e) {} };
  const body = () => document.querySelector('#page .page-body');
  const draw = () => {
    const el = body(); if (!el) return;
    const s = steps[i], t = trackById(s.it.trackId), playing = audio && !audio.paused;
    const from = s.it.start || 0, to = s.it.end || (t && t.duration) || 0, cur = audio ? audio.currentTime : from;
    el.innerHTML = `
      <div class="player">
        <div class="eyebrow">Шаг ${i + 1} из ${steps.length}</div>
        <h2 class="disp pl-ex">${esc(s.it.name || 'Упражнение')}</h2>
        <div class="pl-rep">${s.it.repeats > 1 ? `раз ${s.r} из ${s.it.repeats}` : ''}${s.it.note ? `${s.it.repeats > 1 ? ' · ' : ''}${esc(s.it.note)}` : ''}</div>
        <div class="pl-track">${t ? esc(t.name) : '<span class="err">Нет музыки: выберите композицию в плане</span>'}</div>
        ${countdown ? `<div class="pl-count disp">${countdown}</div><p class="hint" style="text-align:center">Следующий повтор через ${countdown} сек.</p>` : `
        <div class="pl-bar"><i style="width:${to > from ? Math.min(100, Math.max(0, (cur - from) / (to - from) * 100)) : 0}%"></i></div>
        <div class="pl-time num"><span>${mmss(cur - from)}</span><span>${mmss(to - from)}</span></div>`}
        <div class="pl-btns">
          <button class="iconbtn big" data-p="prev" aria-label="Назад" ${i ? '' : 'disabled'}>⏮</button>
          <button class="btn primary pl-main" data-p="toggle">${playing ? 'Пауза' : countdown ? 'Сразу' : 'Старт'}</button>
          <button class="iconbtn big" data-p="next" aria-label="Дальше" ${i < steps.length - 1 ? '' : 'disabled'}>⏭</button>
        </div>
        <label class="switch">Играть подряд<input type="checkbox" id="plAuto" ${auto ? 'checked' : ''}></label>
      </div>
      <div><div class="eyebrow" style="margin-bottom:6px">Порядок</div><div class="list card">${steps.map((x, k) => `<button class="row pl-step ${k === i ? 'cur' : ''} ${k < i ? 'done' : ''}" data-p="go" data-k="${k}"><span class="num" style="width:22px">${k + 1}</span><div class="main"><div class="name">${esc(x.it.name || 'Упражнение')}${x.it.repeats > 1 ? ` · ${x.r}/${x.it.repeats}` : ''}</div><div class="sub">${esc(trackById(x.it.trackId)?.name || 'нет музыки')}</div></div></button>`).join('')}</div></div>`;
    el.querySelector('#plAuto').addEventListener('change', ev => { auto = ev.target.checked; });
  };
  // во время игры обновляем только полосу и время, чтобы не мешать нажатиям
  const tick = () => {
    const el = body(); if (!el || !audio) return;
    const s = steps[i], t = trackById(s.it.trackId), from = s.it.start || 0, to = s.it.end || (t && t.duration) || 0;
    const bar = el.querySelector('.pl-bar i'), tm = el.querySelector('.pl-time span');
    if (bar && to > from) bar.style.width = `${Math.min(100, Math.max(0, (audio.currentTime - from) / (to - from) * 100))}%`;
    if (tm) tm.textContent = mmss(audio.currentTime - from);
  };
  const setMedia = () => {
    if (!('mediaSession' in navigator)) return;
    const s = steps[i];
    navigator.mediaSession.metadata = new MediaMetadata({ title: `${s.it.name || 'Упражнение'}${s.it.repeats > 1 ? ` · ${s.r}/${s.it.repeats}` : ''}`, artist: trackById(s.it.trackId)?.name || '', album: p.name });
    navigator.mediaSession.setActionHandler('play', () => play());
    navigator.mediaSession.setActionHandler('pause', () => { audio && audio.pause(); draw(); });
    navigator.mediaSession.setActionHandler('nexttrack', () => go(i + 1, true));
    navigator.mediaSession.setActionHandler('previoustrack', () => go(i - 1, true));
  };
  const finish = () => {
    if (i >= steps.length - 1) { stopAudio(); draw(); toast('План закончен'); return; }
    if (!auto) { go(i + 1, false); return; }
    const gap = steps[i].it.gap || 0, nextSame = steps[i + 1].it === steps[i].it;
    if (gap && nextSame) {
      stopAudio(); i++; countdown = gap; draw();
      timer = setInterval(() => { countdown--; if (countdown <= 0) { clearInterval(timer); timer = null; countdown = 0; play(); } else draw(); }, 1000);
    } else go(i + 1, true);
  };
  const play = async () => {
    clearInterval(timer); timer = null; countdown = 0;
    const s = steps[i];
    if (!audio) {
      const t = s.it.trackId && await idb.get(s.it.trackId);
      if (!t) { toast('Нет музыки для этого упражнения'); draw(); return; }
      url = URL.createObjectURL(t.blob); audio = new Audio(url);
      audio.currentTime = s.it.start || 0;
      audio.ontimeupdate = () => { if (s.it.end && audio.currentTime >= s.it.end) { audio.pause(); finish(); return; } tick(); };
      audio.onended = finish;
    }
    keepAwake();
    try { await audio.play(); } catch (e) { toast('Не получилось запустить звук'); }
    setMedia(); draw();
  };
  const go = (k, start) => { if (k < 0 || k >= steps.length) return; stopAudio(); i = k; draw(); if (start) play(); };
  ui.page('', {
    title: esc(p.name), onMount: draw,
    onAction: e => {
      if (e.target.closest('[data-act="close"]')) return;
      const b = e.target.closest('[data-p]'); if (!b) return;
      const act = b.dataset.p;
      if (act === 'toggle') { if (countdown) { play(); return; } if (audio && !audio.paused) { audio.pause(); draw(); } else play(); }
      if (act === 'next') go(i + 1, !!(audio && !audio.paused) || auto);
      if (act === 'prev') go(i - 1, !!(audio && !audio.paused));
      if (act === 'go') go(Number(b.dataset.k), false);
    },
  });
  // остановить музыку, когда закрыли плеер
  const pageEl = document.getElementById('page');
  new MutationObserver((_, obs) => { if (!document.body.contains(pageEl)) { stopAudio(); try { wake && wake.release(); } catch (e) {} obs.disconnect(); } }).observe(document.body, { childList: true });
}
})();
