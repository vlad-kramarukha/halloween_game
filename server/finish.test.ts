import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from './GameRoom.js';
import { gameConfig, type DieValue } from '../shared/game.js';

function fixture(t: TestContext, positions: number[], dice: number[], stepDuration = 0) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let now = 1000;
  const queue = [...dice];
  const room = new GameRoom('finish', () => {}, {
    now: () => now, die: () => (queue.shift() ?? 1) as DieValue,
    rollDuration: 1, stepDuration, portalCells: [], eventCells: stepDuration ? [1] : [99],
    objectCells: new Map(), pickCard: () => 'directions',
  });
  t.after(() => room.destroy());
  const players = positions.map((position, slot) => {
    const member = room.join('p' + slot, { roomId: room.id, nickname: 'Игрок ' + slot, character: 'witch' });
    room.movePlayer(member.playerId, position + 1);
    return member;
  });
  room.start();
  const tick = (ms: number) => { now += ms; t.mock.timers.tick(ms); };
  const act = (action: 'roll' | 'continue') => room.requestEvent('p0', { eventId: room.snapshot().event!.id, action });
  return { room, players, tick, act };
}

test('first finisher locks the room, retains winner details through reconnect and exit, and resets cleanly', t => {
  const { room, players, tick } = fixture(t, [97, 98, 96], [2]);
  room.requestRoll('p0', room.snapshot().turnId); tick(1);
  const finished = room.snapshot();
  assert.equal(finished.phase, 'finished');
  assert.equal(finished.winnerId, players[0].playerId);
  assert.equal(finished.winner?.nickname, 'Игрок 0');
  assert.equal(finished.winner?.position, gameConfig.cellCount - 1);
  assert.equal(finished.currentPlayerId, null);
  assert.equal(finished.event, null);
  assert.equal(finished.movement, null);
  assert.equal(finished.players.filter(p => p.position === gameConfig.cellCount - 1).length, 1);
  for (const socket of ['p0', 'p1', 'p2']) assert.throws(() => room.requestRoll(socket, finished.turnId));
  assert.throws(() => room.requestEvent('p0', { eventId: 1, action: 'continue' }));
  assert.throws(() => room.pause());
  room.disconnect('p0');
  room.join('winner-reconnected', { roomId: room.id, token: players[0].token }, 'p0');
  assert.equal(room.snapshot().winnerId, finished.winnerId);
  assert.equal(room.snapshot().phase, 'finished');
  const clone = room.snapshot(); clone.winner!.nickname = 'changed';
  assert.equal(room.snapshot().winner?.nickname, 'Игрок 0');
  room.leave('winner-reconnected');
  tick(10000);
  assert.equal(room.snapshot().winnerId, finished.winnerId);
  assert.equal(room.snapshot().winner?.nickname, 'Игрок 0');
  assert.equal(room.snapshot().phase, 'finished');
  assert.equal(room.snapshot().players.length, 2);
  room.reset();
  assert.equal(room.snapshot().winnerId, null);
  assert.equal(room.snapshot().winner, null);
  assert.equal(room.snapshot().phase, 'waiting');
  room.start();
  assert.equal(room.snapshot().phase, 'ready');
});

test('group movement stops immediately when the earliest player reaches 100, regardless of join order', t => {
  const { room, players, tick, act } = fixture(t, [0, 96, 98], [1, 5], 10);
  room.requestRoll('p0', room.snapshot().turnId); tick(11);
  act('roll'); tick(1); act('continue');
  const moving = room.snapshot();
  assert.equal(moving.phase, 'moving');
  assert.equal(moving.movement!.endsAt - moving.serverTime, 10);
  tick(9);
  assert.equal(room.snapshot().winnerId, null);
  tick(1);
  const finished = room.snapshot();
  assert.equal(finished.phase, 'finished');
  assert.equal(finished.winnerId, players[2].playerId);
  assert.deepEqual(finished.players.map(p => p.position), [1, 97, 99]);
  assert.equal(finished.currentPlayerId, null);
  assert.equal(finished.movement, null);
  tick(10000);
  assert.deepEqual(room.snapshot().players.map(p => p.position), [1, 97, 99]);
});

test('simultaneous finishers have exactly one deterministic winner and no second finisher', t => {
  const { room, players, tick, act } = fixture(t, [0, 98, 98], [1, 5], 10);
  room.requestRoll('p0', room.snapshot().turnId); tick(11);
  act('roll'); tick(1); act('continue'); tick(10);
  const finished = room.snapshot();
  assert.equal(finished.phase, 'finished');
  assert.equal(finished.winnerId, players[1].playerId);
  assert.equal(finished.players.filter(p => p.position === 99).length, 1);
  assert.equal(finished.players[2].position, 98);
});