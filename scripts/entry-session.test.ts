import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSavedSession } from '../src/entry/session';

test('entry restores only a valid session for the current room', () => {
  const saved = { roomId: 'team', token: 'saved-token', nickname: 'Алиса', character: 'witch' };
  assert.deepEqual(readSavedSession(JSON.stringify(saved), 'team'), saved);
  for (const value of [null, '', 'null', '42', '[]', '{"broken":', JSON.stringify({ ...saved, roomId: 'other' }),
    JSON.stringify({ ...saved, token: '' }), JSON.stringify({ ...saved, token: 'x'.repeat(81) }),
    JSON.stringify({ ...saved, character: 'invalid' }), JSON.stringify({ ...saved, nickname: 1 })]) {
    assert.equal(readSavedSession(value, 'team'), null);
  }
});