import { characterIds, type JoinRequest } from '../../shared/game';

export function readSavedSession(value: string | null, roomId: string): JoinRequest | null {
  try {
    const saved = JSON.parse(value ?? 'null');
    if (!saved || saved.roomId !== roomId || typeof saved.token !== 'string' || !saved.token.length || saved.token.length > 80
      || typeof saved.nickname !== 'string' || !characterIds.includes(saved.character)) return null;
    return { roomId, token: saved.token, nickname: saved.nickname, character: saved.character };
  } catch { return null; }
}