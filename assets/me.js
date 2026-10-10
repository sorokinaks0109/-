// Страница ученицы: по личной ссылке показывает остаток занятий, срок и расписание.
(() => {
'use strict';
const BF = window.BF, Store = BF.Store;
const root = document.getElementById('me');
const BASE = new URL('../', location.href).href;
const KEY = 'ballet-forever-me';

const params = new URLSearchParams(location.search);
let tok = params.get('t');
try { if (tok) localStorage.setItem(KEY, tok); else tok = localStorage.getItem(KEY); } catch (e) {}

let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; const b = document.getElementById('installBtn'); if (b) b.hidden = false; });

const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

function installBlock() {
  if (standalone) return '';
  return `<section class="card" style="padding:14px;display:flex;flex-direction:column;gap:10px">
    <div class="eyebrow">Поставить на телефон</div>
    <p class="hint">${isIOS ? 'В Safari нажмите «Поделиться» внизу экрана, затем «На экран Домой».' : 'В меню браузера (три точки) выберите «Добавить на главный экран» или «Установить приложение».'} Страница откроется как приложение.</p>
    <button class="btn primary" id="installBtn" ${installEvt ? '' : 'hidden'}>Установить</button>
  </section>`;
}

async function show() {
  BF.loadBallerina(BASE);
  if (!tok) {
    root.innerHTML = `<section class="login"><div class="hero"><div class="ballerina" data-ballerina>${BF.ballerina}</div><h1>Ballet Forever</h1><p>страница ученицы</p></div>
      <p style="text-align:center">Откройте личную ссылку, которую прислал преподаватель.</p></section>`;
    return;
  }
  root.innerHTML = '<p class="empty">Загружаю…</p>';
  try {
    const card = await Store.studentCard(tok);
    if (!card) {
      root.innerHTML = `<section class="login"><div class="hero"><div class="ballerina" data-ballerina>${BF.ballerina}</div><h1>Ballet Forever</h1><p>страница ученицы</p></div>
        <p style="text-align:center">Ссылка устарела. Попросите у преподавателя новую.</p></section>`;
      return;
    }
    try { localStorage.setItem(KEY + '-card', JSON.stringify(card)); } catch (e) {}
    draw(card);
  } catch (e) {
    let cached = null; try { cached = JSON.parse(localStorage.getItem(KEY + '-card')); } catch (_) {}
    if (cached) { draw(cached); root.insertAdjacentHTML('afterbegin', '<div class="banner"><span>Нет интернета, показаны последние сохранённые данные.</span></div>'); }
    else root.innerHTML = '<div class="banner"><span>Нет связи с сервером. Проверьте интернет и обновите страницу.</span></div>';
  }
}
function draw(card) {
  root.innerHTML = BF.studentView(card) + installBlock() + '<p class="footer-mark">Ballet Forever</p>';
  const b = document.getElementById('installBtn');
  if (b) b.addEventListener('click', async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; b.hidden = true; });
}
show();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') show(); });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('../sw.js', { scope: '../' }).catch(() => {});
})();
