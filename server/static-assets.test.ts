import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { installStaticAssets } from './static-assets.js';

test('static assets negotiate Brotli, gzip and identity with correct MIME, caching and safe paths', async t => {
  const root = await mkdtemp(join(tmpdir(), 'halloween-assets-'));
  await mkdir(join(root, 'assets')); await mkdir(join(root, 'game-assets'));
  const source = '/* prepared JS */\nconsole.log("hello");\n'.repeat(40);
  await Promise.all([
    writeFile(join(root, 'assets', 'game-hash.js'), source),
    writeFile(join(root, 'assets', 'game-hash.js.br'), brotliCompressSync(source)),
    writeFile(join(root, 'assets', 'game-hash.js.gz'), gzipSync(source)),
    writeFile(join(root, 'assets', 'plain-hash.js'), source),
    writeFile(join(root, 'game-assets', 'imagehash.webp'), 'image'),
    writeFile(join(root, 'index.html'), '<h1>entry</h1>'),
    writeFile(join(root, 'secret.txt'), 'must not be served through assets'),
  ]);
  const app = express(); installStaticAssets(app, root);
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); });
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const url = 'http://127.0.0.1:' + address.port;
  for (const [accept, expected] of [['br, gzip', 'br'], ['gzip', 'gzip'], ['br;q=0, gzip;q=1', 'gzip'],
    ['br;q=.2, gzip;q=.5, identity;q=1', null], ['identity', null]] as const) {
    const response = await fetch(url + '/assets/game-hash.js', { headers: { 'Accept-Encoding': accept } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-encoding'), expected);
    assert.match(response.headers.get('content-type')!, /javascript/);
    assert.match(response.headers.get('cache-control')!, /immutable/);
    assert.match(response.headers.get('vary')!, /Accept-Encoding/i);
    assert.equal(await response.text(), source);
  }
  const head = await fetch(url + '/assets/game-hash.js', { method: 'HEAD', headers: { 'Accept-Encoding': 'br' } });
  assert.equal(head.headers.get('content-encoding'), 'br'); assert.equal(await head.text(), '');
  const fallback = await fetch(url + '/assets/plain-hash.js', { headers: { 'Accept-Encoding': 'br' } });
  assert.equal(await fallback.text(), source);
  assert.equal(fallback.headers.get('content-encoding'), null);
  assert.equal((await fetch(url + '/assets/missing.js')).status, 404);
  assert.equal((await fetch(url + '/assets/%2e%2e%2fsecret.txt')).status, 404);
  assert.match((await fetch(url + '/game-assets/imagehash.webp')).headers.get('cache-control')!, /immutable/);
  assert.equal((await fetch(url + '/')).headers.get('cache-control'), 'no-cache');
});