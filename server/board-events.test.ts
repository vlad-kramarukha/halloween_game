import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { GameRoom } from './GameRoom.js';
import { gameConfig, type DieValue } from '../shared/game.js';
import { eventCardIds, orangeEventCardIds, type EventCardId } from '../shared/events.js';
import { eventCatalog } from './events/catalog.js';
import { BoardEvents } from './events/BoardEvents.js';
import { executeEventActions, emptyEffects } from './events/execute.js';
import { createEventLayout } from '../shared/event-layout.js';
import { eventsConfig } from '../shared/board-events.js';

async function until(predicate: () => boolean) {
  const deadline = Date.now() + 1500;
  while (!predicate()) { assert.ok(Date.now() < deadline, 'state transition timed out'); await delay(2); }
}
async function scenario(t: { after: (fn: () => void) => void }, card: EventCardId, dice: number[] = [], positions = [4, 10, 6], extraCells: number[] = []) {
  const queue = [1, ...dice];
  const cell = positions[0] + 1;
  const room = new GameRoom('event-test', () => {}, {
    portalCells: [], eventCells: [cell, ...extraCells], objectCells: new Map(), pickCard: () => card, die: () => (queue.shift() ?? 1) as DieValue,
    rollDuration: 1, stepDuration: 0, eventTimeout: 3000,
  });
  t.after(() => room.destroy());
  const joined = ['a', 'b', 'c'].map(socket => room.join(socket, { roomId: room.id, nickname: socket, character: 'witch' }));
  joined.forEach((p, i) => room.movePlayer(p.playerId, positions[i] + 1));
  room.start();
  room.requestRoll('a', room.snapshot().turnId);
  await until(() => room.snapshot().phase === 'event');
  const act = (action: 'choose' | 'roll' | 'decline' | 'continue', optionId?: string) =>
    room.requestEvent('a', { eventId: room.snapshot().event!.id, action, optionId });
  const roll = async () => { act('roll'); await until(() => room.snapshot().event?.stage !== 'rolling'); };
  return { room, joined, act, roll, actor: () => room.snapshot().players[0], positions: () => room.snapshot().players.map(p => p.position) };
}

test('orange cells share one deterministic layout; random cards are drawn without repeating within a deck', t => {
  const layout = createEventLayout(gameConfig.cellCount, eventsConfig);
  assert.equal(layout.size, eventsConfig.occurrencesPerType * eventsConfig.types.length);
  const engine = new BoardEvents({ players: () => [], changed: () => {}, done: () => {}, now: Date.now, die: () => 1, rollDuration: 1 });
  t.after(() => engine.cancel());
  const ids: EventCardId[] = [];
  const deckSize = orangeEventCardIds.length;
  for (let i = 0; i < deckSize * 2; i++) { engine.start('a'); ids.push(engine.snapshot()!.cardId); engine.cancel(); }
  assert.deepEqual(new Set(ids.slice(0, deckSize)), new Set(orangeEventCardIds));
  assert.deepEqual(new Set(ids.slice(deckSize)), new Set(orangeEventCardIds));
  assert.notEqual(ids[deckSize - 1], ids[deckSize]);
  assert.deepEqual(Object.keys(eventCatalog).sort(), [...eventCardIds].sort());
});

test('choice consequences remain private; only the owner can choose once; ordinary rolls are blocked', async t => {
  const s = await scenario(t, 'interview');
  const event = s.room.snapshot().event!;
  assert.equal(event.stage, 'choice'); assert.equal(event.message, '');
  assert.deepEqual(event.options.map(o => Object.keys(o).sort()), [['id', 'text'], ['id', 'text'], ['id', 'text']]);
  assert.throws(() => s.room.requestEvent('b', { eventId: event.id, action: 'choose', optionId: 'go' }));
  assert.throws(() => s.room.requestRoll('a', s.room.snapshot().turnId));
  assert.throws(() => s.act('choose', 'made-up'));
  s.act('choose', 'refuse');
  assert.equal(s.actor().effects?.nextRollModifier, 0);
  assert.throws(() => s.act('choose', 'go'));
  s.act('continue');
  assert.equal(s.actor().effects?.nextRollModifier, -1);
  s.room.requestRoll('b', s.room.snapshot().turnId); await until(() => s.room.snapshot().phase === 'ready');
  s.room.requestRoll('c', s.room.snapshot().turnId); await until(() => s.room.snapshot().phase === 'ready');
  s.room.requestRoll('a', s.room.snapshot().turnId);
  assert.equal(s.room.snapshot().roll?.modifier, -1);
  assert.equal(s.room.snapshot().roll?.to, 5);
  assert.equal(s.actor().effects?.nextRollModifier, 0);
});

test('interview second answer applies all six dice outcomes', async t => {
  for (let value = 1; value <= 6; value++) {
    const s = await scenario(t, 'interview', [value], [4, 10, 6]);
    s.act('choose', 'go'); assert.equal(s.room.snapshot().event?.stage, 'roll');
    await s.roll();
    assert.equal(s.actor().position, 5);
    assert.equal(s.room.snapshot().event?.stage, 'result');
    s.act('continue'); assert.equal(s.room.snapshot().phase, 'ready');
    assert.equal(s.actor().position, value <= 3 ? 9 : 0);
  }
});

test('expert answer is optional, uses parity, and does not consume a normal turn modifier', async t => {
  const declined = await scenario(t, 'interview');
  declined.act('choose', 'expert'); assert.equal(declined.room.snapshot().event?.stage, 'confirm');
  declined.act('decline'); assert.equal(declined.actor().position, 5);
  for (let value = 1; value <= 6; value++) {
    const s = await scenario(t, 'interview', [value]);
    s.act('choose', 'expert'); await s.roll();
    assert.equal(s.actor().position, 5); s.act('continue');
    assert.equal(s.actor().position, value % 2 === 0 ? 5 + value : 1);
  }
});

test('documents align with the leader on odd values; even values move back and skip exactly one turn', async t => {
  for (let value = 1; value <= 6; value++) {
    const s = await scenario(t, 'documents', [value]);
    await s.roll();
    assert.equal(s.actor().position, 5); assert.equal(s.actor().effects?.skipTurns, 0);
    s.act('continue');
    assert.equal(s.actor().position, value % 2 ? 10 : 2);
    assert.equal(s.actor().effects?.skipTurns, value % 2 ? 0 : 1);
    s.room.requestRoll('b', s.room.snapshot().turnId); await until(() => s.room.snapshot().phase === 'ready');
    s.room.requestRoll('c', s.room.snapshot().turnId); await until(() => s.room.snapshot().phase === 'ready');
    assert.equal(s.room.snapshot().currentPlayerId, s.joined[value % 2 ? 0 : 1].playerId);
    assert.equal(s.actor().effects?.skipTurns, 0);
  }
});

test('conflict action handles followers, leaders, tied leaders and no player behind', async t => {
  for (const [positions, expected] of [
    [[4, 10, 6], 5], [[4, 3, 1], 3], [[4, 5, 2], 2], [[4, 5, 5], 5],
  ] as const) {
    const s = await scenario(t, 'conflict', [], [...positions]);
    assert.equal(s.actor().position, positions[0] + 1);
    assert.equal(s.room.snapshot().event?.stage, 'result');
    s.act('continue'); assert.equal(s.actor().position, expected);
  }
});

test('security only skips on 1 and 6; messenger is immediate and moves back one cell', async t => {
  for (let value = 1; value <= 6; value++) {
    const s = await scenario(t, 'security', [value]); await s.roll(); s.act('continue');
    assert.equal(s.actor().position, 5);
    assert.equal(s.actor().effects?.skipTurns, value === 1 || value === 6 ? 1 : 0);
  }
  const s = await scenario(t, 'messenger');
  assert.equal(s.actor().position, 5); assert.equal(s.actor().effects?.skipTurns, 0);
  assert.equal(s.room.snapshot().event?.stage, 'result');
  s.act('continue');
  assert.equal(s.actor().position, 4); assert.equal(s.actor().effects?.skipTurns, 1);
});

test('reviews grant +5, move only others, or give each other player two summed dice next turn', async t => {
  const bonus = await scenario(t, 'reviews'); bonus.act('choose', 'verify');
  assert.equal(bonus.actor().effects?.nextRollModifier, 0); bonus.act('continue');
  assert.equal(bonus.actor().effects?.nextRollModifier, 5);
  const move = await scenario(t, 'reviews'); move.act('choose', 'ignore');
  assert.deepEqual(move.positions(), [5, 10, 6]); move.act('continue');
  assert.deepEqual(move.positions(), [5, 8, 4]);
  const double = await scenario(t, 'reviews', [2, 6]); double.act('choose', 'reject');
  assert.deepEqual(double.room.snapshot().players.map(p => p.effects?.nextRollTwice), [false, false, false]);
  double.act('continue');
  assert.deepEqual(double.room.snapshot().players.map(p => p.effects?.nextRollTwice), [false, true, true]);
  double.room.requestRoll('b', double.room.snapshot().turnId);
  assert.deepEqual(double.room.snapshot().roll?.values, [2, 6]);
  assert.equal(double.room.snapshot().roll?.to, 18);
  assert.equal(double.room.snapshot().players[1].effects?.nextRollTwice, false);
  assert.equal(double.room.snapshot().players[2].effects?.nextRollTwice, true);
});

test('bank moves ±10 or stays; event finish clamps and completes only after all see the result', async t => {
  for (const [option, expected] of [['job', 0], ['card', 15], ['bank', 5]] as const) {
    const s = await scenario(t, 'bank'); s.act('choose', option); assert.equal(s.actor().position, 5); s.act('continue'); assert.equal(s.actor().position, expected);
  }
  const finish = await scenario(t, 'bank', [], [gameConfig.cellCount - 10, 10, 6]);
  finish.act('choose', 'card'); assert.equal(finish.actor().position, gameConfig.cellCount - 9);
  assert.equal(finish.room.snapshot().phase, 'event');
  finish.act('continue'); assert.equal(finish.room.snapshot().phase, 'finished');
  assert.equal(finish.actor().position, gameConfig.cellCount - 1);
  assert.equal(finish.room.snapshot().winnerId, finish.joined[0].playerId);
});

test('directions handle every first throw and a second forward/backward throw or move only others', async t => {
  for (let value = 1; value <= 6; value++) {
    const s = await scenario(t, 'directions', [value, 6]); await s.roll();
    if (value === 5) { assert.deepEqual(s.positions(), [5, 10, 6]); s.act('continue'); assert.deepEqual(s.positions(), [5, 13, 9]); }
    else {
      assert.equal(s.room.snapshot().event?.stage, 'roll'); await s.roll();
      assert.equal(s.actor().position, 5);
      assert.deepEqual(s.room.snapshot().event?.dice, [value, 6]);
      s.act('continue'); assert.equal(s.actor().position, [1, 3, 6].includes(value) ? 11 : 0);
    }
  }
});

test('reset, admin moves, kicks, reconnects and stale actions cannot leave an unresolved event', async t => {
  const s = await scenario(t, 'bank');
  const eventId = s.room.snapshot().event!.id;
  s.room.disconnect('a'); assert.equal(s.room.snapshot().phase, 'event');
  s.room.join('a-new', { roomId: s.room.id, token: s.joined[0].token }, 'a');
  assert.equal(s.room.snapshot().event?.id, eventId);
  assert.throws(() => s.act('choose', 'card')); // old socket
  s.room.requestEvent('a-new', { eventId, action: 'choose', optionId: 'card' });
  s.room.reset();
  assert.equal(s.room.snapshot().event, null);
  assert.equal(s.room.snapshot().players.every(p => p.position === 0 && p.effects?.nextRollModifier === 0), true);
  assert.throws(() => s.room.requestEvent('a-new', { eventId, action: 'continue' }));
  const move = await scenario(t, 'bank'); move.room.movePlayer(move.joined[1].playerId, 20);
  assert.equal(move.room.snapshot().event, null); assert.equal(move.room.snapshot().phase, 'ready');
  const kick = await scenario(t, 'bank'); kick.room.kickPlayer(kick.joined[0].playerId);
  assert.equal(kick.room.snapshot().event, null); assert.equal(kick.room.snapshot().currentPlayerId, kick.joined[1].playerId);
});

test('response timeout advances the turn without choosing an answer or applying its effect', async t => {
  const room = new GameRoom('timeout', () => {}, { portalCells: [], eventCells: [1], objectCells: new Map(), pickCard: () => 'bank', die: () => 1, rollDuration: 1, stepDuration: 0, eventTimeout: 20 });
  t.after(() => room.destroy());
  room.join('a', { roomId: room.id, character: 'witch' }); const b = room.join('b', { roomId: room.id, character: 'witch' });
  room.start();
  room.requestRoll('a', room.snapshot().turnId); await until(() => room.snapshot().phase === 'event');
  await until(() => room.snapshot().phase === 'ready');
  assert.equal(room.snapshot().players[0].position, 1); assert.equal(room.snapshot().currentPlayerId, b.playerId);
  assert.match(room.snapshot().notice ?? '', /Событие пропущено/);
});

test('generic executor clamps all movement and applies roll-based movement and modifiers to configured targets', () => {
  const players = ['a', 'b'].map((id, slot) => ({ player: { id, nickname: id, character: 'witch' as const, slot, position: 2, connected: true }, effects: emptyEffects() }));
  executeEventActions([{ type: 'move', target: 'self', steps: -100 }, { type: 'move', target: 'others', steps: 1000 }, { type: 'modifier', target: 'self', amount: -1 }], players, 'a');
  assert.equal(players[0].player.position, 0); assert.equal(players[1].player.position, gameConfig.cellCount - 1);
  executeEventActions([{ type: 'move', target: 'self', steps: { die: true, factor: 1 } }, { type: 'modifier', target: 'self', amount: 5 }], players, 'a', 4);
  assert.equal(players[0].player.position, 4); assert.equal(players[0].effects.nextRollModifier, 4);
});
test('every configured dice branch covers exactly 1–6 and every option has a unique id', () => {
  const check = (outcome: import('./events/types.js').EventOutcome) => {
    if (outcome.confirm) check(outcome.confirm);
    if (outcome.selectPlayer) check(outcome.selectPlayer.outcome);
    if (outcome.roll) {
      assert.deepEqual(outcome.roll.flatMap(branch => branch.values).sort(), [1, 2, 3, 4, 5, 6]);
      outcome.roll.forEach(branch => check(branch.outcome));
    }
  };
  for (const card of Object.values(eventCatalog)) {
    assert.ok(card.text && card.title);
    assert.equal(new Set(card.options?.map(option => option.id)).size, card.options?.length ?? 0);
    card.options?.forEach(option => { assert.ok(option.text); check(option.outcome); });
    if (card.outcome) check(card.outcome);
  }
});

test('confirmed event movement uses a shared timeline, keeps the turn locked, and supports late join', async t => {
  const room = new GameRoom('animated', () => {}, { portalCells: [], eventCells: [1], objectCells: new Map(), pickCard: () => 'bank', die: () => 1, rollDuration: 1, stepDuration: 10 });
  t.after(() => room.destroy());
  const a = room.join('a', { roomId: room.id, character: 'witch' });
  const b = room.join('b', { roomId: room.id, character: 'witch' });
  room.start();
  room.requestRoll('a', room.snapshot().turnId); await until(() => room.snapshot().phase === 'event');
  const id = room.snapshot().event!.id;
  room.requestEvent('a', { eventId: id, action: 'choose', optionId: 'card' });
  assert.equal(room.snapshot().players[0].position, 1);
  assert.equal(room.snapshot().movement, null);
  assert.equal(room.snapshot().winnerId, null);
  room.requestEvent('a', { eventId: id, action: 'continue' });
  const state = room.snapshot();
  assert.equal(state.phase, 'moving'); assert.equal(state.event, null);
  assert.equal(state.currentPlayerId, a.playerId);
  assert.equal(state.players[0].position, 1);
  assert.equal(state.movement?.moves[0].from, 1);
  assert.equal(state.movement?.moves[0].to, 11);
  assert.equal(state.movement?.moves[0].endsAt! - state.movement?.moves[0].startedAt!, 100);
  assert.throws(() => room.requestRoll('a', state.turnId));
  assert.throws(() => room.requestRoll('b', state.turnId));
  assert.throws(() => room.requestEvent('a', { eventId: id, action: 'continue' }));
  room.join('late', { roomId: room.id, character: 'witch' });
  assert.deepEqual(room.snapshot().movement, state.movement);
  await until(() => room.snapshot().phase === 'ready');
  assert.equal(room.snapshot().players[0].position, 11);
  assert.equal(room.snapshot().currentPlayerId, b.playerId);
  assert.equal(room.snapshot().movement, null);
});

test('group movement waits for confirmation and reset cancels every path and timer', async t => {
  const room = new GameRoom('group-motion', () => {}, { portalCells: [], eventCells: [1], objectCells: new Map(), pickCard: () => 'reviews', die: () => 1, rollDuration: 1, stepDuration: 10 });
  t.after(() => room.destroy());
  const players = ['a', 'b', 'c'].map(socket => room.join(socket, { roomId: room.id, character: 'witch' }));
  room.movePlayer(players[1].playerId, 11); room.movePlayer(players[2].playerId, 7);
  room.start();
  room.requestRoll('a', room.snapshot().turnId); await until(() => room.snapshot().phase === 'event');
  const id = room.snapshot().event!.id;
  room.requestEvent('a', { eventId: id, action: 'choose', optionId: 'ignore' });
  assert.deepEqual(room.snapshot().players.map(p => p.position), [1, 10, 6]);
  room.requestEvent('a', { eventId: id, action: 'continue' });
  assert.equal(room.snapshot().phase, 'moving');
  assert.deepEqual(room.snapshot().movement?.moves.map(move => [move.from, move.to]), [[10, 8], [6, 4]]);
  room.reset();
  assert.equal(room.snapshot().movement, null); assert.equal(room.snapshot().event, null);
  await delay(50);
  assert.deepEqual(room.snapshot().players.map(p => p.position), [0, 0, 0]);
  assert.equal(room.snapshot().phase, 'waiting');
});

test('a resolved consequence never auto-applies: it waits for Continue, including after reconnect', async t => {
  const room = new GameRoom('confirm-result', () => {}, { portalCells: [], eventCells: [1], objectCells: new Map(), pickCard: () => 'bank', die: () => 1, rollDuration: 1, stepDuration: 0, eventTimeout: 15 });
  t.after(() => room.destroy());
  const a = room.join('a', { roomId: room.id, character: 'witch' }); room.join('b', { roomId: room.id, character: 'witch' });
  room.start();
  room.requestRoll('a', room.snapshot().turnId); await until(() => room.snapshot().phase === 'event');
  const id = room.snapshot().event!.id;
  room.requestEvent('a', { eventId: id, action: 'choose', optionId: 'job' });
  await delay(30);
  assert.equal(room.snapshot().phase, 'event'); assert.equal(room.snapshot().players[0].position, 1);
  assert.equal(room.snapshot().event?.deadline, 0);
  room.disconnect('a');
  room.join('a-new', { roomId: room.id, token: a.token }, 'a');
  await delay(30);
  assert.equal(room.snapshot().phase, 'event'); assert.equal(room.snapshot().players[0].position, 1);
  room.requestEvent('a-new', { eventId: id, action: 'continue' });
  assert.equal(room.snapshot().players[0].position, 0);
});

test('disconnecting without confirming abandons the pending outcome instead of applying it', async t => {
  const room = new GameRoom('abandon-result', () => {}, { portalCells: [], eventCells: [1], objectCells: new Map(), pickCard: () => 'bank', die: () => 1, rollDuration: 1, stepDuration: 0, eventTimeout: 15 });
  t.after(() => room.destroy());
  room.join('a', { roomId: room.id, character: 'witch' }); room.join('b', { roomId: room.id, character: 'witch' });
  room.start();
  room.requestRoll('a', room.snapshot().turnId); await until(() => room.snapshot().phase === 'event');
  room.requestEvent('a', { eventId: room.snapshot().event!.id, action: 'choose', optionId: 'card' });
  room.disconnect('a');
  await until(() => room.snapshot().phase === 'waiting');
  assert.equal(room.snapshot().players[0].position, 1); assert.equal(room.snapshot().movement, null);
});
test('best-self moves six only after Continue and clamps at finish', async t => {
  const s = await scenario(t, 'best-self', [], [4, 10, 6]);
  assert.equal(s.room.snapshot().event?.source, 'orange');
  assert.equal(s.room.snapshot().event?.pickupId, null);
  assert.equal(s.room.snapshot().event?.stage, 'result');
  assert.deepEqual(s.positions(), [5, 10, 6]);
  s.act('continue');
  assert.deepEqual(s.positions(), [11, 10, 6]);
  assert.equal(s.room.snapshot().phase, 'ready');
  assert.equal(s.room.snapshot().event, null);
  const finish = await scenario(t, 'best-self', [], [gameConfig.cellCount - 6, 10, 6]);
  finish.act('continue');
  assert.equal(finish.actor().position, gameConfig.cellCount - 1);
  assert.equal(finish.room.snapshot().phase, 'finished');
});

test('resume-ai grants exactly two additional dice, sums all 36 pairs and leaves other players unchanged', async t => {
  for (let first = 1; first <= 6; first++) for (let second = 1; second <= 6; second++) {
    const s = await scenario(t, 'resume-ai', [first, second], [4, 10, 6]);
    assert.equal(s.room.snapshot().event?.stage, 'roll');
    assert.deepEqual(s.positions(), [5, 10, 6]);
    await s.roll();
    assert.equal(s.room.snapshot().event?.stage, 'roll');
    assert.deepEqual(s.room.snapshot().event?.dice, [first]);
    assert.deepEqual(s.positions(), [5, 10, 6]);
    await s.roll();
    assert.equal(s.room.snapshot().event?.stage, 'result');
    assert.deepEqual(s.room.snapshot().event?.dice, [first, second]);
    assert.deepEqual(s.positions(), [5, 10, 6]);
    assert.throws(() => s.act('roll'));
    s.act('continue');
    assert.deepEqual(s.positions(), [5 + first + second, 10, 6]);
    assert.equal(s.room.snapshot().event, null);
    assert.equal(s.room.snapshot().currentPlayerId, s.joined[1].playerId);
    assert.ok(s.room.snapshot().players.every(player => player.effects?.skipTurns === 0));
  }
  const finish = await scenario(t, 'resume-ai', [6, 6], [gameConfig.cellCount - 6, 10, 6]);
  await finish.roll(); await finish.roll();
  finish.act('continue');
  assert.equal(finish.actor().position, gameConfig.cellCount - 1);
  assert.equal(finish.room.snapshot().phase, 'finished');
});