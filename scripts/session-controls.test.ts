import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { GameState } from '../shared/game';
import { canRoll, yourTurnKey } from '../src/game/session-controls';

const state = (overrides: Partial<GameState> = {}): GameState => ({
  started: true, paused: false, roomId: 'demo', revision: 1, turnId: 10, currentPlayerId: 'me',
  players: [], phase: 'ready', roll: null, winnerId: null, serverTime: 1000, ...overrides,
});

test('roll input is enabled only on a connected own ready turn without an outstanding request', () => {
  assert.equal(canRoll(state(), 'me', true, false), true);
  assert.equal(canRoll(state(), 'me', true, true), false);
  assert.equal(canRoll(state(), 'me', false, false), false);
  assert.equal(canRoll(state(), 'other', true, false), false);
  assert.equal(canRoll(state(), '', true, false), false);
  assert.equal(canRoll(null, 'me', true, false), false);
  assert.equal(canRoll(state({ started: false }), 'me', true, false), false);
  assert.equal(canRoll(state({ paused: true }), 'me', true, false), false);
  for (const phase of ['waiting', 'rolling', 'moving', 'event', 'finished'] as const) {
    assert.equal(canRoll(state({ phase }), 'me', true, false), false);
  }
});

test('ending a rejected request restores roll eligibility only if the authoritative state still permits it', () => {
  assert.equal(canRoll(state(), 'me', true, true), false);
  assert.equal(canRoll(state(), 'me', true, false), true);
  assert.equal(canRoll(state({ currentPlayerId: 'other', turnId: 11 }), 'me', true, false), false);
  assert.equal(canRoll(state({ phase: 'rolling' }), 'me', true, false), false);
});

test('turn announcements ignore unrelated snapshots and identify new turns, rooms and owners', () => {
  const key = yourTurnKey(state(), 'me', true);
  assert.ok(key);
  assert.equal(yourTurnKey(state({ revision: 2, serverTime: 2000 }), 'me', true), key);
  assert.notEqual(yourTurnKey(state({ turnId: 11 }), 'me', true), key);
  assert.notEqual(yourTurnKey(state({ roomId: 'another' }), 'me', true), key);
  assert.notEqual(yourTurnKey(state({ currentPlayerId: 'other' }), 'other', true), key);
  assert.equal(yourTurnKey(state(), 'other', true), null);
  assert.equal(yourTurnKey(state({ started: false }), 'me', true), null);
  assert.equal(yourTurnKey(state({ paused: true }), 'me', true), null);
  assert.equal(yourTurnKey(state(), 'me', false), null);
  assert.equal(yourTurnKey(state({ phase: 'event' }), 'me', true), null);
});