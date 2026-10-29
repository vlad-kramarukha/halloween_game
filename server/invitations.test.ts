import { test } from 'node:test';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import { createGameServer } from './app.js';
import { GameRoom } from './GameRoom.js';
import type { JoinReply, GameState } from '../shared/game.js';

test('admin creates invitation rooms; only valid links allow entry and reconnect', { timeout: 10000 }, async t => {
  const server = createGameServer({ adminPassword: 'test-password' });
  await new Promise<void>(resolve => server.httpServer.listen(0, '127.0.0.1', resolve));
  const address = server.httpServer.address(); assert.ok(address && typeof address === 'object');
  const url = 'http://127.0.0.1:' + address.port;
  const sockets: Socket[] = [];
  t.after(async () => { sockets.forEach(s => s.disconnect()); await new Promise<void>(resolve => server.io.close(() => resolve())); });
  let cookie = '';
  const api = (path: string, data?: unknown) => fetch(url + '/api/admin' + path, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-Admin-Request': '1' },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  assert.equal((await api('/rooms', {})).status, 401);
  const login = await api('/login', { password: 'test-password' });
  cookie = login.headers.get('set-cookie')!.split(';')[0];
  assert.equal((await api('/rooms', { roomId: '../invalid' })).status, 400);
  const create = await api('/rooms', { roomId: 'hr-team' }); assert.equal(create.status, 201);
  const invitation = await create.json();
  assert.equal(invitation.roomId, 'hr-team');
  assert.match(invitation.invitationToken, /^[\w-]{32}$/);
  assert.equal((await api('/rooms', { roomId: 'hr-team' })).status, 409);
  const generated = await api('/rooms', {}); assert.equal(generated.status, 201);
  assert.notEqual((await generated.json()).invitationToken, invitation.invitationToken);
  const overview = await api('/rooms').then(r => r.json());
  assert.equal(overview.rooms.find((r: GameState) => r.roomId === 'hr-team').invitationToken, invitation.invitationToken);
  const playerCookie = (await fetch(url + '/api/player', { method: 'POST', headers: { 'X-Game-Request': '1' } })).headers.get('set-cookie')!.split(';')[0];
  const connect = async () => {
    const socket = io(url, { transports: ['websocket'], forceNew: true, reconnection: false, extraHeaders: { Cookie: playerCookie } });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
    return socket;
  };
  const join = (socket: Socket, invitationToken?: string, token?: string, roomId = invitation.roomId) => new Promise<JoinReply>(resolve => {
    socket.emit('game:join', { roomId, character: 'witch', invitationToken, token }, resolve);
  });
  const root = await fetch(url + '/api/entry');
  assert.equal(root.status, 403);
  const noInvite = await fetch(url + '/api/entry?room=hr-team');
  assert.equal(noInvite.status, 403);
  const wrongInvite = await fetch(url + '/api/entry?room=hr-team&invite=wrong');
  assert.equal(wrongInvite.status, 403);
  const valid = await fetch(url + '/api/entry?room=hr-team&invite=' + invitation.invitationToken);
  assert.equal(valid.status, 200);
  const expired = await fetch(url + '/api/entry?room=expired&invite=' + invitation.invitationToken);
  assert.equal(expired.status, 403);
  const player = await connect();
  assert.equal((await join(player)).ok, false);
  assert.equal((await join(player, undefined, undefined, 'demo')).ok, false);
  const afterDenied = await api('/rooms').then(r => r.json());
  assert.equal(afterDenied.rooms.some((r: GameState) => r.roomId === 'demo'), false);
  assert.equal((await join(player, 'wrong')).ok, false);
  assert.equal((await join(player, invitation.invitationToken, undefined, 'expired-room')).ok, false);
  const joined = await join(player, invitation.invitationToken); assert.ok(joined.ok);
  assert.equal(JSON.stringify(joined.state).includes(invitation.invitationToken), false);
  player.disconnect();
  await new Promise(resolve => setTimeout(resolve, 30));
  const restored = await join(await connect(), invitation.invitationToken, joined.token); assert.ok(restored.ok);
  assert.equal(restored.playerId, joined.playerId);
});

test('empty invitation rooms survive cleanup and reset keeps their invitation', () => {
  const room = new GameRoom('private', () => {}, { invitationToken: 'private-invitation' });
  assert.equal(room.prune(), false);
  assert.equal(room.acceptsInvitation(undefined), false);
  assert.equal(room.acceptsInvitation('wrong'), false);
  assert.equal(room.acceptsInvitation('private-invitation'), true);
  room.reset();
  assert.equal(room.acceptsInvitation('private-invitation'), true);
  room.destroy();
});
test('local development still allows root and automatic demo room', { timeout: 10000 }, async t => {
  const server = createGameServer({ development: true });
  await new Promise<void>(resolve => server.httpServer.listen(0, '127.0.0.1', resolve));
  const address = server.httpServer.address(); assert.ok(address && typeof address === 'object');
  const url = 'http://127.0.0.1:' + address.port;
  const socket = io(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  t.after(async () => { socket.disconnect(); await new Promise<void>(resolve => server.io.close(() => resolve())); });
  assert.equal((await fetch(url + '/api/entry')).status, 200);
  await new Promise<void>((resolve, reject) => { if (socket.connected) resolve(); else { socket.once('connect', resolve); socket.once('connect_error', reject); } });
  const joined = await new Promise<JoinReply>(resolve => socket.emit('game:join', { roomId: 'demo', character: 'witch' }, resolve));
  assert.ok(joined.ok);
});