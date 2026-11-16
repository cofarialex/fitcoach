// AI Coach chat
import { get, post, del } from '../api.js';
import { esc, icon, toastError, confirmDialog, miniMarkdown, today } from '../ui.js';

const SUGGESTIONS = [
  'Ma nincs kedvem lábazni, milyen alternatívát ajánlasz?',
  'Ma csak tojás, rizs és tonhal van otthon. Mit egyek?',
  'Nem fejlődök fekvenyomásban. Mit változtassak?',
  'Túl sok kalóriát ettem ma. Hogyan alakítsam a holnapi étrendet?',
  'Módosítsd az edzéstervemet, mert csak heti 3 napom van edzeni.',
];

export async function render(el, { store }) {
  const { messages } = await get('/coach/messages');
  el.innerHTML = `<div class="page" style="padding-bottom:16px">
    <div class="page-head"><div><h1>AI Coach</h1><p>${store.me.aiEnabled ? 'Claude AI · ismeri a profilodat, a naplódat és az alapanyagaidat, és módosítani is tud.' : 'Beépített edzői motor · az AI-hoz add meg az Anthropic API-kulcsot (lásd README).'}</p></div>
      <div class="actions"><button class="btn btn-ghost btn-sm" id="clear">${icon('trash')} Előzmények törlése</button></div></div>
    <div class="card chat">
      <div class="chat-log" id="log"></div>
      <div class="suggestions" id="sugg">${SUGGESTIONS.map((s) => `<button>${esc(s)}</button>`).join('')}</div>
      <form class="chat-input" id="form"><textarea id="msg" rows="1" placeholder="Kérdezz bármit az edzésről vagy az étkezésről…" aria-label="Üzenet"></textarea>
        <button class="btn btn-primary" aria-label="Küldés">${icon('send')}</button></form>
    </div></div>`;

  const log = el.querySelector('#log');
  const add = (role, content) => {
    const div = document.createElement('div');
    div.className = `msg ${role}`;
    div.innerHTML = role === 'assistant' ? miniMarkdown(content) : esc(content).replace(/\n/g, '<br>');
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    return div;
  };
  if (!messages.length) add('assistant', `Szia ${store.me.user.name}! Én vagyok a személyi edződ és táplálkozási tanácsadód. Kérdezz bátran — vagy válassz lent egy példát.`);
  messages.forEach((m) => add(m.role, m.content));
  el.querySelector('#sugg').hidden = messages.length > 0;

  const form = el.querySelector('#form');
  const input = el.querySelector('#msg');
  let busy = false;
  const send = async (text) => {
    if (!text.trim() || busy) return;
    busy = true;
    el.querySelector('#sugg').hidden = true;
    add('user', text);
    input.value = '';
    const typing = add('assistant', store.me.aiEnabled ? 'Gondolkodom…' : '…');
    typing.classList.add('typing');
    try {
      const r = await post('/coach', { message: text, date: today() });
      typing.remove();
      add('assistant', r.reply);
      if (r.actions && r.actions.length) {
        const note = add('assistant', '_Módosítás elvégezve — az érintett oldalak (Edzésterv / Étrend / Alapanyagok) már frissültek._');
        note.classList.add('typing');
      }
    } catch (e) {
      typing.remove();
      toastError(e);
    } finally {
      busy = false;
      input.focus();
    }
  };
  form.onsubmit = (e) => {
    e.preventDefault();
    send(input.value);
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input.value);
    }
  });
  el.querySelectorAll('#sugg button').forEach((b) => b.addEventListener('click', () => send(b.textContent)));
  el.querySelector('#clear').onclick = async () => {
    if (!(await confirmDialog('Törlöd a beszélgetés előzményeit?', { okText: 'Törlés', danger: true }))) return;
    await del('/coach/messages').catch(toastError);
    log.innerHTML = '';
    el.querySelector('#sugg').hidden = false;
  };
  input.focus();
}
