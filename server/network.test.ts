import { test } from 'node:test';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import { createGameServer } from './app.js';
import { createTestRooms, startTestRoom } from './test-rooms.js';
import type { GameState, JoinReply, ActionReply } from '../shared/game.js';

test('10 real sockets share one state, reject extra players, isolate rooms and reconnect', { timeout: 20000 }, async t => {
  const server = createGameServer({ roomOptions: { portalCells: [], eventCells: [], objectCells: new Map() } });
  await new Promise<void>(resolve => server.httpServer.listen(0, '127.0.0.1', resolve));
  const address = server.httpServer.address();
  assert.ok(address && typeof address === 'object');
  const url = `http://127.0.0.1:${address.port}`;
  const invitations = await createTestRooms(url, server.adminPassword, ['network', 'other']);
  const sockets: Socket[] = [];
  t.after(async () => {
    sockets.forEach(socket => socket.disconnect());
    await new Promise<void>(resolve => server.io.close(() => resolve()));
  });
  const cookies = new Map<Socket, string>();
  const connect = async (existingCookie?: string) => {
    const cookie = existingCookie ?? (await fetch(url + '/api/player', { method: 'POST', headers: { 'X-Game-Request': '1' } })).headers.get('set-cookie')!.split(';')[0];
    const socket = io(url, { transports: ['websocket'], forceNew: true, reconnection: false, extraHeaders: { Cookie: cookie } });
    cookies.set(socket, cookie);
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
    return socket;
  };
  const emit = <T>(socket: Socket, event: string, data: unknown) => new Promise<T>((resolve, reject) => {
    const payload = event === 'game:join' ? { ...(data as { roomId: string }), invitationToken: invitations[(data as { roomId: string }).roomId] } : data;
    socket.timeout(4000).emit(event, payload, (error: Error | null, reply: T) => error ? reject(error) : resolve(reply));
  });
  const latest = new Map<Socket, GameState>();
  const credentials: Extract<JoinReply, { ok: true }>[] = [];
  for (let i = 0; i < 10; i++) {
    const socket = await connect();
    socket.on('game:state', state => latest.set(socket, state));
    const reply = await emit<JoinReply>(socket, 'game:join', { roomId: 'network', nickname: `P${i}`, character: i % 2 ? 'witch' : 'ghost' });
    assert.equal(reply.ok, true);
    if (!reply.ok) throw new Error(reply.error);
    credentials.push(reply); latest.set(socket, reply.state);
  }
  const extra = await connect();
  assert.equal((await emit<JoinReply>(extra, 'game:join', { roomId: 'network', character: 'ghost' })).ok, false);
  const other = await emit<JoinReply>(extra, 'game:join', { roomId: 'other', character: 'scarecrow' });
  assert.equal(other.ok, true);
  if (!other.ok) throw new Error(other.error);
  assert.equal(other.state.players.length, 1);
  const turnId = (await startTestRoom(url, server.adminPassword, 'network')).turnId;
  assert.equal((await emit<ActionReply>(sockets[1], 'game:roll', { turnId })).ok, false);
  const settled = Promise.all(sockets.slice(0, 10).map(socket => new Promise<GameState>(resolve => {
    const listener = (state: GameState) => {
      if (state.phase === 'ready' && state.roll) { socket.off('game:state', listener); resolve(state); }
    };
    socket.on('game:state', listener);
  })));
  assert.equal((await emit<ActionReply>(sockets[0], 'game:roll', { turnId, value: 999, position: 99 })).ok, true);
  assert.equal((await emit<ActionReply>(sockets[0], 'game:roll', { turnId })).ok, false);
  const states = await settled;
  const normalized = (state: GameState) => ({ ...state, serverTime: 0 });
  for (const state of states) assert.deepEqual(normalized(state), normalized(states[0]));
  const state = states[0];
  assert.ok(state.roll!.value >= 1 && state.roll!.value <= 6);
  assert.equal(state.players[0].position, state.roll!.value);
  assert.equal(state.currentPlayerId, credentials[1].playerId);
  sockets[0].disconnect();
  await new Promise(resolve => setTimeout(resolve, 30));
  const restoredSocket = await connect(cookies.get(sockets[0]));
  const restored = await emit<JoinReply>(restoredSocket, 'game:join', { roomId: 'network', token: credentials[0].token });
  assert.equal(restored.ok, true);
  if (!restored.ok) throw new Error(restored.error);
  assert.equal(restored.playerId, credentials[0].playerId);
  assert.equal(restored.state.players[0].position, state.roll!.value);
  assert.equal(restored.state.players.length, 10);
  assert.deepEqual(await new Promise<ActionReply>(resolve => restoredSocket.emit('game:leave', resolve)), { ok: true });
  const invalid = await emit<JoinReply>(restoredSocket, 'game:join', { roomId: 'network', token: credentials[0].token });
  assert.equal(invalid.ok, false);
  const fresh = await emit<JoinReply>(restoredSocket, 'game:join', { roomId: 'network', nickname: 'Returned', character: 'witch' });
  assert.equal(fresh.ok, true);
  if (!fresh.ok) throw new Error(fresh.error);
  assert.notEqual(fresh.playerId, restored.playerId);
  assert.equal(fresh.state.players.length, 10);
  assert.equal(fresh.state.players.some(p => p.id === restored.playerId), false);
  const health = await fetch(url + '/api/health').then(response => response.json());
  assert.deepEqual(health, { ok: true });
});
