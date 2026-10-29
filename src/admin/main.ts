import './style.css';
import { characterCatalog } from '../../shared/characters';
import { gameConfig, type GameState } from '../../shared/game';

type Room = GameState & { invitationToken: string | null; onlineCount: number; playerCount: number };
type Overview = { cellCount: number; maxPlayers: number; rooms: Room[] };
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const notice = el('notice');
let overview: Overview = { cellCount: gameConfig.cellCount, maxPlayers: gameConfig.maxPlayers, rooms: [] };
let selected = '';
let authenticated = false;
let busy = false;
let loading = false;
const phases = { waiting: 'Ожидание игроков', ready: 'Ожидание броска', rolling: 'Выполняется ход', event: 'Событие на оранжевой клетке', moving: 'Перемещение после события', finished: 'Игра завершена' };
function message(text: string, error = false) { notice.textContent = text; notice.classList.toggle('error', error); }
function showLogin() { authenticated = false; el('login-panel').hidden = false; el('dashboard').hidden = true; }
async function api<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch('/api/admin' + path, {
    method: data === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: data === undefined ? {} : { 'Content-Type': 'application/json', 'X-Admin-Request': '1' },
    body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(8000),
  });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401) showLogin();
    throw new Error(result.error ?? 'Не удалось выполнить запрос.');
  }
  return result as T;
}
function render() {
  el('summary').textContent = `Комнат: ${overview.rooms.length} · Игроков онлайн: ${overview.rooms.reduce((sum, room) => sum + room.onlineCount, 0)}`;
  el('empty-rooms').hidden = overview.rooms.length > 0;
  const roomList = el('rooms'); roomList.replaceChildren();
  if (!overview.rooms.some(room => room.roomId === selected)) selected = overview.rooms[0]?.roomId ?? '';
  for (const room of overview.rooms) {
    const button = document.createElement('button'); button.className = 'room-button';
    button.textContent = room.roomId; button.setAttribute('aria-pressed', String(room.roomId === selected));
    const count = document.createElement('small'); count.textContent = `${room.onlineCount} онлайн · ${room.playerCount}/${overview.maxPlayers} участников`;
    button.append(count); button.onclick = () => { selected = room.roomId; render(); }; roomList.append(button);
  }
  const room = overview.rooms.find(room => room.roomId === selected);
  el('reset').hidden = !room;
  el('start').hidden = !room;
  el('pause').hidden = !room;
  el('pause').textContent = room?.paused ? 'Продолжить игру' : 'Пауза';
  el<HTMLButtonElement>('pause').disabled = busy || !room?.started || (!room.paused && room.phase === 'finished');
  el('start').textContent = room?.started ? 'Игра запущена' : 'Начать игру';
  el('start').title = room && room.onlineCount < gameConfig.minPlayers ? 'Нужны хотя бы два игрока онлайн' : '';
  el<HTMLButtonElement>('start').disabled = busy || !room || room.started || room.onlineCount < gameConfig.minPlayers;
  el<HTMLButtonElement>('create-room-button').disabled = busy;
  el('invitation').hidden = !room?.invitationToken;
  const invitation = new URL('/', location.origin);
  if (room?.invitationToken) {
    invitation.searchParams.set('room', room.roomId);
    invitation.searchParams.set('invite', room.invitationToken);
  }
  const link = room?.invitationToken ? invitation.href : '';
  if (el<HTMLInputElement>('room-link').value !== link) el<HTMLInputElement>('room-link').value = link;
  el('players-table').hidden = !room || room.players.length === 0;
  el('room-name').textContent = room ? `Комната ${room.roomId}` : 'Нет активных комнат';
  el('room-status').textContent = room ? `${(room.paused ? 'Игра на паузе' : room.started ? phases[room.phase] : 'Ожидание запуска администратором')} · Онлайн: ${room.onlineCount} / Участников: ${room.playerCount}` : '';
  el('room-help').textContent = room ? `Клетки 1–${overview.cellCount}. Изменения сразу видны всем участникам. Обновлено: ${new Date().toLocaleTimeString('ru-RU')}` : 'Создайте комнату и отправьте ссылку игрокам.';
  const rows = el('players'); rows.replaceChildren();
  for (const player of room?.players ?? []) {
    const row = document.createElement('tr');
    const name = document.createElement('td'); name.textContent = player.nickname;
    const detail = document.createElement('small');
    detail.textContent = (characterCatalog.find(character => character.id === player.character)?.name ?? player.character)
      + (player.id === room!.currentPlayerId ? ' · текущий ход' : '') + (player.id === room!.winnerId ? ' · победитель' : '');
    name.append(detail);
    const status = document.createElement('td'); status.textContent = player.connected ? 'Онлайн' : 'Нет связи'; status.className = player.connected ? 'online' : 'offline';
    const position = document.createElement('td'); position.textContent = String(player.position + 1);
    const moveCell = document.createElement('td'); const form = document.createElement('form'); form.className = 'move-form';
    const input = document.createElement('input'); input.type = 'number'; input.min = '1'; input.max = String(overview.cellCount); input.step = '1'; input.required = true; input.value = String(player.position + 1);
    input.setAttribute('aria-label', `Клетка для ${player.nickname}`);
    const move = document.createElement('button'); move.textContent = 'Переместить'; move.disabled = busy;
    form.append(input, move); moveCell.append(form);
    const roomId = room!.roomId;
    form.onsubmit = event => { event.preventDefault(); void action(roomId, 'move', { playerId: player.id, cell: input.valueAsNumber }, 'Игрок перемещён.'); };
    const kickCell = document.createElement('td'); const kick = document.createElement('button'); kick.className = 'danger'; kick.textContent = 'Выгнать'; kick.disabled = busy;
    kick.onclick = () => { if (confirm(`Исключить «${player.nickname}» из комнаты ${roomId}?`)) void action(roomId, 'kick', { playerId: player.id }, 'Игрок исключён.'); };
    kickCell.append(kick); row.append(name, status, position, moveCell, kickCell); rows.append(row);
  }
  el<HTMLButtonElement>('reset').disabled = busy;
}
async function refresh(quiet = false) {
  if (loading) return;
  loading = true;
  try {
    overview = await api<Overview>('/rooms'); authenticated = true;
    el('login-panel').hidden = true; el('dashboard').hidden = false;
    render();
  } catch (error) { if (!quiet || authenticated) message(error instanceof Error ? error.message : 'Сервер недоступен.', true); }
  finally { loading = false; }
}
async function action(roomId: string, actionName: string, data: unknown, success: string) {
  if (busy) return;
  busy = true; render();
  try { await api(`/rooms/${encodeURIComponent(roomId)}/${actionName}`, data); message(success); }
  catch (error) { message(error instanceof Error ? error.message : 'Ошибка запроса.', true); }
  finally { busy = false; await refresh(); }
}
el<HTMLFormElement>('create-room').onsubmit = async event => {
  event.preventDefault();
  if (busy) return;
  busy = true; render();
  try {
    const created = await api<{ roomId: string; invitationToken: string }>('/rooms', { roomId: el<HTMLInputElement>('new-room-name').value });
    selected = created.roomId;
    el<HTMLInputElement>('new-room-name').value = '';
    message('Комната создана. Скопируйте ссылку и отправьте участникам.');
  } catch (error) { message(error instanceof Error ? error.message : 'Ошибка создания комнаты.', true); }
  finally { busy = false; await refresh(); }
};
el('copy-room-link').onclick = async () => {
  const input = el<HTMLInputElement>('room-link');
  try {
    await navigator.clipboard.writeText(input.value);
    message('Ссылка скопирована.');
  } catch {
    input.focus(); input.select();
    message('Скопируйте выделенную ссылку через Ctrl+C.');
  }
};
el<HTMLFormElement>('login-form').onsubmit = async event => {
  event.preventDefault();
  const submit = el('login-form').querySelector('button')!; submit.disabled = true;
  try {
    await api('/login', { password: el<HTMLInputElement>('password').value });
    el<HTMLInputElement>('password').value = ''; message(''); await refresh();
  } catch (error) { message(error instanceof Error ? error.message : 'Сервер недоступен.', true); }
  finally { submit.disabled = false; }
};
el('pause').onclick = () => {
  const room = overview.rooms.find(room => room.roomId === selected);
  if (!room) return;
  void action(selected, room.paused ? 'resume' : 'pause', {}, room.paused ? 'Игра продолжается.' : 'Игра поставлена на паузу.');
};
el('start').onclick = () => { void action(selected, 'start', {}, 'Игра запущена. Первый игрок может бросать кубик.'); };
el('reset').onclick = () => {
  if (confirm(`Сбросить сессию комнаты ${selected}? Все игроки вернутся на клетку 1, текущий бросок будет отменён. Для новой партии потребуется нажать «Начать игру».`)) void action(selected, 'reset', {}, 'Сессия сброшена. Все игроки на старте.');
};
el('refresh').onclick = () => { if (!busy) void refresh(); };
el('logout').onclick = async () => {
  try { await api('/logout', {}); showLogin(); message('Вы вышли из админки.'); }
  catch (error) { message(error instanceof Error ? error.message : 'Ошибка выхода.', true); }
};
setInterval(() => {
  if (authenticated && !busy && !document.hidden && !(document.activeElement instanceof HTMLInputElement)) void refresh(true);
}, 2000);
void refresh(true);
