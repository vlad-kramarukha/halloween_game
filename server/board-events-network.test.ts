import { test } from 'node:test';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import { createGameServer } from './app.js';
import { createTestRooms, startTestRoom } from './test-rooms.js';
import type { ActionReply, GameState, JoinReply } from '../shared/game.js';

test('all sockets see the same event, only the owner acts, and late join/reconnect restore the card', { timeout: 10000 }, async t => {
  const server = createGameServer({ roomOptions: { portalCells: [], eventCells: [1], objectCells: new Map(), pickCard: () => 'interview', die: () => 1, rollDuration: 1, stepDuration: 0 } });
  await new Promise<void>(resolve => server.httpServer.listen(0, '127.0.0.1', resolve));
  const address = server.httpServer.address(); assert.ok(address && typeof address === 'object');
  const url = 'http://127.0.0.1:' + address.port;
  const invitations = await createTestRooms(url, server.adminPassword, ['shared-event']);
  const sockets: Socket[] = [];
  t.after(async () => { sockets.forEach(s => s.disconnect()); await new Promise<void>(resolve => server.io.close(() => resolve())); });
  const connect = async (existingCookie?: string) => {
    const cookie = existingCookie ?? (await fetch(url + '/api/player', { method: 'POST', headers: { 'X-Game-Request': '1' } })).headers.get('set-cookie')!.split(';')[0];
    const socket = io(url, { transports: ['websocket'], forceNew: true, reconnection: false, extraHeaders: { Cookie: cookie } });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
    return { socket, cookie };
  };
  const join = (socket: Socket, token?: string) => new Promise<JoinReply>(resolve => socket.emit('game:join', {
    roomId: 'shared-event', invitationToken: invitations['shared-event'], character: 'witch', token,
  }, resolve));
  const action = (socket: Socket, data: unknown) => new Promise<ActionReply>(resolve => socket.emit('game:event', data, resolve));
  const a = await connect(); const b = await connect();
  const first = await join(a.socket); assert.ok(first.ok); assert.ok((await join(b.socket)).ok);
  const started = await startTestRoom(url, server.adminPassword, 'shared-event');
  const waitEvent = (socket: Socket) => new Promise<GameState>(resolve => {
    const listener = (state: GameState) => { if (state.phase === 'event') { socket.off('game:state', listener); resolve(state); } };
    socket.on('game:state', listener);
  });
  const received = [waitEvent(a.socket), waitEvent(b.socket)];
  await new Promise<ActionReply>(resolve => a.socket.emit('game:roll', { turnId: started.turnId }, resolve));
  const [stateA, stateB] = await Promise.all(received);
  assert.deepEqual(stateA.event, stateB.event);
  const eventId = stateA.event!.id;
  assert.equal((await action(b.socket, { eventId, action: 'choose', optionId: 'go' })).ok, false);
  assert.equal((await action(a.socket, { eventId, action: 'choose', optionId: 'missing' })).ok, false);
  const late = await connect(); const lateJoin = await join(late.socket); assert.ok(lateJoin.ok);
  assert.deepEqual(lateJoin.state.event, stateA.event);
  a.socket.disconnect();
  await new Promise(resolve => setTimeout(resolve, 30));
  const reconnect = await connect(a.cookie);
  const restored = await join(reconnect.socket, first.token); assert.ok(restored.ok);
  assert.equal(restored.state.event?.id, eventId);
  assert.equal((await action(reconnect.socket, { eventId, action: 'choose', optionId: 'refuse' })).ok, true);
  assert.equal((await action(reconnect.socket, { eventId, action: 'choose', optionId: 'go' })).ok, false);
  assert.equal((await action(reconnect.socket, { eventId: eventId - 1, action: 'continue' })).ok, false);
  const completed = new Promise<GameState>(resolve => {
    const listener = (state: GameState) => { if (state.phase === 'ready') { b.socket.off('game:state', listener); resolve(state); } };
    b.socket.on('game:state', listener);
  });
  assert.equal((await action(reconnect.socket, { eventId, action: 'continue' })).ok, true);
  assert.equal((await completed).event, null);
});