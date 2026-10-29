import type { GameState } from './game.js';

/** One server-clock sampler for both the board pieces and progress markers. */
export function samplePlayerMotion(state: GameState, playerId: string, now: number): { position: number; moving: boolean } {
  if (state.paused) now = state.serverTime;
  const player = state.players.find(player => player.id === playerId);
  const eventMove = state.phase === 'moving' ? state.movement?.moves.find(move => move.playerId === playerId) : null;
  const roll = state.phase === 'rolling' && state.roll?.playerId === playerId ? state.roll : null;
  const motion = eventMove ?? (roll ? { ...roll, startedAt: roll.moveAt } : null);
  if (!motion) return { position: player?.position ?? 0, moving: false };
  const fraction = Math.max(0, Math.min(1, (now - motion.startedAt) / Math.max(1, motion.endsAt - motion.startedAt)));
  return { position: motion.from + (motion.to - motion.from) * fraction,
    moving: !state.paused && motion.from !== motion.to && fraction > 0 && fraction < 1 };
}