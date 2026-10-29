import assert from 'node:assert/strict';

export async function createTestRooms(url: string, password: string, names: string[]): Promise<Record<string, string>> {
  const login = await fetch(url + '/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Request': '1' }, body: JSON.stringify({ password }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie')!.split(';')[0];
  const invitations: Record<string, string> = {};
  for (const roomId of names) {
    const response = await fetch(url + '/api/admin/rooms', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Request': '1', Cookie: cookie }, body: JSON.stringify({ roomId }),
    });
    assert.equal(response.status, 201);
    invitations[roomId] = (await response.json()).invitationToken;
  }
  return invitations;
}
export async function startTestRoom(url: string, password: string, roomId: string) {
  const login = await fetch(url + '/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Request': '1' }, body: JSON.stringify({ password }),
  });
  assert.equal(login.status, 200);
  const response = await fetch(url + '/api/admin/rooms/' + encodeURIComponent(roomId) + '/start', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Request': '1', Cookie: login.headers.get('set-cookie')!.split(';')[0] }, body: '{}',
  });
  assert.equal(response.status, 200);
  return (await response.json()).state as import('../shared/game.js').GameState;
}