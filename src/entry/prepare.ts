export async function prepareEntry(roomId: string, invitationToken?: string): Promise<void> {
  const query = new URLSearchParams({ room: roomId });
  if (invitationToken) query.set('invite', invitationToken);
  const response = await fetch('/api/entry?' + query, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
  const entry: { ok: boolean; error?: string } = await response.json();
  if (!entry.ok) throw new Error(entry.error ?? 'Для входа нужна ссылка приглашения от организатора.');
  const identity = async () => {
    const result = await fetch('/api/player', {
      method: 'POST', credentials: 'same-origin', headers: { 'X-Game-Request': '1' }, signal: AbortSignal.timeout(8000),
    });
    if (!result.ok) throw new Error('Не удалось определить игрока. Разрешите cookie и обновите страницу.');
  };
  if (navigator.locks) await navigator.locks.request('halloween-player-identity', identity);
  else await identity();
}