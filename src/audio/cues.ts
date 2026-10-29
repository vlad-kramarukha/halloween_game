import type { GameState } from '../../shared/game';
import type { SoundEffect } from '../config/audio';
export type GameCue = SoundEffect;

const sweetSounds: Record<string, GameCue> = {
  'candy-wrapped': 'wrapped', 'candy-lollipop': 'lollipop', 'candy-chocolate': 'chocolate',
  'candy-apple': 'apple', 'candy-cupcake': 'cupcake', 'candy-cookie': 'candy',
};
export function stateCues(previous: GameState | null, next: GameState, selfId: string): GameCue[] {
  if (!previous || previous.roomId !== next.roomId) return [];
  if (next.phase === 'finished') return previous.phase !== 'finished' ? [next.winnerId === selfId ? 'victory' : 'defeat'] : [];
  if (next.paused) return !previous.paused ? ['pause'] : [];
  if (previous.paused) return ['resume'];
  if (!previous.started && next.started) return ['start'];
  if (next.phase === 'event' && next.event) {
    const event = next.event;
    if (previous.event?.id !== event.id) {
      if (event.source === 'orange') {
        // These sounds describe the card's theme, never the hidden consequence.
        return [event.cardId === 'documents' || event.cardId === 'security' || event.cardId === 'resume-ai' ? 'scan'
          : event.cardId === 'directions' || event.cardId === 'conflict' ? 'mystery' : 'card'];
      }
      const id = event.pickupId;
      return [id === 'portal' ? 'portal' : id === 'coin' ? 'coin' : id === 'ghost' || id === 'candy-ghost' ? 'ghost'
        : id === 'pumpkin' ? 'curse' : id === 'broom' ? 'broom' : id === 'potion' ? 'potion' : sweetSounds[id ?? ''] ?? 'candy'];
    }
    if (event.stage === 'rolling' && (previous.event?.stage !== 'rolling' || event.dice.length !== previous.event.dice.length)) return ['dice'];
    if (previous.event?.stage === 'rolling' && event.stage !== 'rolling') return ['land'];
    if (event.selectedPlayerId && previous.event?.selectedPlayerId !== event.selectedPlayerId) return ['target'];
    if (event.stage === 'result' && previous.event?.stage !== 'result') return ['result'];
  }
  if (next.phase === 'moving' && next.movement && previous.movement?.id !== next.movement.id) {
    const ownMove = next.movement.moves.find(move => move.playerId === next.currentPlayerId && move.from !== move.to)
      ?? next.movement.moves.find(move => move.from !== move.to);
    if (ownMove) return [ownMove.to > ownMove.from ? 'forward' : 'backward'];
  }
  if (next.phase === 'rolling' && (previous.phase !== 'rolling' || previous.roll?.id !== next.roll?.id)) return ['dice'];
  if (next.phase === 'ready' && next.currentPlayerId === selfId && (previous.phase !== 'ready' || previous.turnId !== next.turnId)) return ['turn'];
  const connected = new Set(previous.players.filter(player => player.connected).map(player => player.id));
  if (next.players.some(player => player.connected && !connected.has(player.id))) return ['join'];
  if ([...connected].some(id => !next.players.some(player => player.id === id && player.connected))) return ['leave'];
  return [];
}
