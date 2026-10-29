import { test } from 'node:test';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import { createGameServer } from './app.js';
import { createTestRooms } from './test-rooms.js';
import { gameConfig, type GameState, type JoinReply } from '../shared/game.js';

test('admin HTTP auth, shared state mutations, kick and isolation with real sockets', { timeout: 15000 }, async t => {
  const server = createGameServer({ adminPassword: 'integration-admin-password' });
  await new Promise<void>(resolve => server.httpServer.listen(0, '127.0.0.1', resolve));
  const address = server.httpServer.address(); assert.ok(address && typeof address === 'object');
  const url = `http://127.0.0.1:${address.port}`;
  const invitations = await createTestRooms(url, server.adminPassword, ['admin-test', 'other-room']);
  const sockets: Socket[] = [];
  t.after(async () => { sockets.forEach(socket => socket.disconnect()); await new Promise<void>(resolve => server.io.close(() => resolve())); });
  const connect = async (roomId: string, nickname: string) => {
    const playerCookie = (await fetch(url + '/api/player', { method: 'POST', headers: { 'X-Game-Request': '1' } })).headers.get('set-cookie')!.split(';')[0];
    const socket = io(url, { transports: ['websocket'], forceNew: true, reconnection: false, extraHeaders: { Cookie: playerCookie } }); sockets.push(socket);
    await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
    const joined = await new Promise<JoinReply>(resolve => socket.emit('game:join', { roomId, nickname, character: 'ghost', invitationToken: invitations[roomId] }, resolve));
    assert.equal(joined.ok, true); if (!joined.ok) throw new Error(joined.error);
    return { socket, joined };
  };
  const a = await connect('admin-test', 'Alice'); const b = await connect('admin-test', 'Bob');
  await connect('other-room', 'Other');
  let cookie = '';
  const request = (path: string, data?: unknown, useCookie = true, header = true) => fetch(url + '/api/admin' + path, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...(header ? { 'X-Admin-Request': '1' } : {}), ...(useCookie ? { Cookie: cookie } : {}) },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  assert.equal((await request('/rooms')).status, 401);
  assert.equal((await request('/rooms/admin-test/start', {})).status, 401);
  assert.equal((await request('/rooms/admin-test/reset', {})).status, 401);
  assert.equal((await request('/login', { password: 'wrong' })).status, 401);
  const login = await request('/login', { password: 'integration-admin-password' });
  assert.equal(login.status, 200);
  assert.match(login.headers.get('set-cookie')!, /HttpOnly; SameSite=Strict/);
  cookie = login.headers.get('set-cookie')!.split(';')[0];
  let overview = await request('/rooms').then(res => res.json());
  assert.equal(overview.rooms.length, 2);
  assert.equal(overview.rooms[0].onlineCount, 2);
  assert.equal(overview.rooms[0].playerCount, 2);
  assert.ok(!JSON.stringify(overview).includes(a.joined.token));
  assert.equal((await request('/rooms/admin-test/reset', {}, true, false)).status, 403);
  for (const cell of [0, gameConfig.cellCount + 1, 1.5, '7']) assert.equal((await request('/rooms/admin-test/move', { playerId: a.joined.playerId, cell })).status, 400);
  assert.equal((await request('/rooms/missing/reset', {})).status, 404);
  assert.equal((await request('/rooms/admin-test/kick', { playerId: 'missing' })).status, 400);
  const stateAfter = (socket: Socket, predicate: (state: GameState) => boolean) => new Promise<GameState>(resolve => {
    const handler = (state: GameState) => { if (predicate(state)) { socket.off('game:state', handler); resolve(state); } }; socket.on('game:state', handler);
  });
  assert.equal(a.joined.state.started, false);
  assert.equal(b.joined.state.started, false);
  assert.equal((await request('/rooms/other-room/start', {})).status, 400);
  assert.equal((await request('/rooms/admin-test/start', {}, true, false)).status, 403);
  const started = [a.socket, b.socket].map(socket => stateAfter(socket, state => state.started && state.phase === 'ready'));
  const launch = await request('/rooms/admin-test/start', {});
  assert.equal(launch.status, 200);
  const launchState = (await launch.json()).state as GameState;
  assert.equal(launchState.currentPlayerId, a.joined.playerId);
  for (const state of await Promise.all(started)) assert.equal(state.turnId, launchState.turnId);
  assert.equal((await request('/rooms/admin-test/start', {})).status, 400);
  assert.equal((await request('/rooms/admin-test/pause', {}, false)).status, 401);
  assert.equal((await request('/rooms/admin-test/pause', {}, true, false)).status, 403);
  assert.equal((await request('/rooms/other-room/pause', {})).status, 400);
  const paused = [a.socket, b.socket].map(socket => stateAfter(socket, state => state.paused));
  assert.equal((await request('/rooms/admin-test/pause', {})).status, 200);
  for (const state of await Promise.all(paused)) {
    assert.equal(state.phase, 'ready');
    assert.equal(state.currentPlayerId, launchState.currentPlayerId);
    assert.equal(state.turnId, launchState.turnId);
  }
  const blockedRoll = await new Promise<{ ok: boolean }>(resolve => a.socket.emit('game:roll', { turnId: launchState.turnId }, resolve));
  assert.equal(blockedRoll.ok, false);
  assert.equal((await request('/rooms/admin-test/pause', {})).status, 400);
  assert.equal((await request('/rooms/admin-test/resume', {}, false)).status, 401);
  const resumed = [a.socket, b.socket].map(socket => stateAfter(socket, state => !state.paused));
  assert.equal((await request('/rooms/admin-test/resume', {})).status, 200);
  for (const state of await Promise.all(resumed)) assert.equal(state.turnId, launchState.turnId);
  assert.equal((await request('/rooms/admin-test/resume', {})).status, 400);
  const moved = [a.socket, b.socket].map(socket => stateAfter(socket, state => state.players[0].position === 42));
  assert.equal((await request('/rooms/admin-test/move', { playerId: a.joined.playerId, cell: 43 })).status, 200);
  for (const state of await Promise.all(moved)) assert.equal(state.players[0].position, 42);
  const reset = [a.socket, b.socket].map(socket => stateAfter(socket, state => state.players.every(player => player.position === 0)));
  assert.equal((await request('/rooms/admin-test/reset', {})).status, 200);
  for (const state of await Promise.all(reset)) { assert.equal(state.started, false); assert.equal(state.currentPlayerId, null); assert.equal(state.phase, 'waiting'); }
  const kicked = new Promise<{ message: string }>(resolve => a.socket.once('game:kicked', resolve));
  const disconnected = new Promise<void>(resolve => a.socket.once('disconnect', () => resolve()));
  const remaining = stateAfter(b.socket, state => state.players.length === 1);
  assert.equal((await request('/rooms/admin-test/kick', { playerId: a.joined.playerId })).status, 200);
  assert.match((await kicked).message, /исключил/); await disconnected;
  assert.equal((await remaining).currentPlayerId, null);
  overview = await request('/rooms').then(res => res.json());
  assert.equal(overview.rooms.find((room: GameState) => room.roomId === 'other-room').players[0].position, 0);
  b.socket.disconnect();
  await new Promise(resolve => setTimeout(resolve, 30));
  overview = await request('/rooms').then(res => res.json());
  assert.equal(overview.rooms[0].onlineCount, 0);
  assert.equal(overview.rooms[0].playerCount, 1);
  assert.equal((await request('/logout', {})).status, 200);
  assert.equal((await request('/rooms')).status, 401);
  assert.equal((await request('/rooms/admin-test/start', {})).status, 401);
});
