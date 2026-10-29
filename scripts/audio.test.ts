import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audioSettings } from '../src/audio/settings';
import { stateCues } from '../src/audio/cues';
import type { GameState } from '../shared/game';
import type { BoardEventState, EventPickupId } from '../shared/events';

const state = (overrides: Partial<GameState> = {}): GameState => ({
  started: true, paused: false, roomId: 'audio', revision: 1, turnId: 1, currentPlayerId: 'me',
  players: [], phase: 'ready', roll: null, winnerId: null, serverTime: 1000, ...overrides,
});
const event = (pickupId: EventPickupId | null): BoardEventState => ({
  id: 1, cardId: 'object-candy', source: 'object', pickupId, selectedPlayerId: null,
  title: '', text: '', options: [], playerId: 'me', startedAt: 1000, stage: 'roll', selectedOptionId: null,
  message: '', dice: [], rollEndsAt: null, deadline: 0,
});

test('audio settings validate saved data, clamp volume and preserve explicit mute and zero volume', () => {
  assert.deepEqual(audioSettings(null), { muted: false, music: .18, effects: .55 });
  assert.deepEqual(audioSettings('{bad'), audioSettings(null));
  assert.deepEqual(audioSettings('{"muted":true,"music":-1,"effects":8}'), { muted: true, music: 0, effects: 1 });
  assert.equal(audioSettings('{"music":0}').music, 0);
  assert.equal(audioSettings('{"music":"loud"}').music, .18);
  assert.equal(audioSettings(null, { muted: false, music: .1, effects: .3 }).music, .1);
});

test('audio does not replay historical events on join or duplicate room updates', () => {
  const rolling = state({ phase: 'rolling', roll: { id: 1, playerId: 'me', value: 2, from: 0, to: 2, startedAt: 1000, moveAt: 2600, endsAt: 3000 } });
  assert.deepEqual(stateCues(null, rolling, 'me'), []);
  assert.deepEqual(stateCues(state(), rolling, 'me'), ['dice']);
  assert.deepEqual(stateCues(rolling, { ...rolling, revision: 2 }, 'me'), []);
  assert.deepEqual(stateCues(state({ roomId: 'other' }), rolling, 'me'), []);
});

test('every pickup and orange card has an appropriate single arrival cue', () => {
  const expected = { coin: 'coin', ghost: 'ghost', 'candy-ghost': 'ghost', pumpkin: 'curse',
    broom: 'broom', potion: 'potion', portal: 'portal', 'candy-cookie': 'candy' } as const;
  for (const [id, cue] of Object.entries(expected)) {
    const next = state({ phase: 'event', event: event(id as EventPickupId) });
    assert.deepEqual(stateCues(state(), next, 'me'), [cue]);
    assert.deepEqual(stateCues(next, { ...next, revision: 2 }, 'me'), []);
  }
  const orange = { ...event(null), source: 'orange' as const, cardId: 'bank' as const };
  assert.deepEqual(stateCues(state(), state({ phase: 'event', event: orange }), 'me'), ['card']);
});

test('event dice, local turn, pause/resume and the unique winner produce no duplicated cues', () => {
  const ready = state({ phase: 'event', event: event('candy-cookie') });
  const rolling = { ...ready, event: { ...ready.event!, stage: 'rolling' as const, dice: [4] } };
  const result = { ...ready, event: { ...rolling.event, stage: 'result' as const } };
  assert.deepEqual(stateCues(ready, rolling, 'me'), ['dice']);
  assert.deepEqual(stateCues(rolling, result, 'me'), ['land']);
  assert.deepEqual(stateCues(state({ currentPlayerId: 'other' }), state({ turnId: 2 }), 'me'), ['turn']);
  assert.deepEqual(stateCues(state(), state({ paused: true }), 'me'), ['pause']);
  assert.deepEqual(stateCues(state({ paused: true }), state(), 'me'), ['resume']);
  assert.deepEqual(stateCues(state(), state({ phase: 'finished', winnerId: 'me' }), 'me'), ['victory']);
  assert.deepEqual(stateCues(state(), state({ phase: 'finished', winnerId: 'other' }), 'me'), ['defeat']);
  assert.deepEqual(stateCues(state({ phase: 'finished', winnerId: 'me' }), state({ phase: 'finished', winnerId: 'me' }), 'me'), []);
});

test('additional candy sounds differ by type and reconnects do not replay them', () => {
  const expected = { 'candy-wrapped': 'wrapped', 'candy-lollipop': 'lollipop',
    'candy-chocolate': 'chocolate', 'candy-apple': 'apple', 'candy-cupcake': 'cupcake' };
  for (const [id, cue] of Object.entries(expected)) {
    const next = state({ phase: 'event', event: event(id as EventPickupId) });
    assert.deepEqual(stateCues(state(), next, 'me'), [cue]);
    assert.deepEqual(stateCues(null, next, 'me'), []);
  }
});

test('new cues follow public result, movement and connection transitions only once', () => {
  const before = state({ phase: 'event', event: { ...event('pumpkin'), stage: 'target' } });
  const after = { ...before, event: { ...before.event!, stage: 'result' as const, selectedPlayerId: 'other' } };
  assert.deepEqual(stateCues(before, after, 'me'), ['target']);
  assert.deepEqual(stateCues(after, { ...after, revision: 3 }, 'me'), []);
  const result = { ...before, event: { ...before.event!, stage: 'result' as const } };
  assert.deepEqual(stateCues(before, result, 'me'), ['result']);
  const moving = state({ phase: 'moving', movement: { id: 1, endsAt: 2000,
    moves: [{ playerId: 'me', from: 4, to: 8, startedAt: 1000, endsAt: 2000 }] } });
  assert.deepEqual(stateCues(result, moving, 'me'), ['forward']);
  assert.deepEqual(stateCues(moving, { ...moving, revision: 3 }, 'me'), []);
  assert.deepEqual(stateCues(result, { ...moving, movement: { ...moving.movement!, moves: [
    { ...moving.movement!.moves[0], from: 8, to: 4 },
  ] } }, 'me'), ['backward']);
  assert.deepEqual(stateCues(state({ started: false }), state(), 'me'), ['start']);
  const player = { id: 'other', nickname: 'Other', character: 'skeleton' as const, slot: 1, position: 0, connected: true };
  const joined = state({ players: [player] });
  assert.deepEqual(stateCues(state(), joined, 'me'), ['join']);
  assert.deepEqual(stateCues(joined, state(), 'me'), ['leave']);
});
