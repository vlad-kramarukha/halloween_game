import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom, type GameRoomOptions } from './GameRoom.js';
import { gameConfig, type DieValue } from '../shared/game.js';
import { createBoardPortalLayout, portalPlacement } from '../shared/board-portals.js';
import { createBoardPickupLayout } from '../shared/board-pickups.js';
import { createEventLayout } from '../shared/event-layout.js';
import { eventsConfig } from '../shared/board-events.js';
import type { EventAction } from '../shared/events.js';

function fixture(t: TestContext, dice: number[], options: GameRoomOptions = {}, positions = [0, 20, 10]) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let now = 1000;
  const queue = [...dice];
  const room = new GameRoom('portals', () => {}, {
    now: () => now, die: () => (queue.shift() ?? 1) as DieValue,
    rollDuration: 1, stepDuration: 0, eventTimeout: 5000,
    eventCells: [], objectCells: new Map(), portalCells: [], ...options,
  });
  t.after(() => room.destroy());
  const players = positions.map((position, i) => {
    const player = room.join('p' + i, { roomId: room.id, character: 'witch' });
    room.movePlayer(player.playerId, position + 1);
    return player;
  });
  room.start();
  const tick = (ms = 1) => { now += ms; t.mock.timers.tick(ms); };
  const act = (action: EventAction['action'], socket = 'p0', optionId?: string) =>
    room.requestEvent(socket, { eventId: room.snapshot().event!.id, action, optionId });
  const roll = (socket = 'p0') => { act('roll', socket); tick(); };
  const begin = () => { room.requestRoll('p0', room.snapshot().turnId); tick(); };
  return { room, players, tick, act, roll, begin };
}

test('three portals have one deterministic client/server layout with no object or orange overlaps', () => {
  const events = new Set(createEventLayout(gameConfig.cellCount, eventsConfig).keys());
  const objects = createBoardPickupLayout(gameConfig.cellCount, events);
  const portals = createBoardPortalLayout(gameConfig.cellCount, events, objects);
  assert.equal(portals.size, portalPlacement.count);
  assert.deepEqual(portals, createBoardPortalLayout(gameConfig.cellCount, events, objects));
  for (const cell of portals) {
    assert.ok(cell >= portalPlacement.protectedStartCells && cell < gameConfig.cellCount - portalPlacement.protectedFinishCells);
    assert.equal(events.has(cell) || objects.has(cell), false);
  }
});

test('every portal die branch waits for confirmation and either moves ten or joins the furthest leader', t => {
  for (const value of [1, 2, 3, 4, 5, 6]) {
    // Each scenario uses its own room but shares this test's virtual timer clock.
    const { room, begin, roll, act } = fixture(t, [1, value], { portalCells: [1] });
    begin();
    assert.equal(room.snapshot().event?.cardId, 'object-portal');
    assert.equal(room.snapshot().event?.pickupId, 'portal');
    assert.equal(room.snapshot().event?.source, 'object');
    roll();
    assert.equal(room.snapshot().event?.stage, 'result');
    assert.equal(room.snapshot().players[0].position, 1);
    act('continue');
    assert.equal(room.snapshot().players[0].position, [1, 3, 6].includes(value) ? 11 : 20);
    assert.equal(room.snapshot().phase, 'ready');
    assert.deepEqual(room.snapshot().collectedPickups, []);
    room.destroy();
    t.mock.timers.reset();
  }
});

test('portal, orange, ghost and coin form one chain before the original turn advances', t => {
  const s = fixture(t, [1, 1], { portalCells: [1], eventCells: [11], pickCard: () => 'best-self', objectCells: new Map([[17, 'ghost'], [22, 'coin']]) });
  s.begin(); const turnId = s.room.snapshot().turnId;
  s.roll(); s.act('continue');
  assert.equal(s.room.snapshot().event?.cardId, 'best-self');
  assert.equal(s.room.snapshot().players[0].position, 11);
  const oldId = s.room.snapshot().event!.id;
  s.act('continue');
  assert.equal(s.room.snapshot().event?.cardId, 'object-ghost');
  assert.equal(s.room.snapshot().players[0].position, 17);
  assert.throws(() => s.room.requestEvent('p0', { eventId: oldId, action: 'continue' }));
  s.act('continue');
  assert.equal(s.room.snapshot().event?.cardId, 'object-coin');
  assert.equal(s.room.snapshot().players[0].position, 22);
  assert.equal(s.room.snapshot().turnId, turnId);
  assert.throws(() => s.room.requestRoll('p1', turnId));
  s.act('continue');
  assert.equal(s.room.snapshot().phase, 'ready');
  assert.equal(s.room.snapshot().currentPlayerId, s.players[1].playerId);
  assert.deepEqual(s.room.snapshot().collectedPickups, [22]);
});

test('group effects enqueue the actual landing owners, preserve the original turn, and support pause and reconnect', t => {
  const s = fixture(t, [1], { objectCells: new Map([[1, 'potion'], [3, 'coin'], [10, 'ghost']]) }, [0, 8, 15]);
  s.begin(); const turnId = s.room.snapshot().turnId;
  s.act('continue');
  assert.deepEqual(s.room.snapshot().players.map(p => p.position), [1, 3, 10]);
  assert.equal(s.room.snapshot().event?.playerId, s.players[1].playerId);
  assert.equal(s.room.snapshot().event?.cardId, 'object-coin');
  assert.equal(s.room.snapshot().currentPlayerId, s.players[0].playerId);
  assert.throws(() => s.act('continue'));
  s.room.pause(); assert.throws(() => s.act('continue', 'p1'), /паузе/);
  s.tick(1000);
  s.room.disconnect('p1');
  s.room.join('p1-new', { roomId: s.room.id, token: s.players[1].token }, 'p1');
  assert.equal(s.room.snapshot().event?.playerId, s.players[1].playerId);
  s.room.resume(); s.act('continue', 'p1-new');
  assert.equal(s.room.snapshot().event?.playerId, s.players[2].playerId);
  assert.equal(s.room.snapshot().event?.cardId, 'object-ghost');
  assert.equal(s.room.snapshot().turnId, turnId);
  s.act('continue', 'p2');
  assert.equal(s.room.snapshot().players[2].position, 15);
  assert.equal(s.room.snapshot().phase, 'ready');
  assert.equal(s.room.snapshot().currentPlayerId, s.players[2].playerId);
});

test('revisiting an orange cell within a portal chain stops the cycle, but it activates on the next turn', t => {
  const s = fixture(t, [1, 2, 2, 1], { portalCells: [1, 19], eventCells: [20], pickCard: () => 'messenger' });
  s.begin(); s.roll(); s.act('continue');
  assert.equal(s.room.snapshot().event?.cardId, 'messenger');
  s.act('continue');
  assert.equal(s.room.snapshot().event?.pickupId, 'portal');
  s.roll(); s.act('continue');
  assert.equal(s.room.snapshot().players[0].position, 20);
  assert.equal(s.room.snapshot().event, null);
  assert.equal(s.room.snapshot().phase, 'ready');
  s.room.movePlayer(s.players[1].playerId, 20);
  s.room.requestRoll('p1', s.room.snapshot().turnId); s.tick();
  assert.equal(s.room.snapshot().event?.cardId, 'messenger');
  assert.equal(s.room.snapshot().event?.playerId, s.players[1].playerId);
});

test('a portal landing on the current leading position does not retrigger itself', t => {
  const s = fixture(t, [1, 2], { portalCells: [1] }, [0, 0, 0]);
  s.begin(); s.roll(); s.act('continue');
  assert.equal(s.room.snapshot().players[0].position, 1);
  assert.equal(s.room.snapshot().phase, 'ready');
  assert.equal(s.room.snapshot().event, null);
});

test('the next card opens only after movement completes; pausing and resetting discard no unfinished movement', t => {
  const s = fixture(t, [1, 1], { portalCells: [1], eventCells: [11], pickCard: () => 'best-self', stepDuration: 10 });
  s.room.requestRoll('p0', s.room.snapshot().turnId); s.tick(11);
  s.roll(); s.act('continue');
  assert.equal(s.room.snapshot().phase, 'moving');
  s.tick(40); s.room.pause(); s.tick(1000);
  assert.equal(s.room.snapshot().phase, 'moving');
  s.room.resume(); s.tick(59);
  assert.equal(s.room.snapshot().event, null);
  s.tick(1);
  assert.equal(s.room.snapshot().event?.cardId, 'best-self');
  s.act('continue');
  s.room.reset(); s.tick(1000);
  assert.equal(s.room.snapshot().event, null);
  assert.equal(s.room.snapshot().phase, 'waiting');
  assert.ok(s.room.snapshot().players.every(p => p.position === 0));
});

test('kicking a secondary card owner cancels the pending chain and advances the original turn exactly once', t => {
  const s = fixture(t, [1], { objectCells: new Map([[1, 'potion'], [3, 'coin'], [10, 'ghost']]) }, [0, 8, 15]);
  s.begin(); s.act('continue');
  assert.equal(s.room.snapshot().event?.playerId, s.players[1].playerId);
  s.room.kickPlayer(s.players[1].playerId);
  assert.equal(s.room.snapshot().phase, 'ready');
  assert.equal(s.room.snapshot().event, null);
  assert.equal(s.room.snapshot().currentPlayerId, s.players[2].playerId);
});

test('portal movement clamps at the finish and victory takes priority over new landing effects', t => {
  const s = fixture(t, [1, 6], { portalCells: [95], eventCells: [99] }, [94, 10, 6]);
  s.begin(); s.roll(); s.act('continue');
  assert.equal(s.room.snapshot().players[0].position, gameConfig.cellCount - 1);
  assert.equal(s.room.snapshot().phase, 'finished');
  assert.equal(s.room.snapshot().event, null);
});
test('portals remain on the field and can be used by the next player on a later turn', t => {
  const s = fixture(t, [1, 3, 1, 2], { portalCells: [1] });
  s.begin(); s.roll(); s.act('continue');
  assert.equal(s.room.snapshot().phase, 'ready');
  s.room.movePlayer(s.players[1].playerId, 1);
  s.room.requestRoll('p1', s.room.snapshot().turnId); s.tick();
  assert.equal(s.room.snapshot().event?.cardId, 'object-portal');
  assert.equal(s.room.snapshot().event?.playerId, s.players[1].playerId);
  s.roll('p1'); s.act('continue', 'p1');
  assert.equal(s.room.snapshot().players[1].position, 11);
  assert.deepEqual(s.room.snapshot().collectedPickups, []);
});

test('kicking the original turn owner while a secondary card is open cancels the chain', t => {
  const s = fixture(t, [1], { objectCells: new Map([[1, 'potion'], [3, 'coin'], [10, 'ghost']]) }, [0, 8, 15]);
  s.begin(); s.act('continue');
  assert.equal(s.room.snapshot().event?.playerId, s.players[1].playerId);
  s.room.kickPlayer(s.players[0].playerId);
  assert.equal(s.room.snapshot().phase, 'ready');
  assert.equal(s.room.snapshot().event, null);
  assert.equal(s.room.snapshot().currentPlayerId, s.players[1].playerId);
});
