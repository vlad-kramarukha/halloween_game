import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cameraFit, constrainToBackground } from '../src/game/camera-fit';

test('minimum zoom covers the whole viewport without black bars on desktop and mobile', () => {
  for (const [width, height] of [[3840, 2160], [1920, 1080], [1280, 720], [390, 844], [844, 390]]) {
    const { zoom, minimum, maximum } = cameraFit(width, height, 2800, 1700, 4);
    assert.ok(2800 * zoom >= width);
    assert.ok(1700 * zoom >= height);
    assert.equal(minimum, zoom);
    assert.ok(maximum >= minimum);
    for (const factor of [1, 2, 4]) for (const [x, y] of [[-100000, -100000], [100000, 100000], [0, 1700], [2800, 0]]) {
      const z = zoom * factor;
      const safe = constrainToBackground(x, y, width, height, z, { x: 0, y: 0, width: 2800, height: 1700 });
      assert.ok(safe.x - width / (2 * z) >= -1e-8);
      assert.ok(safe.y - height / (2 * z) >= -1e-8);
      assert.ok(safe.x + width / (2 * z) <= 2800 + 1e-8);
      assert.ok(safe.y + height / (2 * z) <= 1700 + 1e-8);
    }
  }
});