import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { GameRoom } from './GameRoom.js';
import { characterIds, gameConfig } from '../shared/game.js';

const join = (room: GameRoom, socket: string, character = characterIds[0]) => room.join(socket, { roomId: room.id, nickname: socket, character });
const settle = () => delay(15);

test('waits for two, rejects foreign/replayed rolls, moves and rotates the turn', async t => {
  const room = new GameRoom('turns', () => {}, { portalCells: [], eventCells: [], objectCells: new Map(), die: () => 4, rollDuration: 1, stepDuration: 1 });
  t.after(() => room.destroy());
  const a = join(room, 'a');
  assert.equal(room.snapshot().phase, 'waiting');
  assert.throws(() => room.requestRoll('a', room.snapshot().turnId));
  const b = join(room, 'b'); room.start();
  const turn = room.snapshot().turnId;
  assert.throws(() => room.requestRoll('b', turn));
  room.requestRoll('a', turn);
  assert.equal(room.snapshot().phase, 'rolling');
  assert.throws(() => room.requestRoll('a', turn));
  assert.throws(() => room.requestRoll('b', turn));
  await settle();
  assert.equal(room.snapshot().players.find(p => p.id === a.playerId)?.position, 4);
  assert.equal(room.snapshot().currentPlayerId, b.playerId);
  assert.throws(() => room.requestRoll('b', turn));
});

test('disconnect skips an idle player and reconnect restores character, id and position', async t => {
  const room = new GameRoom('reconnect', () => {}, { portalCells: [], eventCells: [], objectCells: new Map(), die: () => 2, rollDuration: 1, stepDuration: 1 });
  t.after(() => room.destroy());
  const a = join(room, 'a', 'werewolf');
  const b = join(room, 'b'); room.start();
  const c = join(room, 'c');
  room.requestRoll('a', room.snapshot().turnId);
  room.disconnect('a');
  await settle();
  assert.equal(room.snapshot().currentPlayerId, b.playerId);
  room.disconnect('b');
  assert.equal(room.snapshot().currentPlayerId, c.playerId);
  assert.equal(room.snapshot().phase, 'waiting');
  const restored = room.join('a-new', { roomId: room.id, token: a.token }, 'a');
  assert.equal(restored.playerId, a.playerId);
  assert.equal(room.snapshot().players.find(p => p.id === a.playerId)?.position, 2);
  assert.equal(room.snapshot().players.find(p => p.id === a.playerId)?.character, 'werewolf');
  assert.equal(room.snapshot().phase, 'ready');
  assert.throws(() => room.requestRoll('a', room.snapshot().turnId));
});

test('capacity, character validation, token privacy and expired seats', t => {
  let now = 1000;
  const room = new GameRoom('capacity', () => {}, { now: () => now });
  t.after(() => room.destroy());
  assert.throws(() => room.join('invalid', { roomId: room.id, character: 'invalid' as never }));
  const first = join(room, '0');
  for (let i = 1; i < 10; i++) join(room, String(i), characterIds[i]);
  assert.throws(() => join(room, '11'));
  assert.throws(() => room.join('clone', { roomId: room.id, token: first.token }));
  assert.ok(!JSON.stringify(room.snapshot()).includes(first.token));
  room.disconnect('0');
  now += gameConfig.reconnectGraceMs + 1;
  room.prune();
  join(room, 'new', 'scarecrow');
  assert.equal(room.snapshot().players.length, 10);
  assert.equal(room.snapshot().players.at(-1)?.slot, 0);
});

test('late join sees the in-progress roll; finish clamps at the configured last cell and locks game', async t => {
  const room = new GameRoom('finish', () => {}, { portalCells: [], eventCells: [], objectCells: new Map(), die: () => 6, rollDuration: 1, stepDuration: 1 });
  t.after(() => room.destroy());
  const a = join(room, 'a');
  join(room, 'b'); room.start();
  room.requestRoll('a', room.snapshot().turnId);
  join(room, 'late');
  assert.equal(room.snapshot().roll?.value, 6);
  assert.equal(room.snapshot().phase, 'rolling');
  await settle();
  room.disconnect('late');
  let rolls = 1;
  while (room.snapshot().phase !== 'finished' && rolls++ < gameConfig.cellCount * 2) {
    const state = room.snapshot();
    const socket = state.currentPlayerId === a.playerId ? 'a' : 'b';
    room.requestRoll(socket, state.turnId);
    await settle();
  }
  assert.equal(room.snapshot().phase, 'finished');
  assert.equal(room.snapshot().winnerId, a.playerId);
  assert.equal(room.snapshot().players.find(p => p.id === a.playerId)?.position, gameConfig.cellCount - 1);
  assert.throws(() => room.requestRoll('a', room.snapshot().turnId));
});

test('every catalog character is accepted', t => {
  for (const character of characterIds) {
    const room = new GameRoom(character, () => {});
    t.after(() => room.destroy());
    join(room, character, character);
    assert.equal(room.snapshot().players[0].character, character);
  }
  assert.equal(characterIds.length, 19);
});

 test('admin reset and move cancel rolls, reject stale turns, and reopen a finished game', async t => {
  const room = new GameRoom('admin-move', () => {}, { portalCells: [], eventCells: [], objectCells: new Map(), die: () => 4, rollDuration: 10, stepDuration: 1 });
  t.after(() => room.destroy());
  const a = join(room, 'a'); const b = join(room, 'b'); room.start();
  const oldTurn = room.snapshot().turnId;
  room.requestRoll('a', oldTurn);
  room.movePlayer(a.playerId, 23);
  assert.equal(room.snapshot().players[0].position, 22);
  assert.equal(room.snapshot().roll, null);
  assert.throws(() => room.requestRoll('a', oldTurn));
  await delay(30);
  assert.equal(room.snapshot().players[0].position, 22);
  for (const invalid of [0, -1, 1.5, gameConfig.cellCount + 1, NaN]) assert.throws(() => room.movePlayer(a.playerId, invalid));
  assert.throws(() => room.movePlayer('unknown', 5));
  room.movePlayer(b.playerId, gameConfig.cellCount);
  assert.equal(room.snapshot().winnerId, b.playerId);
  assert.equal(room.snapshot().phase, 'finished');
  room.movePlayer(b.playerId, 3);
  assert.equal(room.snapshot().winnerId, null);
  assert.equal(room.snapshot().phase, 'ready');
  room.requestRoll('a', room.snapshot().turnId);
  const revision = room.snapshot().revision;
  room.reset();
  await delay(30);
  assert.ok(room.snapshot().revision > revision);
  assert.deepEqual(room.snapshot().players.map(player => player.position), [0, 0]);
  assert.equal(room.snapshot().currentPlayerId, null);
  assert.equal(room.snapshot().roll, null);
  assert.equal(room.snapshot().started, false);
  assert.equal(room.snapshot().phase, 'waiting');
});

test('admin kick removes active and offline members, revokes sessions and preserves unrelated rolls', async t => {
  const room = new GameRoom('admin-kick', () => {}, { portalCells: [], eventCells: [], objectCells: new Map(), die: () => 2, rollDuration: 15, stepDuration: 1 });
  t.after(() => room.destroy());
  const a = join(room, 'a'); const b = join(room, 'b'); room.start(); const c = join(room, 'c');
  room.requestRoll('a', room.snapshot().turnId);
  assert.equal(room.kickPlayer(c.playerId), 'c');
  assert.equal(room.snapshot().phase, 'rolling');
  assert.equal(room.kickPlayer(a.playerId), 'a');
  assert.equal(room.snapshot().currentPlayerId, b.playerId);
  assert.equal(room.snapshot().phase, 'waiting');
  await delay(30);
  assert.equal(room.snapshot().roll, null);
  assert.throws(() => room.join('a-new', { roomId: room.id, token: a.token, character: 'ghost' }));
  assert.throws(() => room.requestRoll('a', room.snapshot().turnId));
  room.disconnect('b');
  assert.equal(room.kickPlayer(b.playerId), null);
  assert.equal(room.snapshot().players.length, 0);
  assert.equal(room.snapshot().currentPlayerId, null);
  room.reset();
  assert.equal(room.snapshot().phase, 'waiting');
  assert.throws(() => room.kickPlayer(b.playerId));
});

test('voluntary exit during a roll removes the player, invalidates token and passes turn', async t => {
  const room = new GameRoom('leave', () => {}, { portalCells: [], eventCells: [], objectCells: new Map(), die: () => 4, rollDuration: 1, stepDuration: 1 });
  t.after(() => room.destroy());
  const a = join(room, 'a');
  const b = join(room, 'b'); room.start();
  join(room, 'c');
  const turn = room.snapshot().turnId;
  room.requestRoll('a', turn);
  room.leave('a');
  assert.equal(room.snapshot().currentPlayerId, b.playerId);
  assert.equal(room.snapshot().phase, 'ready');
  assert.equal(room.snapshot().roll, null);
  assert.equal(room.snapshot().players.length, 2);
  assert.throws(() => room.join('a-new', { roomId: room.id, token: a.token }));
  assert.throws(() => room.requestRoll('a', turn));
  room.disconnect('a');
  room.leave('a');
  await settle();
  assert.equal(room.snapshot().players.length, 2);
  assert.equal(room.snapshot().players.every(p => p.position === 0), true);
  room.leave('b');
  assert.equal(room.snapshot().phase, 'waiting');
});
test('six connected players wait for admin start; reconnect, movement, kicks and reset never auto-start a session', async t => {
  const room = new GameRoom('manual-start', () => {}, { portalCells: [], eventCells: [], objectCells: new Map(), die: () => 3, rollDuration: 20, stepDuration: 1 });
  t.after(() => room.destroy());
  assert.equal(room.snapshot().started, false);
  assert.throws(() => room.start(), /два игрока/);
  const players = Array.from({ length: 6 }, (_, i) => join(room, 'p' + i));
  const lobby = room.snapshot();
  assert.equal(lobby.phase, 'waiting');
  assert.equal(lobby.currentPlayerId, null);
  for (let i = 0; i < 6; i++) assert.throws(() => room.requestRoll('p' + i, lobby.turnId), /администратором/);
  room.disconnect('p0');
  room.join('p0-new', { roomId: room.id, token: players[0].token }, 'p0');
  room.movePlayer(players[1].playerId, 7);
  room.kickPlayer(players[5].playerId);
  assert.equal(room.snapshot().started, false);
  assert.equal(room.snapshot().phase, 'waiting');
  assert.equal(room.snapshot().currentPlayerId, null);
  room.start();
  const launched = room.snapshot();
  assert.equal(launched.started, true);
  assert.equal(launched.phase, 'ready');
  assert.equal(launched.currentPlayerId, players[0].playerId);
  assert.throws(() => room.start(), /уже запущена/);
  assert.throws(() => room.requestRoll('p0-new', lobby.turnId));
  room.requestRoll('p0-new', launched.turnId);
  room.reset();
  await delay(40);
  const reset = room.snapshot();
  assert.equal(reset.started, false);
  assert.equal(reset.phase, 'waiting');
  assert.equal(reset.currentPlayerId, null);
  assert.equal(reset.roll, null);
  assert.ok(reset.players.every(player => player.position === 0));
  assert.throws(() => room.requestRoll('p0-new', reset.turnId), /администратором/);
  room.start();
  assert.equal(room.snapshot().phase, 'ready');
  room.disconnect('p1'); room.disconnect('p2'); room.disconnect('p3'); room.disconnect('p4');
  assert.equal(room.snapshot().started, true);
  assert.equal(room.snapshot().phase, 'waiting');
  room.reset();
  assert.throws(() => room.start(), /два игрока/);
  assert.equal(room.snapshot().started, false);
});