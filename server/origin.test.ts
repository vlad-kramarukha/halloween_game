import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameServer } from './app.js';

test('production rejects external polling origins and keeps same-origin clients working', async t => {
  const server = createGameServer();
  await new Promise<void>(resolve => server.httpServer.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => server.io.close(() => resolve())));
  const address = server.httpServer.address(); assert.ok(address && typeof address === 'object');
  const url = 'http://127.0.0.1:' + address.port;
  for (const origin of ['https://unrelated.example', 'null', 'malformed']) {
    const response = await fetch(url + '/socket.io/?EIO=4&transport=polling', { headers: { Origin: origin } });
    assert.equal(response.status, 403);
  }
  const own = await fetch(url + '/socket.io/?EIO=4&transport=polling', { headers: { Origin: url } });
  assert.equal(own.status, 200);
  assert.match(await own.text(), /^0/);
  const health = await fetch(url + '/api/health');
  assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(health.headers.get('referrer-policy'), 'same-origin');
});
