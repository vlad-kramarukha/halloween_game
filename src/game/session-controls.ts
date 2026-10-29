import type { GameState } from '../../shared/game';

export function canRoll(state: GameState | null, selfId: string, connected: boolean, pending: boolean): boolean {
  return !!state && state.started && !state.paused && !!selfId && connected && !pending && state.phase === 'ready' && state.currentPlayerId === selfId;
}

export function yourTurnKey(state: GameState | null, selfId: string, connected: boolean): string | null {
  return canRoll(state, selfId, connected, false) ? JSON.stringify([state!.roomId, selfId, state!.turnId]) : null;
}