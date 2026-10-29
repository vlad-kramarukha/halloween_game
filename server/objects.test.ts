import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { GameRoom } from './GameRoom.js';
import { createBoardPickupLayout, pickupPlacement, candyPlacement, magicPlacement, pickupBalance, objectKind, type PickupId } from '../shared/board-pickups.js';
import { createEventLayout } from '../shared/event-layout.js';
import { eventsConfig } from '../shared/board-events.js';
import { gameConfig, type DieValue } from '../shared/game.js';
import { objectEventCards, type EventAction } from '../shared/events.js';

async function until(predicate: () => boolean) {
  const deadline = Date.now() + 1500;
  while (!predicate()) { assert.ok(Date.now() < deadline, 'transition timed out'); await delay(2); }
}
async function land(t: { after: (fn: () => void) => void }, id: PickupId, dice: number[] = [], positions = [0, 6, 10], extraObjects: [number, PickupId][] = []) {
  const queue = [1, ...dice];
  const room = new GameRoom('objects', () => {}, {
    portalCells: [], eventCells: [], objectCells: new Map([[positions[0] + 1, id], ...extraObjects]),
    die: () => (queue.shift() ?? 1) as DieValue, rollDuration: 1, stepDuration: 0,
  });
  t.after(() => room.destroy());
  const players = positions.map((position, index) => room.join('p' + index, { roomId: room.id, nickname: 'P' + index, character: 'witch' }));
  players.forEach((player, index) => room.movePlayer(player.playerId, positions[index] + 1));
  room.start();
  room.requestRoll('p0', room.snapshot().turnId);
  await until(() => room.snapshot().phase === 'event');
  const act = (action: EventAction['action'], targetPlayerId?: string) => room.requestEvent('p0', { eventId: room.snapshot().event!.id, action, targetPlayerId });
  const roll = async () => { act('roll'); await until(() => room.snapshot().event?.stage !== 'rolling'); };
  assert.equal(room.snapshot().event?.source, 'object');
  assert.equal(room.snapshot().event?.pickupId, id);
  assert.equal(room.snapshot().event?.cardId, objectEventCards[objectKind(id)]);
  return { room, players, act, roll, positions: () => room.snapshot().players.map(p => p.position) };
}

test('shared object layout has exact counts, no orange overlap, protected endpoints and stable variants', () => {
  const reserved = new Set(createEventLayout(gameConfig.cellCount, eventsConfig).keys());
  const layout = createBoardPickupLayout(gameConfig.cellCount, reserved);
  assert.equal(layout.size, 35);
  assert.deepEqual([...layout], [...createBoardPickupLayout(gameConfig.cellCount, reserved)]);
  for (const [cell] of layout) {
    assert.ok(cell >= pickupBalance.protectedStartCells && cell < gameConfig.cellCount - pickupBalance.protectedFinishCells);
    assert.equal(reserved.has(cell), false);
  }
  for (const type of pickupPlacement.types) assert.equal([...layout.values()].filter(id => id === type.id).length, type.count);
  for (const type of magicPlacement.types) assert.equal([...layout.values()].filter(id => id === type.id).length, type.count);
  assert.equal([...layout.values()].filter(id => id.startsWith('candy-')).length, candyPlacement.count);
  assert.equal(objectKind('candy-ghost'), 'ghost');
  assert.equal(objectKind('candy-cupcake'), 'candy');
});

test('both beige ghost variants move forward five only after confirmation', async t => {
  for (const id of ['ghost', 'candy-ghost'] as const) {
    const s = await land(t, id, [], [0, 6, 10]);
    assert.deepEqual(s.positions(), [1, 6, 10]);
    s.act('continue');
    assert.deepEqual(s.positions(), [6, 6, 10]);
    assert.equal(s.room.snapshot().phase, 'ready');
    assert.equal(s.room.snapshot().event, null);
    assert.equal(s.room.snapshot().players[0].effects?.skipTurns, 0);
  }
});

test('coin skips exactly the next scheduled turn, without moving the owner', async t => {
  const s = await land(t, 'coin');
  assert.equal(s.room.snapshot().players[0].effects?.skipTurns, 0);
  s.act('continue');
  assert.equal(s.room.snapshot().players[0].effects?.skipTurns, 1);
  assert.equal(s.positions()[0], 1);
  s.room.requestRoll('p1', s.room.snapshot().turnId); await until(() => s.room.snapshot().phase === 'ready');
  s.room.requestRoll('p2', s.room.snapshot().turnId); await until(() => s.room.snapshot().phase === 'ready');
  assert.equal(s.room.snapshot().currentPlayerId, s.players[1].playerId);
  assert.equal(s.room.snapshot().players[0].effects?.skipTurns, 0);
});

test('pumpkin allows only the owner to select an existing player and skips only that target', async t => {
  const s = await land(t, 'pumpkin');
  assert.equal(s.room.snapshot().event?.stage, 'target');
  const id = s.room.snapshot().event!.id;
  assert.throws(() => s.act('continue'));
  assert.throws(() => s.act('target', 'missing'));
  assert.throws(() => s.room.requestEvent('p1', { eventId: id, action: 'target', targetPlayerId: s.players[0].playerId }));
  s.act('target', s.players[2].playerId);
  assert.equal(s.room.snapshot().event?.selectedPlayerId, s.players[2].playerId);
  assert.equal(s.room.snapshot().players[2].effects?.skipTurns, 0);
  assert.throws(() => s.act('target', s.players[1].playerId));
  s.act('continue');
  assert.deepEqual(s.room.snapshot().players.map(p => p.effects?.skipTurns), [0, 0, 1]);
  s.room.requestRoll('p1', s.room.snapshot().turnId); await until(() => s.room.snapshot().phase === 'ready');
  assert.equal(s.room.snapshot().currentPlayerId, s.players[0].playerId);
  assert.equal(s.room.snapshot().players[2].effects?.skipTurns, 0);
});

test('pumpkin rejects self-targeting, supports offline targets, and rejects removed players', async t => {
  const self = await land(t, 'pumpkin');
  assert.throws(() => self.act('target', self.players[0].playerId), /на себя/);
  assert.equal(self.room.snapshot().event?.stage, 'target');
  assert.equal(self.room.snapshot().players[0].effects?.skipTurns, 0);
  const offline = await land(t, 'pumpkin'); offline.room.disconnect('p2');
  offline.act('target', offline.players[2].playerId); offline.act('continue');
  assert.equal(offline.room.snapshot().players[2].effects?.skipTurns, 1);
  const removed = await land(t, 'pumpkin'); removed.room.kickPlayer(removed.players[2].playerId);
  assert.throws(() => removed.act('target', removed.players[2].playerId));
  assert.equal(removed.room.snapshot().event?.stage, 'target');
  removed.act('target', removed.players[1].playerId);
});

test('every sweet grants one immediate extra die and then moves forward by that die', async t => {
  for (let value = 1; value <= 6; value++) {
    const s = await land(t, 'candy-wrapped', [value]);
    assert.equal(s.room.snapshot().event?.stage, 'roll');
    await s.roll();
    assert.equal(s.positions()[0], 1);
    assert.deepEqual(s.room.snapshot().event?.dice, [value]);
    s.act('continue');
    assert.equal(s.positions()[0], 1 + value);
    assert.equal(s.room.snapshot().currentPlayerId, s.players[1].playerId);
  }
});

test('broom requires two extra dice, moves by their sum, skips every other player once and clears no normal-roll flags early', async t => {
  const s = await land(t, 'broom', [2, 5]);
  assert.throws(() => s.act('continue'));
  await s.roll(); assert.equal(s.room.snapshot().event?.stage, 'roll');
  assert.deepEqual(s.room.snapshot().event?.dice, [2]);
  assert.throws(() => s.act('continue'));
  await s.roll();
  assert.deepEqual(s.room.snapshot().event?.dice, [2, 5]);
  assert.deepEqual(s.positions(), [1, 6, 10]);
  assert.deepEqual(s.room.snapshot().players.map(p => p.effects?.skipTurns), [0, 0, 0]);
  s.act('continue');
  assert.equal(s.positions()[0], 8);
  assert.equal(s.room.snapshot().currentPlayerId, s.players[0].playerId);
  assert.deepEqual(s.room.snapshot().players.map(p => p.effects?.skipTurns), [0, 0, 0]);
  assert.match(s.room.snapshot().notice ?? '', /P1, P2/);
  s.room.requestRoll('p0', s.room.snapshot().turnId);
  assert.deepEqual(s.room.snapshot().roll?.values, [1]);
});

test('potion moves only strictly ahead players back five, and is harmless when nobody is ahead', async t => {
  const s = await land(t, 'potion', [], [4, 5, 3, 9]);
  assert.deepEqual(s.positions(), [5, 5, 3, 9]);
  s.act('continue');
  assert.deepEqual(s.positions(), [5, 5, 3, 4]);
  const leader = await land(t, 'potion', [], [4, 3, 1]);
  assert.match(leader.room.snapshot().event?.message ?? '', /никого нет/);
  leader.act('continue'); assert.deepEqual(leader.positions(), [5, 3, 1]);
});

test('object consequences clamp at finish and reset cancels an unfinished target or extra roll', async t => {
  const finish = await land(t, 'broom', [6, 6], [gameConfig.cellCount - 6, 6, 10]);
  await finish.roll(); await finish.roll();
  assert.equal(finish.positions()[0], gameConfig.cellCount - 5);
  finish.act('continue');
  assert.equal(finish.positions()[0], gameConfig.cellCount - 1);
  assert.equal(finish.room.snapshot().phase, 'finished');
  const target = await land(t, 'pumpkin'); const eventId = target.room.snapshot().event!.id; target.room.reset();
  assert.equal(target.room.snapshot().event, null);
  assert.throws(() => target.room.requestEvent('p0', { eventId, action: 'target', targetPlayerId: target.players[1].playerId }));
  const rolling = await land(t, 'candy-cookie', [4]); rolling.act('roll'); rolling.room.reset(); await delay(10);
  assert.equal(rolling.room.snapshot().phase, 'waiting'); assert.deepEqual(rolling.positions(), [0, 0, 0]);
});
test('collected objects are shared, single-use, survive disconnects, and return only on reset', async t => {
  const room = new GameRoom('collected', () => {}, { portalCells: [], eventCells: [], objectCells: new Map([[1, 'ghost']]), die: () => 1, rollDuration: 1, stepDuration: 0 });
  t.after(() => room.destroy());
  const a = room.join('a', { roomId: room.id, character: 'witch' });
  room.join('b', { roomId: room.id, character: 'witch' });
  assert.deepEqual(room.snapshot().collectedPickups, []);
  room.start();
  room.requestRoll('a', room.snapshot().turnId);
  await until(() => room.snapshot().phase === 'event');
  assert.deepEqual(room.snapshot().collectedPickups, [1]);
  assert.equal(room.snapshot().players[0].position, 1);
  assert.equal(room.snapshot().event?.pickupId, 'ghost');
  room.disconnect('a');
  room.join('a-new', { roomId: room.id, token: a.token }, 'a');
  assert.deepEqual(room.snapshot().collectedPickups, [1]);
  const late = room.join('late', { roomId: room.id, character: 'witch' });
  assert.ok(late.playerId);
  assert.equal(room.snapshot().event?.pickupId, 'ghost');
  assert.deepEqual(room.snapshot().collectedPickups, [1]);
  const copy = room.snapshot(); copy.collectedPickups!.push(99);
  assert.deepEqual(room.snapshot().collectedPickups, [1]);
  room.requestEvent('a-new', { eventId: room.snapshot().event!.id, action: 'continue' });
  assert.equal(room.snapshot().players[0].position, 6);
  room.requestRoll('b', room.snapshot().turnId);
  await until(() => room.snapshot().phase === 'ready');
  assert.equal(room.snapshot().players[1].position, 1);
  assert.equal(room.snapshot().event, null);
  assert.deepEqual(room.snapshot().collectedPickups, [1]);
  room.reset(); assert.deepEqual(room.snapshot().collectedPickups, []);
  room.start();
  room.requestRoll('a-new', room.snapshot().turnId);
  await until(() => room.snapshot().phase === 'event');
  assert.equal(room.snapshot().event?.cardId, 'object-ghost');
  assert.deepEqual(room.snapshot().collectedPickups, [1]);
});

test('every object is consumed on landing before confirmation and movement chains to another item', async t => {
  for (const type of ['ghost', 'coin', 'pumpkin', 'candy-wrapped', 'broom', 'potion'] as const) {
    const s = await land(t, type);
    assert.deepEqual(s.room.snapshot().collectedPickups, [1]);
    s.room.reset(); assert.deepEqual(s.room.snapshot().collectedPickups, []);
  }
  const s = await land(t, 'ghost', [], [0, 6, 10], [[6, 'coin']]);
  s.act('continue');
  assert.equal(s.positions()[0], 6);
  assert.equal(s.room.snapshot().event?.cardId, 'object-coin');
  assert.deepEqual(s.room.snapshot().collectedPickups, [1, 6]);
});
test('six-player route has consistent reward and penalty counts in every leg and rare group effects', () => {
  const reserved = new Set(createEventLayout(gameConfig.cellCount, eventsConfig).keys());
  const layout = createBoardPickupLayout(gameConfig.cellCount, reserved);
  const start = pickupBalance.protectedStartCells;
  const end = gameConfig.cellCount - pickupBalance.protectedFinishCells;
  for (let section = 0; section < pickupBalance.players; section++) {
    const first = start + Math.floor(section * (end - start) / pickupBalance.players);
    const last = start + Math.floor((section + 1) * (end - start) / pickupBalance.players);
    const items = [...layout].filter(([cell]) => cell >= first && cell < last);
    const count = (kind: string) => items.filter(([, id]) => objectKind(id) === kind).length;
    assert.equal(count('coin'), 1);
    assert.equal(count('pumpkin'), 1);
    assert.equal(count('ghost'), 1);
    assert.equal(count('candy'), 2);
    assert.equal(items.length, section === 0 ? 5 : 6);
    assert.equal(count('broom'), pickupBalance.broomSections.some(value => value === section) ? 1 : 0);
    assert.equal(count('potion'), pickupBalance.potionSections.some(value => value === section) ? 1 : 0);
  }
  const cells = [...layout.keys()].sort((a, b) => a - b);
  for (let i = 1; i < cells.length; i++) assert.ok(cells[i] - cells[i - 1] >= 2, 'Pickups must not cluster on adjacent cells');
  for (const type of candyPlacement.types.filter(type => objectKind(type.id) === 'candy')) {
    assert.equal([...layout.values()].filter(id => id === type.id).length, 2);
  }
});