import { test } from 'node:test';
import assert from 'node:assert/strict';
import type Phaser from 'phaser';
import scales from '../src/generated/asset-scales.json';
import { addAssetFrame } from '../src/game/rendering/asset-frame';

function recordCrop(width: number, height: number) {
  const calls: unknown[][] = [];
  const scene = { textures: { get: () => ({
    has: () => false,
    getSourceImage: () => ({ width, height, get src(): string {
      throw new Error('The loader blob URL cannot identify the original asset');
    } }),
    add: (...args: unknown[]) => calls.push(args),
  }) } } as unknown as Phaser.Scene;
  return { scene, calls };
}

test('environment crops use the prepared asset URL even when the image is loaded as a blob', () => {
  const entry = Object.entries(scales).find(([, scale]) => scale.x === .375 && scale.y === .375);
  assert.ok(entry, 'expected a 1024px environment image reduced to 384px');
  for (const url of [entry[0], `https://game.example${entry[0]}`]) {
    const { scene, calls } = recordCrop(384, 384);
    addAssetFrame(scene, 'forest-log', 'prop', { x: 140, y: 245, width: 750, height: 540 }, url);
    assert.deepEqual(calls, [['prop', 0, 53, 92, 281, 202]]);
  }
});

test('unscaled sprite-sheet frames keep their original coordinates', () => {
  const entry = Object.entries(scales).find(([, scale]) => scale.x === 1 && scale.y === 1);
  assert.ok(entry);
  const { scene, calls } = recordCrop(1024, 1024);
  addAssetFrame(scene, 'harvest', 'hay', { x: 512, y: 448, width: 256, height: 224 }, entry[0]);
  assert.deepEqual(calls, [['hay', 0, 512, 448, 256, 224]]);
});
