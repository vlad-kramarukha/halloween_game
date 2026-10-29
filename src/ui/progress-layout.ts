import { samplePlayerMotion } from '../../shared/movement';
import type { GameState, PlayerState } from '../../shared/game';

export type ProgressPlayer = PlayerState & { progress: number; cell: number; rank: number };
export interface ProgressMarker { player: ProgressPlayer; x: number; anchorX: number; lane: number }

/** Use the same server timeline as the pieces on the board, including a late join mid-roll. */
export function sampleProgress(state: GameState, now: number, cellCount: number): ProgressPlayer[] {
  const last = Math.max(1, cellCount - 1);
  const players = state.players.map(player => {
    const position = Math.max(0, Math.min(last, samplePlayerMotion(state, player.id, now).position));
    return { ...player, progress: position / last, cell: Math.floor(position + .000001) + 1, rank: 1 };
  }).sort((a, b) => b.progress - a.progress || a.slot - b.slot);
  players.forEach(player => { player.rank = 1 + players.filter(other => other.cell > player.cell).length; });
  return players;
}

/** Keep each player's lane stable. Separate overlapping avatars; the rail dot stays at the true position. */
export function layoutProgress(players: readonly ProgressPlayer[], width: number, gap: number): ProgressMarker[] {
  const trackWidth = Math.max(0, width);
  const result: ProgressMarker[] = [];
  for (let lane = 0; lane < 2; lane++) {
    const members = players.filter(player => player.slot % 2 === lane)
      .sort((a, b) => a.progress - b.progress || a.slot - b.slot);
    const spacing = members.length > 1 ? Math.min(gap, trackWidth / (members.length - 1)) : 0;
    const markers = members.map(player => ({ player, x: player.progress * trackWidth, anchorX: player.progress * trackWidth, lane }));
    for (let i = 1; i < markers.length; i++) markers[i].x = Math.max(markers[i].x, markers[i - 1].x + spacing);
    if (markers.length) {
      markers[markers.length - 1].x = Math.min(trackWidth, markers[markers.length - 1].x);
      for (let i = markers.length - 2; i >= 0; i--) markers[i].x = Math.min(markers[i].x, markers[i + 1].x - spacing);
    }
    result.push(...markers);
  }
  return result;
}