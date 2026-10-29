import { test } from 'node:test';
import assert from 'node:assert/strict';
import { samplePlayerMotion } from '../shared/movement';
import { sampleProgress } from '../src/ui/progress-layout';
import type { GameState } from '../shared/game';

test('event paths interpolate forward and backward for pieces and progress from the same clock', () => {
  const state: GameState = {
    started: true, paused: false, roomId: 'motion', revision: 1, turnId: 1, phase: 'moving', currentPlayerId: 'a', winnerId: null, roll: null, serverTime: 1000,
    players: ['a', 'b'].map((id, slot) => ({ id, slot, nickname: id, character: 'witch', position: slot ? 3 : 20, connected: true })),
    movement: { id: 1, endsAt: 1480, moves: [
      { playerId: 'a', from: 20, to: 18, startedAt: 1000, endsAt: 1480 },
      { playerId: 'b', from: 3, to: 5, startedAt: 1000, endsAt: 1480 },
    ] },
  };
  assert.deepEqual(samplePlayerMotion(state, 'a', 990), { position: 20, moving: false });
  assert.deepEqual(samplePlayerMotion(state, 'a', 1240), { position: 19, moving: true });
  assert.deepEqual(samplePlayerMotion(state, 'b', 1240), { position: 4, moving: true });
  assert.deepEqual(samplePlayerMotion(state, 'a', 1500), { position: 18, moving: false });
  const progress = sampleProgress(state, 1240, 150);
  assert.equal(progress.find(p => p.id === 'a')?.cell, 20);
  assert.equal(progress.find(p => p.id === 'b')?.cell, 5);
  assert.deepEqual(state.players.map(p => p.position), [20, 3]);
  state.phase = 'ready'; state.movement = null; state.players[0].position = 0;
  assert.equal(samplePlayerMotion(state, 'a', 1240).position, 0);
});