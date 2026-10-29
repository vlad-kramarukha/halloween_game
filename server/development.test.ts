import { test } from 'node:test';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import { createGameServer } from './app.js';
import { createTestRooms } from './test-rooms.js';
import type { JoinReply } from '../shared/game.js';

for (const development of [false, true]) {
  test('independent local tabs require server development mode: ' + development, { timeout: 10000 }, async t => {
    const server = createGameServer({ development });
    await new Promise<void>(resolve => server.httpServer.listen(0, '127.0.0.1', resolve));
    const address = server.httpServer.address(); assert.ok(address && typeof address === 'object');
    const url = 'http://127.0.0.1:' + address.port;
    const invitations = await createTestRooms(url, server.adminPassword, ['demo', 'other', 'external']);
    const response = await fetch(url + '/api/player', { method: 'POST', headers: { 'X-Game-Request': '1' } });
    const cookie = response.headers.get('set-cookie')!.split(';')[0];
    const sockets: Socket[] = [];
    t.after(async () => { sockets.forEach(s => s.disconnect()); await new Promise<void>(resolve => server.io.close(() => resolve())); });
    const connect = async (origin = url) => {
      const socket = io(url, { transports: ['websocket'], forceNew: true, reconnection: false, extraHeaders: { Cookie: cookie, Origin: origin } });
      sockets.push(socket);
      await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
      return socket;
    };
    const join = (socket: Socket, roomId = 'demo', token?: string) => new Promise<JoinReply>((resolve, reject) => {
      socket.timeout(2000).emit('game:join', { roomId, character: 'witch', token, invitationToken: invitations[roomId] }, (error: Error | null, reply: JoinReply) => error ? reject(error) : resolve(reply));
    });
    const a = await connect();
    const first = await join(a); assert.ok(first.ok);
    const b = await connect();
    const second = await join(b); assert.equal(second.ok, development);
    if (second.ok) assert.notEqual(second.playerId, first.playerId);
    const c = await connect();
    assert.equal((await join(c, 'other')).ok, development);
    // A copied active session still cannot control the original player.
    const duplicate = await connect();
    assert.equal((await join(duplicate, 'demo', first.token)).ok, false);
    // Reject external origins at the handshake, before identity or room access.
    await assert.rejects(connect('https://example.com'));
    // Vite on another localhost port is allowed only in explicit dev mode.
    if (development) {
      const local = await connect('http://localhost:5173');
      assert.equal((await join(local, 'external')).ok, true);
    } else await assert.rejects(connect('http://localhost:5173'));
    a.disconnect();
    await new Promise(resolve => setTimeout(resolve, 30));
    const reconnect = await connect();
    const restored = await join(reconnect, 'demo', first.token); assert.ok(restored.ok);
    assert.equal(restored.playerId, first.playerId);
    assert.equal(restored.state.players.length, development ? 2 : 1);
  });
}
