import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleProgress, layoutProgress } from '../src/ui/progress-layout';
import type { GameState, PlayerState } from '../shared/game';

const player = (slot: number, position: number): PlayerState => ({ id: String(slot), slot, position, nickname: `P${slot}`, character: 'ghost', connected: true });
const state = (players: PlayerState[]): GameState => ({ started: true, paused: false, roomId: 'test', revision: 1, turnId: 1, players, phase: 'ready', roll: null, winnerId: null, currentPlayerId: '0', serverTime: 1000 });

test('progress uses numbered cells, equal ranks for ties, and the configured finish', () => {
  const result = sampleProgress(state([player(0, 0), player(1, 149), player(2, 42), player(3, 42)]), 1000, 150);
  assert.deepEqual(result.map(item => [item.id, item.cell, item.rank]), [['1', 150, 1], ['2', 43, 2], ['3', 43, 2], ['0', 1, 4]]);
  assert.equal(result[0].progress, 1); assert.equal(result[3].progress, 0);
});

test('roll progress matches the server timeline and resets immediately on an admin snapshot', () => {
  const moving = state([player(0, 4)]); moving.phase = 'rolling';
  moving.roll = { id: 1, playerId: '0', value: 6, from: 4, to: 10, startedAt: 1000, moveAt: 2000, endsAt: 2600 };
  assert.equal(sampleProgress(moving, 1500, 150)[0].cell, 5);
  assert.equal(sampleProgress(moving, 2300, 150)[0].cell, 8);
  assert.equal(sampleProgress(moving, 4000, 150)[0].cell, 11);
  const reset = { ...moving, phase: 'ready' as const, roll: null, players: [player(0, 0)] };
  assert.equal(sampleProgress(reset, 4000, 150)[0].cell, 1);
});

test('every player retains an independent marker and true anchor, even together at either endpoint', () => {
  for (const positions of [Array(10).fill(0), Array(10).fill(149), [0, 5, 10, 15, 20, 60, 61, 90, 130, 149]]) {
    const players = sampleProgress(state(positions.map((position, i) => player(i, position))), 1000, 150);
    for (const width of [160, 340, 680]) {
      const markers = layoutProgress(players, width, 36);
      assert.equal(markers.length, players.length);
      assert.equal(new Set(markers.map(marker => marker.player.id)).size, players.length);
      for (const marker of markers) {
        assert.equal(marker.anchorX, marker.player.progress * width);
        assert.equal(marker.lane, marker.player.slot % 2);
        assert.ok(marker.x >= 0 && marker.x <= width);
      }
      for (let lane = 0; lane < 2; lane++) {
        const row = markers.filter(marker => marker.lane === lane);
        for (let i = 1; i < row.length; i++) assert.ok(row[i].x - row[i - 1].x >= 36 - .000001);
      }
    }
  }
});

test('a moving player keeps the same marker identity and lane when overtaking', () => {
  const before = layoutProgress(sampleProgress(state([player(0, 10), player(1, 12), player(2, 13)]), 1000, 150), 680, 36);
  const after = layoutProgress(sampleProgress(state([player(0, 16), player(1, 12), player(2, 13)]), 1000, 150), 680, 36);
  for (const marker of before) {
    const moved = after.find(item => item.player.id === marker.player.id)!;
    assert.equal(moved.lane, marker.lane);
    if (marker.player.id !== '0') assert.equal(moved.anchorX, marker.anchorX);
  }
  assert.ok(after.find(item => item.player.id === '0')!.anchorX > before.find(item => item.player.id === '0')!.anchorX);
});