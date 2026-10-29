import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

test('prepared textures retain alpha and matching crop scales; sprite-sheet grid stays intact', async () => {
  const manifest = JSON.parse(await readFile('.asset-cache/manifest.json', 'utf8'));
  for (const [source, entry] of Object.entries(manifest)) {
    const original = await sharp(source).metadata();
    const prepared = await sharp('public' + entry.url).metadata();
    assert.equal(prepared.width, entry.width, source);
    assert.equal(prepared.height, entry.height, source);
    assert.equal(entry.scaleX, prepared.width / original.width, source);
    assert.equal(entry.scaleY, prepared.height / original.height, source);
    assert.ok(prepared.width <= original.width && prepared.height <= original.height, source);
    if (original.hasAlpha) assert.equal(prepared.hasAlpha, true, source);
    if (source.includes('Halloween_PumpkinPatch')) {
      assert.equal(entry.scaleX, 1); assert.equal(entry.scaleY, 1);
    }
  }
  const metrics = JSON.parse(await readFile('.asset-cache/metrics.json', 'utf8'));
  assert.ok(metrics.optimizedBytes < metrics.originalBytes * .2);
  assert.ok(metrics.optimizedRGBABytes < metrics.originalRGBABytes * .3);
});
