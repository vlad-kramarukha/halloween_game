import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom } from './GameRoom.js';
import type { GameState } from '../shared/game.js';
import { samplePlayerMotion } from '../shared/movement.js';

function fixture(t: TestContext, event = false) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let now = 5000;
  const room = new GameRoom('pause', () => {}, {
    now: () => now, portalCells: [], eventCells: event ? [1] : [], objectCells: new Map(),
    die: () => event ? 1 : 3, pickCard: () => 'interview',
    rollDuration: 100, stepDuration: 10, eventTimeout: 150,
  });
  t.after(() => room.destroy());
  const a = room.join('a', { roomId: room.id, character: 'witch' });
  room.join('b', { roomId: room.id, character: 'witch' });
  const tick = (ms: number) => { now += ms; t.mock.timers.tick(ms); };
  const act = (action: 'choose' | 'roll' | 'continue', optionId?: string) => room.requestEvent('a', { eventId: room.snapshot().event!.id, action, optionId });
  return { room, a, tick, act };
}

test('pause freezes an ordinary roll, published clock and sampled motion, then resumes the remaining time', t => {
  const { room, a, tick } = fixture(t);
  assert.throws(() => room.pause());
  assert.throws(() => room.resume());
  room.start();
  room.requestRoll('a', room.snapshot().turnId);
  tick(110);
  room.pause();
  const paused = room.snapshot();
  assert.equal(paused.paused, true);
  assert.equal(paused.phase, 'rolling');
  const position = samplePlayerMotion(paused, a.playerId, paused.serverTime).position;
  tick(1000);
  assert.equal(room.snapshot().serverTime, paused.serverTime);
  assert.equal(room.snapshot().phase, 'rolling');
  assert.equal(room.snapshot().players[0].position, 0);
  assert.deepEqual(samplePlayerMotion(paused, a.playerId, paused.serverTime + 10000), { position, moving: false });
  assert.throws(() => room.requestRoll('a', paused.turnId), /паузе/);
  assert.throws(() => room.pause(), /уже/);
  room.resume();
  tick(19);
  assert.equal(room.snapshot().phase, 'rolling');
  tick(1);
  assert.equal(room.snapshot().phase, 'ready');
  assert.equal(room.snapshot().players[0].position, 3);
  assert.equal(room.snapshot().serverTime, 5130);
});

test('pause preserves card response time and rejects choices without altering the card', t => {
  const { room, tick, act } = fixture(t, true);
  room.start(); room.requestRoll('a', room.snapshot().turnId); tick(110);
  assert.equal(room.snapshot().event?.stage, 'choice');
  tick(30); room.pause();
  const event = room.snapshot().event;
  assert.throws(() => act('choose', 'go'), /паузе/);
  tick(1000);
  assert.deepEqual(room.snapshot().event, event);
  room.resume(); tick(119);
  assert.equal(room.snapshot().event?.stage, 'choice');
  tick(1);
  assert.equal(room.snapshot().phase, 'ready');
  assert.equal(room.snapshot().event, null);
});

test('event dice and confirmed consequence movement both resume instead of completing during pause', t => {
  const { room, a, tick, act } = fixture(t, true);
  room.start(); room.requestRoll('a', room.snapshot().turnId); tick(110);
  act('choose', 'go'); act('roll'); tick(30); room.pause();
  const rolled = room.snapshot().event;
  tick(1000);
  assert.deepEqual(room.snapshot().event, rolled);
  room.resume(); tick(69);
  assert.equal(room.snapshot().event?.stage, 'rolling');
  tick(1);
  assert.equal(room.snapshot().event?.stage, 'result');
  room.pause();
  assert.throws(() => act('continue'), /паузе/);
  tick(1000);
  room.resume(); act('continue');
  assert.equal(room.snapshot().phase, 'moving');
  tick(10); room.pause();
  const paused = room.snapshot();
  const before = samplePlayerMotion(paused, a.playerId, paused.serverTime).position;
  tick(1000);
  assert.equal(room.snapshot().phase, 'moving');
  assert.equal(samplePlayerMotion(room.snapshot(), a.playerId, 999999).position, before);
  room.resume(); tick(29);
  assert.equal(room.snapshot().phase, 'moving');
  tick(1);
  assert.equal(room.snapshot().phase, 'ready');
  assert.equal(room.snapshot().players[0].position, 5);
});

test('late joins see the paused state and reset clears every suspended task and requires a new start', t => {
  const { room, tick } = fixture(t, true);
  room.start(); room.requestRoll('a', room.snapshot().turnId); tick(110);
  room.pause();
  const before = room.snapshot();
  room.join('late', { roomId: room.id, character: 'witch' });
  const joined: GameState = room.snapshot();
  assert.equal(joined.paused, true);
  assert.deepEqual(joined.event, before.event);
  room.reset();
  assert.equal(room.snapshot().paused, false);
  assert.equal(room.snapshot().started, false);
  tick(10000);
  assert.equal(room.snapshot().phase, 'waiting');
  assert.equal(room.snapshot().event, null);
  assert.equal(room.snapshot().currentPlayerId, null);
  room.start(); room.requestRoll('a', room.snapshot().turnId); tick(110);
  assert.equal(room.snapshot().event?.stage, 'choice');
});